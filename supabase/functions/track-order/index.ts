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
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Order tracking is not configured.");
    }

    const { orderId, email } = await req.json();
    if (
      typeof orderId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId) ||
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      return json(
        { success: false, message: "Enter a valid order reference and email." },
        400,
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: order, error } = await supabase
      .from("orders")
      .select("id, customer_email, items, subtotal, payment_status, status, created_at, updated_at")
      .eq("id", orderId)
      .eq("customer_email", email.trim().toLowerCase())
      .maybeSingle();

    if (error) throw error;
    if (!order) {
      return json(
        {
          success: false,
          message: "No order matches that reference and email.",
        },
      );
    }

    return json({
      success: true,
      order: {
        id: order.id,
        items: order.items,
        subtotal: order.subtotal,
        payment_status: order.payment_status,
        status: order.status,
        created_at: order.created_at,
        updated_at: order.updated_at,
      },
    });
  } catch (error) {
    console.error("Order lookup error:", error);
    return json(
      { success: false, message: "Unable to load the order right now." },
      500,
    );
  }
});
