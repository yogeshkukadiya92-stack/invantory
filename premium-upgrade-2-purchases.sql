-- ============================================================
-- Inventory App — Premium Upgrade 2: Purchase Orders
-- Aa file Supabase SQL Editor ma paste karine ek j vaar RUN
-- karvani che. (premium-upgrade-1-sales.sql pachhi)
--
-- Flow: PO banavo (ordered) → goods aave tyare "receive" →
--       stock automatic 'in' thay → PO received.
-- ============================================================

create sequence if not exists public.po_seq;

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_no text not null unique,
  supplier_id uuid references public.suppliers (id) on delete set null,
  status text not null default 'ordered'
    check (status in ('ordered', 'received', 'cancelled')),
  note text,
  total numeric not null default 0,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  received_at timestamptz
);

create index if not exists po_created_idx on public.purchase_orders (created_at desc);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  -- Snapshot: product pachhi thi badlay to pan PO same rahe
  product_name text not null,
  unit text not null default 'pcs',
  quantity numeric not null,
  cost numeric not null,
  line_total numeric not null
);

create index if not exists po_items_po_idx on public.purchase_order_items (po_id);

-- Movements ne PO sathe link karva
alter table public.stock_movements
  add column if not exists po_id uuid references public.purchase_orders (id) on delete set null;

-- ---------- RLS ----------
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_items enable row level security;

drop policy if exists "po select" on public.purchase_orders;
create policy "po select" on public.purchase_orders
  for select to authenticated using (true);
drop policy if exists "po insert" on public.purchase_orders;
create policy "po insert" on public.purchase_orders
  for insert to authenticated with check (created_by = auth.uid());
-- Direct update/delete koi nahi — receive/cancel fakt RPC thi thay

drop policy if exists "po_items select" on public.purchase_order_items;
create policy "po_items select" on public.purchase_order_items
  for select to authenticated using (true);
drop policy if exists "po_items insert" on public.purchase_order_items;
create policy "po_items insert" on public.purchase_order_items
  for insert to authenticated with check (true);

-- ---------- CREATE PO ----------
create or replace function public.create_purchase_order(
  p_items jsonb,                 -- [{product_id, quantity, cost}]
  p_supplier_id uuid default null,
  p_note text default null
)
returns json
language plpgsql
security invoker set search_path = public
as $$
declare
  v_po_id uuid;
  v_po_no text;
  v_item record;
  v_product record;
  v_total numeric := 0;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'PO ma ochha ma ochhi 1 item joie';
  end if;

  v_po_no := 'PO-' || to_char(now(), 'YYMM') || '-'
             || lpad(nextval('public.po_seq')::text, 4, '0');

  insert into public.purchase_orders (po_no, supplier_id, note, created_by)
  values (v_po_no, p_supplier_id, p_note, auth.uid())
  returning id into v_po_id;

  for v_item in
    select (i ->> 'product_id')::uuid as product_id,
           (i ->> 'quantity')::numeric as quantity,
           (i ->> 'cost')::numeric as cost
    from jsonb_array_elements(p_items) i
  loop
    if v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'Quantity 0 thi vadhare hovi joie';
    end if;
    if v_item.cost is null or v_item.cost < 0 then
      raise exception 'Cost valid nathi';
    end if;

    select name, unit into v_product
    from public.products where id = v_item.product_id;
    if not found then
      raise exception 'Product not found';
    end if;

    insert into public.purchase_order_items
      (po_id, product_id, product_name, unit, quantity, cost, line_total)
    values
      (v_po_id, v_item.product_id, v_product.name, v_product.unit,
       v_item.quantity, v_item.cost,
       round(v_item.quantity * v_item.cost, 2));

    v_total := v_total + round(v_item.quantity * v_item.cost, 2);
  end loop;

  update public.purchase_orders set total = v_total where id = v_po_id;

  return json_build_object('po_id', v_po_id, 'po_no', v_po_no, 'total', v_total);
end;
$$;

-- ---------- RECEIVE PO ----------
-- security definer: staff pan receive kari shake, pan fakt aa
-- controlled flow thi j (PO update ni direct policy nathi).
create or replace function public.receive_purchase_order(p_po_id uuid)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_po record;
  v_item record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

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
        (product_id, type, quantity, reason, supplier_id, created_by, po_id)
      values
        (v_item.product_id, 'in', v_item.quantity,
         'PO ' || v_po.po_no, v_po.supplier_id, auth.uid(), p_po_id);
    end if;
  end loop;

  update public.purchase_orders
  set status = 'received', received_at = now()
  where id = p_po_id;

  return json_build_object('po_id', p_po_id, 'status', 'received');
end;
$$;

-- ---------- CANCEL PO ----------
create or replace function public.cancel_purchase_order(p_po_id uuid)
returns json
language plpgsql
security definer set search_path = public
as $$
declare
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select status into v_status from public.purchase_orders where id = p_po_id
  for update;

  if not found then
    raise exception 'PO not found';
  end if;
  if v_status <> 'ordered' then
    raise exception 'Fakt ordered PO cancel thai shake (aa % che)', v_status;
  end if;

  update public.purchase_orders set status = 'cancelled' where id = p_po_id;

  return json_build_object('po_id', p_po_id, 'status', 'cancelled');
end;
$$;
