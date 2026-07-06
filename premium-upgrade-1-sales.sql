-- ============================================================
-- Inventory App — Premium Upgrade 1: Sales / Billing + GST
-- Aa file Supabase SQL Editor ma paste karine ek j vaar RUN
-- karvani che. (security-upgrade.sql pachhi)
--
-- Shu aave che:
--   1. business_settings  — invoice header mate dukan ni details
--   2. products ma hsn_code + gst_rate
--   3. customers table
--   4. sales + sale_items tables (GST invoice)
--   5. create_sale RPC — atomic billing + stock out
-- ============================================================

-- ---------- 1. BUSINESS SETTINGS (single row) ----------
create table if not exists public.business_settings (
  id int primary key default 1 check (id = 1),
  name text not null default '',
  address text not null default '',
  phone text not null default '',
  gstin text not null default '',
  invoice_prefix text not null default 'INV',
  updated_at timestamptz not null default now()
);

insert into public.business_settings (id) values (1)
on conflict (id) do nothing;

alter table public.business_settings enable row level security;

drop policy if exists "business_settings select" on public.business_settings;
create policy "business_settings select" on public.business_settings
  for select to authenticated using (true);
drop policy if exists "business_settings update admin" on public.business_settings;
create policy "business_settings update admin" on public.business_settings
  for update to authenticated using (public.is_admin());

-- ---------- 2. PRODUCTS: GST COLUMNS ----------
alter table public.products add column if not exists hsn_code text;
alter table public.products add column if not exists gst_rate numeric not null default 0;

-- current_stock view ma navi columns add karvi pade —
-- low_stock 'select *' vaparto hova thi banne recreate karvi padse
drop view if exists public.low_stock;
drop view if exists public.current_stock;

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
  ), 0) * p.purchase_price as stock_value,
  p.hsn_code,
  p.gst_rate
from public.products p
left join public.stock_movements m on m.product_id = p.id
group by p.id;

create view public.low_stock
with (security_invoker = on) as
select * from public.current_stock
where is_active = true and stock <= min_stock_level;

grant select on public.current_stock to authenticated;
grant select on public.low_stock to authenticated;

-- ---------- 3. CUSTOMERS ----------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  gstin text,
  created_at timestamptz not null default now()
);

alter table public.customers enable row level security;

drop policy if exists "customers select" on public.customers;
create policy "customers select" on public.customers
  for select to authenticated using (true);
drop policy if exists "customers insert" on public.customers;
create policy "customers insert" on public.customers
  for insert to authenticated with check (true);
drop policy if exists "customers update" on public.customers;
create policy "customers update" on public.customers
  for update to authenticated using (true);
drop policy if exists "customers delete admin" on public.customers;
create policy "customers delete admin" on public.customers
  for delete to authenticated using (public.is_admin());

-- ---------- 4. SALES + SALE ITEMS ----------
create sequence if not exists public.invoice_seq;

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  customer_id uuid references public.customers (id) on delete set null,
  status text not null default 'paid'
    check (status in ('paid', 'unpaid', 'partial')),
  payment_method text not null default 'cash',
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  tax_total numeric not null default 0,
  grand_total numeric not null default 0,
  paid_amount numeric not null default 0,
  note text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists sales_created_idx on public.sales (created_at desc);
create index if not exists sales_customer_idx on public.sales (customer_id);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  -- Snapshot columns: product pachhi thi badlay to pan invoice same rahe
  product_name text not null,
  hsn_code text,
  unit text not null default 'pcs',
  quantity numeric not null,
  price numeric not null,
  gst_rate numeric not null default 0,
  line_total numeric not null
);

create index if not exists sale_items_sale_idx on public.sale_items (sale_id);

alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

drop policy if exists "sales select" on public.sales;
create policy "sales select" on public.sales
  for select to authenticated using (true);
drop policy if exists "sales insert" on public.sales;
create policy "sales insert" on public.sales
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "sale_items select" on public.sale_items;
create policy "sale_items select" on public.sale_items
  for select to authenticated using (true);
drop policy if exists "sale_items insert" on public.sale_items;
create policy "sale_items insert" on public.sale_items
  for insert to authenticated with check (true);

-- Sales edit/delete koi nahi — audit trail safe.
-- (Void/return flow pachhi na upgrade ma aavshe.)

-- Stock movements ne sale sathe link karva
alter table public.stock_movements
  add column if not exists sale_id uuid references public.sales (id) on delete set null;

