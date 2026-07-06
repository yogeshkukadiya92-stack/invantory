-- ============================================================
-- Inventory App — Premium Upgrade 4: Multi-location + Batch/Expiry
-- Aa file Supabase SQL Editor ma paste karine ek j vaar RUN
-- karvani che. (premium-upgrade-3-images.sql pachhi)
--
-- Shu aave che:
--   1. locations — multi-godown/store support
--   2. batches — batch no + expiry tracking
--   3. Movements ma location_id, batch_id, transfer_id
--   4. Views: location_stock, batch_stock, expiring_stock
--   5. RPCs update: location-aware stock checks,
--      sales ma FEFO (First-Expiry-First-Out) allocation,
--      transfer_stock navu RPC
-- ============================================================

-- ---------- 1. LOCATIONS ----------
create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- Pehli default location seed karo
insert into public.locations (name, is_default)
select 'Main Store', true
where not exists (select 1 from public.locations);

alter table public.locations enable row level security;

drop policy if exists "locations select" on public.locations;
create policy "locations select" on public.locations
  for select to authenticated using (true);
drop policy if exists "locations insert admin" on public.locations;
create policy "locations insert admin" on public.locations
  for insert to authenticated with check (public.is_admin());
drop policy if exists "locations update admin" on public.locations;
create policy "locations update admin" on public.locations
  for update to authenticated using (public.is_admin());
drop policy if exists "locations delete admin" on public.locations;
create policy "locations delete admin" on public.locations
  for delete to authenticated using (public.is_admin());

-- ---------- 2. BATCHES ----------
create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  batch_no text not null,
  expiry_date date,
  created_at timestamptz not null default now(),
  unique (product_id, batch_no)
);

alter table public.batches enable row level security;

drop policy if exists "batches select" on public.batches;
create policy "batches select" on public.batches
  for select to authenticated using (true);
drop policy if exists "batches insert" on public.batches;
create policy "batches insert" on public.batches
  for insert to authenticated with check (true);
drop policy if exists "batches update" on public.batches;
create policy "batches update" on public.batches
  for update to authenticated using (true);
drop policy if exists "batches delete admin" on public.batches;
create policy "batches delete admin" on public.batches
  for delete to authenticated using (public.is_admin());

-- ---------- 3. MOVEMENTS MA NAVI COLUMNS ----------
alter table public.stock_movements
  add column if not exists location_id uuid references public.locations (id),
  add column if not exists batch_id uuid references public.batches (id) on delete set null,
  add column if not exists transfer_id uuid;

-- Juna movements ne default location par muko
update public.stock_movements
set location_id = (select id from public.locations where is_default limit 1)
where location_id is null;

create index if not exists movements_location_idx
  on public.stock_movements (location_id);
create index if not exists movements_batch_idx
  on public.stock_movements (batch_id);

-- Safety net: direct insert (e.g. bulk import) location vagar aave
-- to default location auto set thay
create or replace function public.set_default_location()
returns trigger language plpgsql
security definer set search_path = public
as $$
begin
  if new.location_id is null then
    select id into new.location_id
    from public.locations where is_default limit 1;
    if new.location_id is null then
      select id into new.location_id from public.locations limit 1;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists movements_default_location on public.stock_movements;
create trigger movements_default_location
  before insert on public.stock_movements
  for each row execute function public.set_default_location();

-- ---------- 4. VIEWS ----------
create or replace view public.location_stock
with (security_invoker = on) as
select
  m.product_id,
  p.name,
  p.unit,
  p.is_active,
  m.location_id,
  l.name as location_name,
  coalesce(sum(
    case m.type
      when 'in' then m.quantity
      when 'out' then -m.quantity
      else m.quantity
    end
  ), 0) as stock
from public.stock_movements m
join public.products p on p.id = m.product_id
join public.locations l on l.id = m.location_id
group by m.product_id, p.name, p.unit, p.is_active, m.location_id, l.name;

