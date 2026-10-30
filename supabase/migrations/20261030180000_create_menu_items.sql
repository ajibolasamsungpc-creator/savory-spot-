create table if not exists public.menu_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  category text not null check (char_length(category) between 1 and 40),
  description text not null default '' check (char_length(description) <= 240),
  price numeric(12, 2) not null check (price > 0),
  image_url text not null default '',
  available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists menu_items_available_created_at_idx
  on public.menu_items (available, created_at);

alter table public.menu_items enable row level security;

drop policy if exists "Anyone can view available menu items"
  on public.menu_items;

create policy "Anyone can view available menu items"
  on public.menu_items
  for select
  to anon, authenticated
  using (available = true);

revoke all on public.menu_items from anon, authenticated;
grant select on public.menu_items to anon, authenticated;
grant all on public.menu_items to service_role;

with seed_items (
  id,
  name,
  category,
  description,
  price,
  image_url
) as (
  values
  (
    '10000000-0000-4000-8000-000000000001',
    'Semo and Vegetable Soup',
    'Swallow',
    'Flavorful Nigerian semo and vegetable soup with rich spices.',
    3500,
    'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?auto=format&fit=crop&w=800&q=80'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'Grilled Chicken',
    'Grills',
    'Juicy grilled chicken, seasoned to perfection.',
    5000,
    'https://images.unsplash.com/photo-1532550907401-a500c9a57435?auto=format&fit=crop&w=800&q=80'
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'Beef Burger',
    'Fast Food',
    'A delicious burger stacked with fresh toppings.',
    4500,
    'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80'
  ),
  (
    '10000000-0000-4000-8000-000000000004',
    'Pasta Special',
    'Pasta',
    'Pasta with herbs and savory seasoning.',
    4000,
    'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?auto=format&fit=crop&w=800&q=80'
  ),
  (
    '10000000-0000-4000-8000-000000000005',
    'Fresh Salad',
    'Healthy',
    'Fresh greens and seasonal vegetables.',
    3000,
    'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=800&q=80'
  ),
  (
    '10000000-0000-4000-8000-000000000006',
    'Pancake Stack',
    'Breakfast',
    'Fluffy pancakes served with sweet toppings.',
    2500,
    'https://images.unsplash.com/photo-1528207776546-365bb710ee93?auto=format&fit=crop&w=800&q=80'
  )
)
insert into public.menu_items
  (id, name, category, description, price, image_url)
select
  seed_items.id::uuid,
  seed_items.name,
  seed_items.category,
  seed_items.description,
  seed_items.price,
  seed_items.image_url
from seed_items
where not exists (
  select 1
  from public.menu_items existing
  where existing.name = seed_items.name
)
on conflict (id) do nothing;
