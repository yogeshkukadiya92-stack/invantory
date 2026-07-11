"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/mongodb/client";
import type { Category, StockRow } from "@/lib/types";
import {
  ActionMenu,
  EmptyState,
  LoadingState,
  PageHeader,
  menuItemClass,
} from "@/components/DashboardUI";

const PAGE_SIZE = 50;

export default function ProductsPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<StockRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadCategories() {
      const { data, error: categoryError } = await supabase
        .from("categories")
        .select("*")
        .order("name");
      if (cancelled) return;
      if (categoryError) setError(categoryError.message);
      setCategories((data ?? []) as Category[]);
    }
    loadCategories();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [categoryFilter, debouncedSearch, stockFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let query = supabase
      .from(stockFilter === "low" ? "low_stock" : "current_stock")
      .select("*", { count: "exact" })
      .eq("is_active", true)
      .order("name")
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (stockFilter === "out") query = query.lte("stock", 0);
    if (categoryFilter) query = query.eq("category_id", categoryFilter);
    if (debouncedSearch) {
      const safeSearch = debouncedSearch.replace(/[,()]/g, "");
      query = query.or(
        `name.ilike.%${safeSearch}%,sku.ilike.%${safeSearch}%,barcode.ilike.%${safeSearch}%`
      );
    }
    const { data, count, error: loadError } = await query;
    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as StockRow[]);
    setTotal(count ?? 0);
    setLoading(false);
  }, [categoryFilter, debouncedSearch, page, stockFilter, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <PageHeader
        title="Products"
        description={`${total.toLocaleString("en-IN")} active products across inventory`}
        actions={
          <>
            <ActionMenu label="Product tools">
              <Link href="/products/import" className={menuItemClass}>Import products</Link>
              <Link href="/products/labels" className={menuItemClass}>Print barcode labels</Link>
              <button type="button" onClick={load} className={menuItemClass}>Refresh list</button>
            </ActionMenu>
            <Link
              href="/products/new"
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              Add product
            </Link>
          </>
        }
      />

      {error && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{error}</span>
          <button type="button" onClick={load} className="font-semibold underline">Retry</button>
        </div>
      )}

      <section className="mt-5 rounded-lg border border-stone-200 bg-white">
        <div className="grid gap-2 border-b border-stone-200 p-3 sm:grid-cols-[minmax(0,1fr)_180px_160px]">
          <label>
            <span className="sr-only">Search products</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, SKU, or barcode"
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
            />
          </label>
          <label>
            <span className="sr-only">Category</span>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Stock status</span>
            <select
              value={stockFilter}
              onChange={(event) => setStockFilter(event.target.value as typeof stockFilter)}
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
            >
              <option value="all">All stock</option>
              <option value="low">Low stock</option>
              <option value="out">Out of stock</option>
            </select>
          </label>
        </div>

        {loading ? (
          <LoadingState label="Loading products" />
        ) : rows.length === 0 ? (
          <EmptyState
            title={debouncedSearch || categoryFilter || stockFilter !== "all" ? "No matching products" : "No products yet"}
            description={
              debouncedSearch || categoryFilter || stockFilter !== "all"
                ? "Clear or change the filters to see more products."
                : "Add your first product to start tracking stock and sales."
            }
            actionHref={debouncedSearch || categoryFilter || stockFilter !== "all" ? undefined : "/products/new"}
            actionLabel={debouncedSearch || categoryFilter || stockFilter !== "all" ? undefined : "Add product"}
          />
        ) : (
          <ul className="divide-y divide-stone-100">
            {rows.map((product) => {
              const isOut = product.stock <= 0;
              const isLow = !isOut && product.stock <= product.min_stock_level;
              return (
                <li key={product.product_id} className="flex items-center gap-2 px-2 py-1.5 sm:px-3">
                  <Link
                    href={`/products/${product.product_id}`}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 hover:bg-stone-50"
                  >
                    {product.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="h-10 w-10 shrink-0 rounded-md border border-stone-200 object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-stone-100 text-xs font-semibold text-stone-500">
                        {product.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-stone-900">{product.name}</p>
                      <p className="mt-0.5 truncate text-xs text-stone-500">
                        {product.barcode ? `Barcode ${product.barcode}` : "No barcode"}
                        {product.sku ? ` · SKU ${product.sku}` : ""}
                        {` · ₹${Number(product.selling_price).toLocaleString("en-IN")}`}
                      </p>
                    </div>
                    <span
                      className={`ml-2 shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        isOut
                          ? "bg-red-50 text-red-700"
                          : isLow
                            ? "bg-amber-50 text-amber-700"
                            : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {product.stock} {product.unit}
                    </span>
                  </Link>
                  <ActionMenu label={`Actions for ${product.name}`}>
                    <Link href={`/products/${product.product_id}`} className={menuItemClass}>Edit product</Link>
                    <Link href={`/sales/new?product_id=${encodeURIComponent(product.product_id)}`} className={menuItemClass}>Create sale</Link>
                    <Link href={`/purchases/new?product_id=${encodeURIComponent(product.product_id)}`} className={menuItemClass}>Create purchase</Link>
                  </ActionMenu>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {!loading && total > PAGE_SIZE && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-stone-500">
            {total.toLocaleString("en-IN")} products · page {page + 1} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              disabled={page === 0}
              className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
