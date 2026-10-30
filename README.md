# Savory Spot

## Order tracking and payment setup

Order tracking stores an order before redirecting the customer to Flutterwave.
The payment callback is verified against Flutterwave on the server before the
order is marked paid. Customers can then track its fulfilment status at
`/track` using the order reference and checkout email. Administrators update
paid-order statuses and menu items from `/admin/dashboard`. The storefront and
payment function use the same Supabase `menu_items` table, so prices are checked
against the database before a payment is created.

To enable the feature on a Supabase project:

1. Apply the database migrations with `npx supabase db push`. This creates and
   seeds the menu table as well as the orders table.
2. Set the server-only secrets `FLW_SECRET_KEY` and `ADMIN_EMAILS` (a
   comma-separated list of administrator login emails):
   `npx supabase secrets set FLW_SECRET_KEY=... ADMIN_EMAILS=...`
3. Deploy the Edge Functions:
   `npx supabase functions deploy flutterwave-payment`
   `npx supabase functions deploy verify-payment`
   `npx supabase functions deploy track-order`
   `npx supabase functions deploy admin-orders`
4. Configure the production web host to serve the SPA entry point for
   `/payment/callback`, `/track`, and `/admin/dashboard`.

Do not expose the Flutterwave secret key or Supabase service-role key in the
browser environment.

## Vite development

This project uses React and Vite. Run `npm run dev` for local development.
