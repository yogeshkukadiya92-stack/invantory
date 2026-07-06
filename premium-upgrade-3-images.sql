-- ============================================================
-- Inventory App — Premium Upgrade 3: Product Images
-- Aa file Supabase SQL Editor ma paste karine ek j vaar RUN
-- karvani che. (premium-upgrade-2-purchases.sql pachhi)
--
-- Shu aave che:
--   1. 'product-images' storage bucket (public read)
--   2. current_stock / low_stock views ma image_url
-- ============================================================

-- ---------- 1. STORAGE BUCKET ----------
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "product images insert" on storage.objects;
create policy "product images insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'product-images');

drop policy if exists "product images update" on storage.objects;
create policy "product images update" on storage.objects
  for update to authenticated
  using (bucket_id = 'product-images');

drop policy if exists "product images delete" on storage.objects;
create policy "product images delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'product-images');

-- ---------- 2. VIEWS MA IMAGE_URL ----------
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
  p.gst_rate,
  p.image_url
from public.products p
left join public.stock_movements m on m.product_id = p.id
group by p.id;

create view public.low_stock
with (security_invoker = on) as
select * from public.current_stock
where is_active = true and stock <= min_stock_level;

grant select on public.current_stock to authenticated;
grant select on public.low_stock to authenticated;
