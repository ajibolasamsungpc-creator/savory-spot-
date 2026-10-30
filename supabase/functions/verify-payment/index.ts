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
      throw new Error("Payment verification is not configured.");
    }

    const body = await req.json();
    const { orderId, transactionId } = body;

    if (
      typeof orderId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId) ||
      !/^\d+$/.test(String(transactionId ?? ""))
    ) {
      return json({
        success: false,
        message: "A valid order and transaction are required.",
      }, 400);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, customer_email, subtotal, payment_reference, payment_status")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError) throw orderError;

    if (!order) {
      return json({ success: false, message: "Order not found." }, 404);
    }

    if (order.payment_status === "paid") {
      return json({ success: true, orderId: order.id });
    }

    if (order.payment_status !== "pending") {
      return json({
        success: false,
        message: "This order cannot be paid again. Please contact the restaurant.",
      }, 409);
    }

    const verificationResponse = await fetch(
      `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(String(transactionId))}/verify`,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    const verification = await verificationResponse.json();
    const transaction = verification?.data;

    const transactionAmount = Number(transaction?.amount);
    const orderAmount = Number(order.subtotal);

    const paid =
      verificationResponse.ok &&
      verification.status === "success" &&
      transaction?.status === "successful" &&
      transaction?.tx_ref === order.payment_reference &&
      String(transaction?.currency).toUpperCase() === "NGN" &&
      Number.isFinite(transactionAmount) &&
      transactionAmount > 0 &&
      transactionAmount >= orderAmount &&
      String(transaction?.customer?.email || "").trim().toLowerCase() ===
        order.customer_email.trim().toLowerCase();

    if (!paid) {
      const failed =
        transaction?.status === "failed" ||
        transaction?.status === "cancelled";

      if (failed) {
        const { error } = await supabase
          .from("orders")
          .update({ payment_status: "failed" })
          .eq("id", order.id)
          .eq("payment_status", "pending");

        if (error) throw error;
      }

      return json({
        success: false,
        message: "Payment has not been confirmed.",
      }, 400);
    }

    const { data: existingTransaction, error: lookupError } =
      await supabase
        .from("orders")
        .select("id")
        .eq("flutterwave_transaction_id", String(transactionId))
        .maybeSingle();

    if (lookupError) throw lookupError;

    if (existingTransaction && existingTransaction.id !== order.id) {
      return json({
        success: false,
        message: "This transaction has already been used.",
      }, 409);
    }

    const { data: updatedOrder, error: updateError } = await supabase
      .from("orders")
      .update({
        payment_status: "paid",
        status: "confirmed",
        flutterwave_transaction_id: String(transactionId),
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("payment_status", "pending")
      .select("id")
      .maybeSingle();

    if (updateError) throw updateError;

    if (!updatedOrder) {
      return json({
        success: false,
        message: "Order payment status changed. Please refresh and check your order.",
      }, 409);
    }

    return json({
      success: true,
      orderId: updatedOrder.id,
    });

  } catch (error) {
    console.error("Payment verification error:", error);

    return json({
      success: false,
      message: "Unable to verify payment right now.",
    }, 500);
  }
});
