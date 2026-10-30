import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: corsHeaders });
const allowedStatuses = [
  "confirmed",
  "preparing",
  "out_for_delivery",
  "delivered",
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ success: false, message: "Method not allowed." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const adminEmails = (Deno.env.get("ADMIN_EMAILS") || "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    if (!supabaseUrl || !serviceRoleKey || adminEmails.length === 0) {
      throw new Error("Order administration is not configured.");
    }

    const authorization = req.headers.get("Authorization");
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) {
      return json(
        { success: false, message: "Sign in as an administrator." },
        401,
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: authError } = await supabase.auth.getUser(
      token,
    );
    if (
      authError ||
      !userData.user?.email ||
      !adminEmails.includes(userData.user.email.toLowerCase())
    ) {
      return json(
        { success: false, message: "Administrator access required." },
        403,
      );
    }

    let body: Record<string, unknown>;
    try {
      const parsedBody = await req.json();
      if (
        !parsedBody || typeof parsedBody !== "object" ||
        Array.isArray(parsedBody)
      ) {
        return json(
          { success: false, message: "Request body is required." },
          400,
        );
      }
      body = parsedBody as Record<string, unknown>;
    } catch {
      return json({
        success: false,
        message: "Request body must be valid JSON.",
      }, 400);
    }

    if (body.action === "list") {
      const { data: orders, error } = await supabase
        .from("orders")
        .select(
          "id, customer_name, customer_email, customer_phone, delivery_address, items, subtotal, status, created_at",
        )
        .eq("payment_status", "paid")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return json({ success: true, orders });
    }

    if (body.action === "add-menu-item") {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      const category = typeof body.category === "string"
        ? body.category.trim()
        : "";
      const description = typeof body.description === "string"
        ? body.description.trim()
        : "";
      const image = typeof body.image === "string" ? body.image.trim() : "";
      const price = body.price;

      if (
        !name ||
        name.length > 80 ||
        !category ||
        category.length > 40 ||
        description.length > 240 ||
        typeof price !== "number" ||
        !Number.isFinite(price) ||
        price <= 0 ||
        price > 100_000_000 ||
        image.length > 2048
      ) {
        return json(
          { success: false, message: "Invalid menu item details." },
          400,
        );
      }

      if (image) {
        let imageUrl: URL;
        try {
          imageUrl = new URL(image);
        } catch {
          return json(
            { success: false, message: "Enter a valid image URL." },
            400,
          );
        }
        if (imageUrl.protocol !== "https:" && imageUrl.protocol !== "http:") {
          return json(
            { success: false, message: "Enter a valid image URL." },
            400,
          );
        }
      }

      const { data: menuItem, error } = await supabase
        .from("menu_items")
        .insert({
          name,
          category,
          price,
          image_url: image,
          description,
          available: true,
        })
        .select("id, name, description, price, image_url, category")
        .single();

      if (error) throw error;
      return json({ success: true, menuItem });
    }

    if (
      body.action !== "update" ||
      typeof body.orderId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(body.orderId) ||
      typeof body.status !== "string" ||
      !allowedStatuses.includes(body.status)
    ) {
      return json({ success: false, message: "Invalid order update." }, 400);
    }

    const { data: order, error } = await supabase
      .from("orders")
      .update({
        status: body.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.orderId)
      .eq("payment_status", "paid")
      .select("id, status")
      .maybeSingle();

    if (error) throw error;
    if (!order) {
      return json({ success: false, message: "Paid order not found." }, 404);
    }
    return json({ success: true, order });
  } catch (error) {
    console.error("Order administration error:", error);
    return json(
      { success: false, message: "Unable to manage orders right now." },
      500,
    );
  }
});
