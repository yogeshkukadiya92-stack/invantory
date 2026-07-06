-- ============================================================
-- Inventory App — Premium Upgrade 5: Sale Returns + Analytics
-- Aa file Supabase SQL Editor ma paste karine ek j vaar RUN
-- karvani che. (premium-upgrade-4-locations-batches.sql pachhi)
--
-- Shu aave che:
--   1. sale_returns + sale_return_items (credit notes)
--   2. create_sale_return RPC — stock pacho 'in' thay
--   3. sale_items ma cost snapshot (sachi profit ganatri mate)
--   4. sale_items_dated view (analytics queries mate)
-- ============================================================

-- ---------- 1. SALE RETURNS ----------
create sequence if not exists public.cn_seq;

create table if not exists public.sale_returns (
  id uuid primary key default gen_random_uuid(),
  return_no text not null unique,
  sale_id uuid not null references public.sales (id) on delete cascade,
  reason text,
  subtotal numeric not null default 0,
  tax_total numeric not null default 0,
  total numeric not null default 0,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists sale_returns_sale_idx on public.sale_returns (sale_id);
create index if not exists sale_returns_created_idx on public.sale_returns (created_at desc);

create table if not exists public.sale_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references public.sale_returns (id) on delete cascade,
  sale_item_id uuid not null references public.sale_items (id),
  product_id uuid references public.products (id) on delete set null,
  product_name text not null,
  unit text not null default 'pcs',
  quantity numeric not null,
  price numeric not null,
  gst_rate numeric not null default 0,
  line_total numeric not null
);

create index if not exists sale_return_items_return_idx
  on public.sale_return_items (return_id);
create index if not exists sale_return_items_sale_item_idx
  on public.sale_return_items (sale_item_id);

alter table public.sale_returns enable row level security;
alter table public.sale_return_items enable row level security;

drop policy if exists "sale_returns select" on public.sale_returns;
create policy "sale_returns select" on public.sale_returns
  for select to authenticated using (true);
drop policy if exists "sale_returns insert" on public.sale_returns;
create policy "sale_returns insert" on public.sale_returns
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "sale_return_items select" on public.sale_return_items;
create policy "sale_return_items select" on public.sale_return_items
  for select to authenticated using (true);
drop policy if exists "sale_return_items insert" on public.sale_return_items;
create policy "sale_return_items insert" on public.sale_return_items
  for insert to authenticated with check (true);

-- Movements ne return sathe link karva
alter table public.stock_movements
  add column if not exists return_id uuid references public.sale_returns (id) on delete set null;

-- ---------- 2. CREATE_SALE_RETURN RPC ----------
create or replace function public.create_sale_return(
  p_sale_id uuid,
  p_items jsonb,                 -- [{sale_item_id, quantity}]
  p_reason text default null,
  p_location_id uuid default null
)
returns json
language plpgsql
security invoker set search_path = public
as $$
declare
  v_return_id uuid;
  v_return_no text;
  v_location uuid;
  v_item record;
  v_si record;
  v_returned numeric;
  v_line numeric;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
begin
  if not exists (select 1 from public.sales where id = p_sale_id) then
    raise exception 'Sale not found';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Return ma ochha ma ochhi 1 item joie';
  end if;

  v_location := coalesce(
    p_location_id,
    (select id from public.locations where is_default limit 1),
    (select id from public.locations limit 1)
  );

  v_return_no := 'CN-' || to_char(now(), 'YYMM') || '-'
                 || lpad(nextval('public.cn_seq')::text, 4, '0');

  insert into public.sale_returns (return_no, sale_id, reason, created_by)
  values (v_return_no, p_sale_id, p_reason, auth.uid())
  returning id into v_return_id;

  for v_item in
    select (i ->> 'sale_item_id')::uuid as sale_item_id,
           (i ->> 'quantity')::numeric as quantity
    from jsonb_array_elements(p_items) i
  loop
    select * into v_si from public.sale_items
    where id = v_item.sale_item_id and sale_id = p_sale_id;
    if not found then
      raise exception 'Sale item not found';
    end if;

    -- Aa item ma thi pehla ketlu return thai gayu che
    select coalesce(sum(quantity), 0) into v_returned
    from public.sale_return_items
    where sale_item_id = v_item.sale_item_id and id <> v_return_id;

    if v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'Quantity 0 thi vadhare hovi joie';
    end if;
    if v_item.quantity > v_si.quantity - v_returned then
      raise exception '"%" ma vadhu ma vadhu % return thai shake',
        v_si.product_name, v_si.quantity - v_returned;
    end if;

    v_line := round(v_item.quantity * v_si.price, 2);
    v_subtotal := v_subtotal + v_line;
    v_tax := v_tax + round(v_line * coalesce(v_si.gst_rate, 0) / 100, 2);

    insert into public.sale_return_items
      (return_id, sale_item_id, product_id, product_name, unit,
       quantity, price, gst_rate, line_total)
    values
      (v_return_id, v_item.sale_item_id, v_si.product_id, v_si.product_name,
       v_si.unit, v_item.quantity, v_si.price,
       coalesce(v_si.gst_rate, 0), v_line);

    -- Stock pacho 'in'
    if v_si.product_id is not null then
      insert into public.stock_movements
        (product_id, type, quantity, reason, created_by, location_id, return_id)
      values
        (v_si.product_id, 'in', v_item.quantity,
         'Return ' || v_return_no, auth.uid(), v_location, v_return_id);
    end if;
  end loop;

  update public.sale_returns
  set subtotal = v_subtotal,
      tax_total = v_tax,
      total = round(v_subtotal + v_tax, 2)
  where id = v_return_id;

  return json_build_object(
    'return_id', v_return_id,
    'return_no', v_return_no,
    'total', round(v_subtotal + v_tax, 2)
  );
