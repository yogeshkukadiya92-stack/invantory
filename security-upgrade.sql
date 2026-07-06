-- ============================================================
-- Inventory App — Security Upgrade (Phase 2)
-- Aa file Supabase Dashboard → SQL Editor ma paste karine
-- ek j vaar RUN karvani che. (supabase-schema.sql pachhi)
--
-- Shu badlay che:
--   1. is_admin() helper
--   2. Invite-only signup (allowed_emails table)
--   3. Role self-escalation protection
--   4. Role-based RLS — staff vs admin
--   5. record_movement race condition fix (advisory lock)
-- ============================================================

-- ---------- 1. IS_ADMIN HELPER ----------
create or replace function public.is_admin()
returns boolean
language sql stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------- 2. INVITE-ONLY SIGNUP ----------
create table if not exists public.allowed_emails (
  email text primary key,
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.allowed_emails enable row level security;

drop policy if exists "allowed_emails admin all" on public.allowed_emails;
create policy "allowed_emails admin all" on public.allowed_emails
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Signup trigger: email invite list ma na hoy to signup block
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.allowed_emails
    where lower(email) = lower(new.email)
  ) then
    raise exception 'signup_not_invited';
  end if;

  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

-- ---------- 3. ROLE SELF-ESCALATION PROTECTION ----------
-- Staff potano role 'admin' na kari shake e mate trigger
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Role badalva mate admin joie';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();

-- Admin biji profiles update kari shake (role management mate)
drop policy if exists "profiles update admin" on public.profiles;
create policy "profiles update admin" on public.profiles
  for update to authenticated using (public.is_admin());

-- ---------- 4. ROLE-BASED RLS ----------
-- Staff: read + scan/stock entry. Admin: badhu.

-- CATEGORIES: read badha, write fakt admin
drop policy if exists "categories all" on public.categories;
create policy "categories select" on public.categories
  for select to authenticated using (true);
create policy "categories insert admin" on public.categories
  for insert to authenticated with check (public.is_admin());
create policy "categories update admin" on public.categories
  for update to authenticated using (public.is_admin());
create policy "categories delete admin" on public.categories
  for delete to authenticated using (public.is_admin());

-- SUPPLIERS: read badha, write fakt admin
drop policy if exists "suppliers all" on public.suppliers;
create policy "suppliers select" on public.suppliers
  for select to authenticated using (true);
create policy "suppliers insert admin" on public.suppliers
  for insert to authenticated with check (public.is_admin());
create policy "suppliers update admin" on public.suppliers
  for update to authenticated using (public.is_admin());
create policy "suppliers delete admin" on public.suppliers
  for delete to authenticated using (public.is_admin());

-- PRODUCTS: read badha, create badha (scan → new product flow),
-- edit/delete fakt admin
drop policy if exists "products all" on public.products;
create policy "products select" on public.products
  for select to authenticated using (true);
create policy "products insert" on public.products
  for insert to authenticated with check (true);
create policy "products update admin" on public.products
  for update to authenticated using (public.is_admin());
create policy "products delete admin" on public.products
  for delete to authenticated using (public.is_admin());

-- STOCK MOVEMENTS: policies already barabar che (select + own insert,
-- update/delete koi nahi — audit trail safe rahe)

-- ---------- 5. RECORD_MOVEMENT — RACE CONDITION FIX ----------
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

  if p_type <> 'adjustment' and p_quantity <= 0 then
    raise exception 'Quantity 0 thi vadhare hovi joie';
  end if;

  if p_type = 'adjustment' and p_quantity = 0 then
    raise exception 'Adjustment 0 na hoi shake';
  end if;

  -- Ek j product par ek sathe be movements na thay e mate lock.
  -- Transaction puru thata lock auto release thay che.
  perform pg_advisory_xact_lock(hashtext(p_product_id::text));

  select coalesce(stock, 0) into v_current
  from public.current_stock
  where product_id = p_product_id;

  if not found then
    raise exception 'Product not found';
  end if;

  if p_type = 'out' and v_current < p_quantity then
    raise exception 'Stock ochho che (available: %)', v_current;
  end if;

  if p_type = 'adjustment' and v_current + p_quantity < 0 then
    raise exception 'Adjustment thi stock negative thai jashe (current: %)', v_current;
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
