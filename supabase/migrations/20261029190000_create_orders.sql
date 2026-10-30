create table if not exists public.orders (
  id uuid primary key,
  customer_name text not null,
  customer_email text not null,
  customer_phone text not null,
  delivery_address text not null,
  items jsonb not null,
  subtotal numeric(12, 2) not null check (subtotal > 0),
  payment_reference text not null unique,
  flutterwave_transaction_id text,
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid', 'failed')),
  status text not null default 'pending_payment'
    check (status in (
      'pending_payment',
      'confirmed',
      'preparing',
      'out_for_delivery',
      'delivered'
    )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_customer_lookup_idx
  on public.orders (id, customer_email);

create index if not exists orders_created_at_idx
  on public.orders (created_at desc);

alter table public.orders enable row level security;

revoke all on public.orders from anon, authenticated;
grant all on public.orders to service_role;
