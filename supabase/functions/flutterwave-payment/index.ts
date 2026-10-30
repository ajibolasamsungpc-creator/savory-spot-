import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: corsHeaders });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ success: false, message: "Method not allowed." }, 405);
  }

  try {
    const secretKey = Deno.env.get("FLW_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!secretKey || !supabaseUrl || !serviceRoleKey) {
      throw new Error("Payment service configuration is incomplete.");
    }

    const body = await req.json();
    const { email, name, phone, address, items, orderId, redirectUrl } = body;

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    if (
      typeof email !== "string" || !email.trim() ||
      typeof name !== "string" || !name.trim() ||
      typeof phone !== "string" || !phone.trim() ||
      typeof address !== "string" || !address.trim() ||
      typeof orderId !== "string" || !uuidPattern.test(orderId) ||
      !Array.isArray(items) || items.length === 0 || items.length > 50 ||
      typeof redirectUrl !== "string"
    ) {
      return json({
        success: false,
        message: "Valid customer and order details are required.",
      }, 400);
    }

    const callback = new URL(redirectUrl);

    if (
      callback.pathname !== "/payment/callback" ||
      (callback.protocol !== "https:" &&
        callback.hostname !== "localhost" &&
        callback.hostname !== "127.0.0.1")
    ) {
      return json(
        { success: false, message: "Invalid payment callback URL." },
        400,
      );
    }

    callback.searchParams.set("orderId", orderId);

    const requestedItems = items.map((item: Record<string, unknown>) => {
      if (
        !item ||
        typeof item.id !== "string" ||
        !uuidPattern.test(item.id) ||
        !Number.isInteger(item.quantity) ||
        (item.quantity as number) < 1 ||
        (item.quantity as number) > 50
      ) {
        throw new Error("One or more cart items are invalid.");
      }

      return {
        id: item.id,
        quantity: item.quantity as number,
      };
    });

    const itemIds = requestedItems.map((item) => item.id);

    if (new Set(itemIds).size !== itemIds.length) {
      return json({
        success: false,
        message: "Duplicate cart items are not allowed.",
      }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Retrieve real prices and names from the database.
    const { data: menuItems, error: menuError } = await supabase
      .from("menu_items")
      .select("id, name, price, available")
      .in("id", itemIds);

    if (menuError) {
      console.error("Menu lookup failed:", {
        code: menuError.code,
        message: menuError.message,
      });

      if (
        menuError.code === "42P01" ||
        menuError.code === "PGRST205" ||
        menuError.code === "PGRST202"
      ) {
        return json({
          success: false,
          message:
            "The menu database is not set up. Apply the Supabase migrations with `npx supabase db push`, then retry checkout.",
        }, 503);
      }

      if (menuError.code === "42501") {
        return json({
          success: false,
          message:
            "The payment service cannot read menu prices. Check the Supabase service-role configuration and menu table permissions.",
        }, 503);
      }

      return json({
        success: false,
        message: `Could not verify menu prices (database error ${
          menuError.code || "unknown"
        }). Check the Supabase Edge Function logs.`,
      }, 503);
    }

    if (!menuItems || menuItems.length !== requestedItems.length) {
      return json({
        success: false,
        message: "Some food items are no longer available.",
      }, 400);
    }

    const orderItems = requestedItems.map((requested) => {
      const menuItem = menuItems.find((item) => item.id === requested.id);

      if (!menuItem || !menuItem.available) {
        throw new Error("One or more selected food items are unavailable.");
      }

      const price = Number(menuItem.price);

      if (!Number.isFinite(price) || price <= 0) {
        throw new Error("A menu item has an invalid price.");
      }

      return {
        id: menuItem.id,
        name: menuItem.name,
        price,
        quantity: requested.quantity,
      };
    });

    const amount = orderItems.reduce(
      (total, item) => total + item.price * item.quantity,
      0,
    );

    if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) {
      return json(
        { success: false, message: "The order total is invalid." },
        400,
      );
    }

    const transactionReference = `SAVORY-${crypto.randomUUID()}`;

    const { error: insertError } = await supabase.from("orders").insert({
      id: orderId,
      customer_name: name.trim().slice(0, 120),
      customer_email: email.trim().toLowerCase().slice(0, 254),
      customer_phone: phone.trim().slice(0, 40),
      delivery_address: address.trim().slice(0, 500),
      items: orderItems,
      subtotal: amount,
      payment_reference: transactionReference,
    });

    if (insertError) {
      console.error("Could not save order:", insertError);
      return json(
        { success: false, message: "Could not save your order." },
        500,
      );
    }

    const paymentResponse = await fetch(
      "https://api.flutterwave.com/v3/payments",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tx_ref: transactionReference,
          amount: amount.toFixed(2),
          currency: "NGN",
          redirect_url: callback.toString(),
          customer: {
            email: email.trim().toLowerCase(),
            name: name.trim(),
            phonenumber: phone.trim(),
          },
          meta: { order_id: orderId },
          customizations: {
            title: "Savory Spot",
            description: "Food order payment",
          },
        }),
      },
    );

    const responseText = await paymentResponse.text();
    let result: Record<string, unknown> = {};
    try {
      result = JSON.parse(responseText);
    } catch {
      console.error(
        "Flutterwave returned a non-JSON response:",
        paymentResponse.status,
      );
    }

    const responseData = result.data && typeof result.data === "object"
      ? result.data as Record<string, unknown>
      : null;

    if (
      !paymentResponse.ok ||
      result.status !== "success" ||
      typeof responseData?.link !== "string"
    ) {
      const flutterwaveMessage = typeof result.message === "string"
        ? result.message
        : `Flutterwave returned HTTP ${paymentResponse.status}.`;
      console.error("Flutterwave initialization failed:", {
        status: paymentResponse.status,
        message: flutterwaveMessage,
      });

      const { error: orderUpdateError } = await supabase
        .from("orders")
        .update({ payment_status: "failed" })
        .eq("id", orderId)
        .eq("payment_status", "pending");

      if (orderUpdateError) {
        console.error(
          "Could not mark order payment as failed:",
          orderUpdateError,
        );
      }

      return json({
        success: false,
        message:
          `Flutterwave could not initialize payment: ${flutterwaveMessage}`,
      }, 502);
    }

    return json({
      success: true,
      paymentUrl: responseData.link,
      orderId,
    });
  } catch (error) {
    console.error("Payment initialization error:", error);

    return json({
      success: false,
      message: error instanceof Error
        ? error.message
        : "Payment initialization failed.",
    }, 500);
  }
});
