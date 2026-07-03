-- ============================================================
-- Inventory App — Supabase schema
-- Aa file Supabase Dashboard → SQL Editor ma paste karine
-- ek j vaar RUN karvani che.
-- ============================================================

-- ---------- 1. PROFILES ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now()
);

-- Navo user signup kare tyare auto profile banavva mate trigger
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 2. CATEGORIES ----------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- ---------- 3. SUPPLIERS ----------
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  created_at timestamptz not null default now()
);

-- ---------- 4. PRODUCTS ----------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text unique,
  barcode text unique,
  category_id uuid references public.categories (id) on delete set null,
  unit text not null default 'pcs',
  purchase_price numeric not null default 0,
  selling_price numeric not null default 0,
  min_stock_level numeric not null default 0,
  image_url text,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at auto-update trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ---------- 5. STOCK MOVEMENTS ----------
create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  type text not null check (type in ('in', 'out', 'adjustment')),
  quantity numeric not null,
  reason text,
  supplier_id uuid references public.suppliers (id) on delete set null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index stock_movements_product_idx on public.stock_movements (product_id);
create index stock_movements_created_idx on public.stock_movements (created_at desc);

-- ---------- 6. VIEWS ----------
-- current_stock: dar product nu aajnu stock + value
create view public.current_stock
with (security_invoker = on) as
select
  p.id as product_id,
  p.name,
  p.sku,
  p.barcode,
  p.unit,
  p.min_stock_level,
  p.selling_price,
  p.purchase_price,
  p.category_id,
  p.is_active,
  coalesce(sum(
    case m.type
      when 'in' then m.quantity
      when 'out' then -m.quantity
      else m.quantity  -- adjustment: signed quantity
    end
  ), 0) as stock,
  coalesce(sum(
    case m.type
      when 'in' then m.quantity
      when 'out' then -m.quantity
      else m.quantity
    end
  ), 0) * p.purchase_price as stock_value
from public.products p
left join public.stock_movements m on m.product_id = p.id
group by p.id;

-- low_stock: stock je min level thi niche hoy
create view public.low_stock
with (security_invoker = on) as
select * from public.current_stock
where is_active = true and stock <= min_stock_level;

-- ---------- 7. RPC FUNCTIONS ----------
-- Barcode scan karta product shodhva mate
create or replace function public.lookup_barcode(p_barcode text)
returns json
language plpgsql
security invoker set search_path = public
as $$
declare
  v_product record;
begin
  select * into v_product
  from public.current_stock
  where barcode = p_barcode and is_active = true
  limit 1;

  if not found then
    return json_build_object('found', false, 'barcode', p_barcode);
  end if;

  return json_build_object('found', true, 'product', row_to_json(v_product));
end;
$$;

-- Stock movement record karva mate (in / out / adjustment)
create or replace function public.record_movement(
  p_product_id uuid,
  p_type text,
  p_quantity numeric,
  p_reason text default null,
  p_supplier_id uuid default null
)
returns json
language plpgsql
security invoker set search_path = public
as $$
declare
  v_movement_id uuid;
  v_current numeric;
  v_new numeric;
begin
  if p_type not in ('in', 'out', 'adjustment') then
    raise exception 'Invalid movement type: %', p_type;
  end if;

  if p_quantity <= 0 and p_type <> 'adjustment' then
    raise exception 'Quantity 0 thi vadhare hovi joie';
  end if;

  select coalesce(stock, 0) into v_current
  from public.current_stock
  where product_id = p_product_id;

  if not found then
    raise exception 'Product not found';
  end if;

  if p_type = 'out' and v_current < p_quantity then
    raise exception 'Stock ochho che (available: %)', v_current;
  end if;

  insert into public.stock_movements
    (product_id, type, quantity, reason, supplier_id, created_by)
  values
    (p_product_id, p_type, p_quantity, p_reason, p_supplier_id, auth.uid())
  returning id into v_movement_id;

  v_new := v_current + case p_type
    when 'in' then p_quantity
    when 'out' then -p_quantity
    else p_quantity
  end;

  return json_build_object('movement_id', v_movement_id, 'new_stock', v_new);
end;
$$;

-- ---------- 8. ROW LEVEL SECURITY ----------
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;

-- Profiles: badha logged-in users vanchi shake, potanu j update kari shake
create policy "profiles select" on public.profiles
  for select to authenticated using (true);
create policy "profiles update own" on public.profiles
  for update to authenticated using (id = auth.uid());

-- Categories / Suppliers / Products / Movements:
-- logged-in users badhu kari shake (roles pachi thi tight kari shakay)
create policy "categories all" on public.categories
  for all to authenticated using (true) with check (true);
create policy "suppliers all" on public.suppliers
  for all to authenticated using (true) with check (true);
create policy "products all" on public.products
  for all to authenticated using (true) with check (true);
create policy "movements select" on public.stock_movements
  for select to authenticated using (true);
create policy "movements insert" on public.stock_movements
  for insert to authenticated with check (created_by = auth.uid());

-- Views na grants
grant select on public.current_stock to authenticated;
grant select on public.low_stock to authenticated;