create or replace view public.batch_stock
with (security_invoker = on) as
select
  m.product_id,
  p.name as product_name,
  p.unit,
  b.id as batch_id,
  b.batch_no,
  b.expiry_date,
  m.location_id,
  l.name as location_name,
  coalesce(sum(
    case m.type
      when 'in' then m.quantity
      when 'out' then -m.quantity
      else m.quantity
    end
  ), 0) as stock
from public.stock_movements m
join public.batches b on b.id = m.batch_id
join public.products p on p.id = m.product_id
join public.locations l on l.id = m.location_id
group by m.product_id, p.name, p.unit, b.id, b.batch_no, b.expiry_date,
         m.location_id, l.name;

create or replace view public.expiring_stock
with (security_invoker = on) as
select * from public.batch_stock
where stock > 0
  and expiry_date is not null
  and expiry_date <= (current_date + 60);

grant select on public.location_stock to authenticated;
grant select on public.batch_stock to authenticated;
grant select on public.expiring_stock to authenticated;

-- ---------- 5. RECORD_MOVEMENT (location + batch aware) ----------
-- Juni signature drop karvi pade — nahi to overload ambiguity thay
drop function if exists public.record_movement(uuid, text, numeric, text, uuid);

create or replace function public.record_movement(
  p_product_id uuid,
  p_type text,
  p_quantity numeric,
  p_reason text default null,
  p_supplier_id uuid default null,
  p_location_id uuid default null,
  p_batch_no text default null,
  p_expiry_date date default null,
  p_batch_id uuid default null
)
returns json
language plpgsql
security invoker set search_path = public
as $$
declare
  v_movement_id uuid;
  v_location uuid;
  v_batch uuid;
  v_current numeric;
  v_batch_stock numeric;
  v_new numeric;
begin
  if p_type not in ('in', 'out', 'adjustment') then
    raise exception 'Invalid movement type: %', p_type;
  end if;
  if p_type <> 'adjustment' and p_quantity <= 0 then
    raise exception 'Quantity 0 thi vadhare hovi joie';
  end if;
  if p_type = 'adjustment' and p_quantity = 0 then
    raise exception 'Adjustment 0 na hoi shake';
  end if;

  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'Product not found';
  end if;

  v_location := coalesce(
    p_location_id,
    (select id from public.locations where is_default limit 1),
    (select id from public.locations limit 1)
  );
  if v_location is null then
    raise exception 'Koi location nathi — Settings ma location banavo';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_product_id::text));

  -- Aa location par current stock
  select coalesce(sum(
    case type when 'in' then quantity when 'out' then -quantity else quantity end
  ), 0) into v_current
  from public.stock_movements
  where product_id = p_product_id and location_id = v_location;

  -- Batch resolve karo: id direct aave athva batch_no thi find/create
  v_batch := p_batch_id;
  if v_batch is null and p_batch_no is not null and trim(p_batch_no) <> '' then
    select id into v_batch from public.batches
    where product_id = p_product_id and batch_no = trim(p_batch_no);
    if not found then
      if p_type <> 'in' then
        raise exception 'Batch "%" nathi malto', p_batch_no;
      end if;
      insert into public.batches (product_id, batch_no, expiry_date)
      values (p_product_id, trim(p_batch_no), p_expiry_date)
      returning id into v_batch;
    elsif p_expiry_date is not null then
      update public.batches set expiry_date = p_expiry_date where id = v_batch;
    end if;
  end if;

  if p_type = 'out' then
    if v_current < p_quantity then
      raise exception 'Aa location par stock ochho che (available: %)', v_current;
    end if;
    if v_batch is not null then
      select coalesce(sum(
        case type when 'in' then quantity when 'out' then -quantity else quantity end
      ), 0) into v_batch_stock
      from public.stock_movements
      where product_id = p_product_id
        and location_id = v_location and batch_id = v_batch;
      if v_batch_stock < p_quantity then
        raise exception 'Aa batch ma stock ochho che (available: %)', v_batch_stock;
      end if;
    end if;
  end if;

  if p_type = 'adjustment' and v_current + p_quantity < 0 then
    raise exception 'Adjustment thi stock negative thai jashe (current: %)', v_current;
  end if;

  insert into public.stock_movements
    (product_id, type, quantity, reason, supplier_id, created_by,
     location_id, batch_id)
  values
    (p_product_id, p_type, p_quantity, p_reason, p_supplier_id, auth.uid(),
     v_location, v_batch)
  returning id into v_movement_id;

  v_new := v_current + case p_type
    when 'in' then p_quantity
    when 'out' then -p_quantity
    else p_quantity
  end;

  return json_build_object('movement_id', v_movement_id, 'new_stock', v_new);
