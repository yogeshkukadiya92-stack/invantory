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
  useToast,
} from "@/components/DashboardUI";

const PAGE_SIZE = 50;

export default function ProductsPage() {
  const supabase = createClient();
  const { showToast } = useToast();
  const [rows, setRows] = useState<StockRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

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
  }, [categoryFilter, debouncedSearch, statusFilter, stockFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let query = supabase
      .from(stockFilter === "low" ? "low_stock" : "current_stock")
      .select("*", { count: "exact" })
      .order("name")
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (statusFilter !== "all") {
      query = query.eq("is_active", statusFilter === "active");
    }
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
  }, [categoryFilter, debouncedSearch, page, statusFilter, stockFilter, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function reactivate(product: StockRow) {
    if (restoringId) return;
    setRestoringId(product.product_id);
    setError(null);
    const { error: restoreError } = await supabase
      .from("products")
      .update({ is_active: true })
      .eq("id", product.product_id);
    setRestoringId(null);
    if (restoreError) {
      setError(restoreError.message);
      return;
    }
    await load();
    showToast(`${product.name} reactivated`);
  }

  return (
    <div>
      <PageHeader
        title="Products"
        description={`${total.toLocaleString("en-IN")} products matching the current view`}
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
        <div className="grid gap-2 border-b border-stone-200 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_170px_150px_150px]">
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
          <label>
            <span className="sr-only">Product status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"
            >
              <option value="active">Active products</option>
              <option value="inactive">Archived products</option>
              <option value="all">All products</option>
            </select>
          </label>
        </div>

        {loading ? (
          <LoadingState label="Loading products" />
        ) : rows.length === 0 ? (
          <EmptyState
            title={debouncedSearch || categoryFilter || stockFilter !== "all" || statusFilter !== "active" ? "No matching products" : "No products yet"}
            description={
              debouncedSearch || categoryFilter || stockFilter !== "all" || statusFilter !== "active"
                ? "Clear or change the filters to see more products."
                : "Add your first product to start tracking stock and sales."
            }
            actionHref={debouncedSearch || categoryFilter || stockFilter !== "all" || statusFilter !== "active" ? undefined : "/products/new"}
            actionLabel={debouncedSearch || categoryFilter || stockFilter !== "all" || statusFilter !== "active" ? undefined : "Add product"}
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
                        !product.is_active
                          ? "bg-stone-200 text-stone-700"
                          : isOut
                          ? "bg-red-50 text-red-700"
                          : isLow
                            ? "bg-amber-50 text-amber-700"
                            : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {product.is_active ? `${product.stock} ${product.unit}` : "Archived"}
                    </span>
                  </Link>
                  <ActionMenu label={`Actions for ${product.name}`}>
                    <Link href={`/products/${product.product_id}`} className={menuItemClass}>Edit product</Link>
                    {product.is_active ? (
                      <>
                        <Link href={`/sales/new?product_id=${encodeURIComponent(product.product_id)}`} className={menuItemClass}>Create sale</Link>
                        <Link href={`/purchases/new?product_id=${encodeURIComponent(product.product_id)}`} className={menuItemClass}>Create purchase</Link>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => reactivate(product)}
                        disabled={restoringId !== null}
                        className={menuItemClass}
                      >
                        {restoringId === product.product_id ? "Reactivating..." : "Reactivate product"}
                      </button>
                    )}
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