-- ---------- 5. CREATE_SALE RPC ----------
-- Ek j transaction ma: stock check → sale insert → items insert →
-- stock out movements. Vachche koi fail thay to badhu rollback.
create or replace function public.create_sale(
  p_items jsonb,                    -- [{product_id, quantity, price}]
  p_customer_id uuid default null,
  p_discount numeric default 0,
  p_payment_method text default 'cash',
  p_paid_amount numeric default null,  -- null = full paid
  p_note text default null
)
returns json
language plpgsql
security invoker set search_path = public
as $$
declare
  v_sale_id uuid;
  v_invoice_no text;
  v_item record;
  v_product record;
  v_stock numeric;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_grand numeric;
  v_paid numeric;
  v_status text;
  v_line numeric;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Sale ma ochha ma ochhi 1 item joie';
  end if;

  if coalesce(p_discount, 0) < 0 then
    raise exception 'Discount negative na hoi shake';
  end if;

  -- Pehla badha products lock karo (product_id order ma — deadlock na thay)
  for v_item in
    select (i ->> 'product_id')::uuid as product_id,
           (i ->> 'quantity')::numeric as quantity,
           (i ->> 'price')::numeric as price
    from jsonb_array_elements(p_items) i
    order by (i ->> 'product_id')
  loop
    if v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'Quantity 0 thi vadhare hovi joie';
    end if;
    if v_item.price is null or v_item.price < 0 then
      raise exception 'Price valid nathi';
    end if;

    perform pg_advisory_xact_lock(hashtext(v_item.product_id::text));

    select coalesce(stock, 0) into v_stock
    from public.current_stock
    where product_id = v_item.product_id;

    if not found then
      raise exception 'Product not found';
    end if;

    select name into v_product from public.products where id = v_item.product_id;

    if v_stock < v_item.quantity then
      raise exception '"%" no stock ochho che (available: %)', v_product.name, v_stock;
    end if;
  end loop;

  -- Invoice number: PREFIX-YYMM-0001
  select bs.invoice_prefix || '-' || to_char(now(), 'YYMM') || '-'
         || lpad(nextval('public.invoice_seq')::text, 4, '0')
  into v_invoice_no
  from public.business_settings bs
  where bs.id = 1;

  -- Totals
  for v_item in
    select (i ->> 'product_id')::uuid as product_id,
           (i ->> 'quantity')::numeric as quantity,
           (i ->> 'price')::numeric as price
    from jsonb_array_elements(p_items) i
  loop
    select gst_rate into v_product from public.products where id = v_item.product_id;
    v_line := round(v_item.quantity * v_item.price, 2);
    v_subtotal := v_subtotal + v_line;
    v_tax := v_tax + round(v_line * coalesce(v_product.gst_rate, 0) / 100, 2);
  end loop;

  v_grand := round(v_subtotal + v_tax - coalesce(p_discount, 0), 2);
  if v_grand < 0 then
    raise exception 'Discount total karta vadhare na hoi shake';
  end if;

  v_paid := coalesce(p_paid_amount, v_grand);
  if v_paid < 0 then v_paid := 0; end if;
  if v_paid > v_grand then v_paid := v_grand; end if;
  v_status := case
    when v_paid >= v_grand then 'paid'
    when v_paid = 0 then 'unpaid'
    else 'partial'
  end;

  insert into public.sales
    (invoice_no, customer_id, status, payment_method, subtotal,
     discount, tax_total, grand_total, paid_amount, note, created_by)
  values
    (v_invoice_no, p_customer_id, v_status, p_payment_method, v_subtotal,
     coalesce(p_discount, 0), v_tax, v_grand, v_paid, p_note, auth.uid())
  returning id into v_sale_id;

  -- Items + stock out movements
  for v_item in
    select (i ->> 'product_id')::uuid as product_id,
           (i ->> 'quantity')::numeric as quantity,
           (i ->> 'price')::numeric as price
    from jsonb_array_elements(p_items) i
  loop
    select name, hsn_code, unit, gst_rate into v_product
    from public.products where id = v_item.product_id;

    insert into public.sale_items
      (sale_id, product_id, product_name, hsn_code, unit,
       quantity, price, gst_rate, line_total)
    values
      (v_sale_id, v_item.product_id, v_product.name, v_product.hsn_code,
       v_product.unit, v_item.quantity, v_item.price,
       coalesce(v_product.gst_rate, 0),
       round(v_item.quantity * v_item.price, 2));

    insert into public.stock_movements
      (product_id, type, quantity, reason, created_by, sale_id)
    values
      (v_item.product_id, 'out', v_item.quantity,
       'Sale ' || v_invoice_no, auth.uid(), v_sale_id);
  end loop;

  return json_build_object(
    'sale_id', v_sale_id,
    'invoice_no', v_invoice_no,
    'grand_total', v_grand
  );
end;
$$;