end;
$$;

-- ---------- 6. TRANSFER_STOCK ----------
create or replace function public.transfer_stock(
  p_product_id uuid,
  p_from_location uuid,
  p_to_location uuid,
  p_quantity numeric,
  p_batch_id uuid default null
)
returns json
language plpgsql
security invoker set search_path = public
as $$
declare
  v_available numeric;
  v_transfer uuid := gen_random_uuid();
  v_from_name text;
  v_to_name text;
begin
  if p_quantity <= 0 then
    raise exception 'Quantity 0 thi vadhare hovi joie';
  end if;
  if p_from_location = p_to_location then
    raise exception 'From ane To location alag hovi joie';
  end if;

  select name into v_from_name from public.locations where id = p_from_location;
  select name into v_to_name from public.locations where id = p_to_location;
  if v_from_name is null or v_to_name is null then
    raise exception 'Location not found';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_product_id::text));

  select coalesce(sum(
    case type when 'in' then quantity when 'out' then -quantity else quantity end
  ), 0) into v_available
  from public.stock_movements
  where product_id = p_product_id
    and location_id = p_from_location
    and (p_batch_id is null or batch_id = p_batch_id);

  if v_available < p_quantity then
    raise exception '% par stock ochho che (available: %)', v_from_name, v_available;
  end if;

  insert into public.stock_movements
    (product_id, type, quantity, reason, created_by, location_id, batch_id, transfer_id)
  values
    (p_product_id, 'out', p_quantity,
     'Transfer → ' || v_to_name, auth.uid(), p_from_location, p_batch_id, v_transfer),
    (p_product_id, 'in', p_quantity,
     'Transfer ← ' || v_from_name, auth.uid(), p_to_location, p_batch_id, v_transfer);

  return json_build_object('transfer_id', v_transfer);
end;
$$;

-- ---------- 7. CREATE_SALE (location + FEFO batches) ----------
drop function if exists public.create_sale(jsonb, uuid, numeric, text, numeric, text);

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

  -- Lock + location-level stock check (product_id order ma — deadlock na thay)
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

    -- FEFO: pehla je batch vehli expire thay ema thi kadho
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

    -- Baki unbatched stock ma thi
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

-- ---------- 8. RECEIVE_PURCHASE_ORDER (location aware) ----------
drop function if exists public.receive_purchase_order(uuid);

create or replace function public.receive_purchase_order(
  p_po_id uuid,
  p_location_id uuid default null
)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_po record;
  v_item record;
  v_location uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_location := coalesce(
    p_location_id,
    (select id from public.locations where is_default limit 1),
    (select id from public.locations limit 1)
  );

  select * into v_po from public.purchase_orders where id = p_po_id
  for update;

  if not found then
    raise exception 'PO not found';
  end if;
  if v_po.status <> 'ordered' then
    raise exception 'PO already % che', v_po.status;
  end if;

  for v_item in
    select * from public.purchase_order_items where po_id = p_po_id
  loop
    if v_item.product_id is not null then
      insert into public.stock_movements
        (product_id, type, quantity, reason, supplier_id, created_by, po_id, location_id)
      values
        (v_item.product_id, 'in', v_item.quantity,
         'PO ' || v_po.po_no, v_po.supplier_id, auth.uid(), p_po_id, v_location);
    end if;
  end loop;

  update public.purchase_orders
  set status = 'received', received_at = now()
  where id = p_po_id;

  return json_build_object('po_id', p_po_id, 'status', 'received');
end;
$$;