end;
$$;

-- ---------- 3. SALE_ITEMS MA COST SNAPSHOT ----------
alter table public.sale_items
  add column if not exists cost numeric;

-- create_sale ma cost snapshot add karvo (signature same che
-- etle create or replace chale)
create or replace function public.create_sale(
  p_items jsonb,
  p_customer_id uuid default null,
  p_discount numeric default 0,
  p_payment_method text default 'cash',
  p_paid_amount numeric default null,
  p_note text default null,
  p_location_id uuid default null
)
returns json
language plpgsql
security invoker set search_path = public
as $$
declare
  v_sale_id uuid;
  v_invoice_no text;
  v_location uuid;
  v_item record;
  v_product record;
  v_stock numeric;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_grand numeric;
  v_paid numeric;
  v_status text;
  v_line numeric;
  v_remaining numeric;
  v_take numeric;
  v_b record;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Sale ma ochha ma ochhi 1 item joie';
  end if;
  if coalesce(p_discount, 0) < 0 then
    raise exception 'Discount negative na hoi shake';
  end if;

  v_location := coalesce(
    p_location_id,
    (select id from public.locations where is_default limit 1),
    (select id from public.locations limit 1)
  );
  if v_location is null then
    raise exception 'Koi location nathi — Settings ma location banavo';
  end if;

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

    select name into v_product from public.products where id = v_item.product_id;
    if not found then
      raise exception 'Product not found';
    end if;

    select coalesce(sum(
      case type when 'in' then quantity when 'out' then -quantity else quantity end
    ), 0) into v_stock
    from public.stock_movements
    where product_id = v_item.product_id and location_id = v_location;

    if v_stock < v_item.quantity then
      raise exception '"%" no aa location par stock ochho che (available: %)',
        v_product.name, v_stock;
    end if;
  end loop;

  select bs.invoice_prefix || '-' || to_char(now(), 'YYMM') || '-'
         || lpad(nextval('public.invoice_seq')::text, 4, '0')
  into v_invoice_no
  from public.business_settings bs
  where bs.id = 1;

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

  for v_item in
    select (i ->> 'product_id')::uuid as product_id,
           (i ->> 'quantity')::numeric as quantity,
           (i ->> 'price')::numeric as price
    from jsonb_array_elements(p_items) i
  loop
    select name, hsn_code, unit, gst_rate, purchase_price into v_product
    from public.products where id = v_item.product_id;

    insert into public.sale_items
      (sale_id, product_id, product_name, hsn_code, unit,
       quantity, price, gst_rate, line_total, cost)
    values
      (v_sale_id, v_item.product_id, v_product.name, v_product.hsn_code,
       v_product.unit, v_item.quantity, v_item.price,
       coalesce(v_product.gst_rate, 0),
       round(v_item.quantity * v_item.price, 2),
       v_product.purchase_price);

    v_remaining := v_item.quantity;
    for v_b in
      select b.id as batch_id,
        coalesce(sum(
          case m.type when 'in' then m.quantity when 'out' then -m.quantity else m.quantity end
        ), 0) as bstock
      from public.batches b
      join public.stock_movements m
        on m.batch_id = b.id and m.location_id = v_location
      where b.product_id = v_item.product_id
      group by b.id, b.expiry_date, b.batch_no
      having coalesce(sum(
        case m.type when 'in' then m.quantity when 'out' then -m.quantity else m.quantity end
      ), 0) > 0
      order by b.expiry_date asc nulls last, b.batch_no
    loop
      exit when v_remaining <= 0;
      v_take := least(v_remaining, v_b.bstock);
      insert into public.stock_movements
        (product_id, type, quantity, reason, created_by, location_id, batch_id, sale_id)
      values
        (v_item.product_id, 'out', v_take, 'Sale ' || v_invoice_no,
         auth.uid(), v_location, v_b.batch_id, v_sale_id);
      v_remaining := v_remaining - v_take;
    end loop;

    if v_remaining > 0 then
      insert into public.stock_movements
        (product_id, type, quantity, reason, created_by, location_id, sale_id)
      values
        (v_item.product_id, 'out', v_remaining, 'Sale ' || v_invoice_no,
         auth.uid(), v_location, v_sale_id);
    end if;
  end loop;

  return json_build_object(
    'sale_id', v_sale_id,
    'invoice_no', v_invoice_no,
    'grand_total', v_grand
  );
end;
$$;

-- ---------- 4. ANALYTICS VIEW ----------
-- sale_items ne date sathe query karva mate
create or replace view public.sale_items_dated
with (security_invoker = on) as
select
  si.*,
  s.created_at as sold_at,
  s.status as sale_status
from public.sale_items si
join public.sales s on s.id = si.sale_id;

grant select on public.sale_items_dated to authenticated;
