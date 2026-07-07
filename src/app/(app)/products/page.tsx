"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/mongodb/client";
import type { Category, StockRow } from "@/lib/types";

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

  useEffect(() => {
    async function loadCategories() {
      const { data } = await supabase.from("categories").select("*").order("name");
      setCategories((data ?? []) as Category[]);
    }
    loadCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search debounce — dar keystroke par query na jay
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Filter badlay tyare page 1 par pacha
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, categoryFilter, stockFilter]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      let query = supabase
        .from(stockFilter === "low" ? "low_stock" : "current_stock")
        .select("*", { count: "exact" })
        .eq("is_active", true)
        .order("name")
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (stockFilter === "out") query = query.lte("stock", 0);
      if (categoryFilter) query = query.eq("category_id", categoryFilter);
      if (debouncedSearch) {
        // .or() na syntax ma comma/kauns problem kare — kadhi nakhie
        const q = debouncedSearch.replace(/[,()]/g, "");
        query = query.or(
          `name.ilike.%${q}%,sku.ilike.%${q}%,barcode.ilike.%${q}%`
        );
      }

      const { data, count } = await query;
      setRows((data ?? []) as StockRow[]);
      setTotal(count ?? 0);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, categoryFilter, stockFilter, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-stone-900">Products</h1>
        <div className="grid grid-cols-3 gap-2 sm:flex">
          <Link
            href="/products/import"
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-center text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
          >
            ⬆ Import
          </Link>
          <Link
            href="/products/labels"
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-center text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
          >
            🖨 Labels
          </Link>
          <Link
            href="/products/new"
            className="rounded-lg bg-emerald-700 px-4 py-2 text-center text-sm font-medium text-white hover:bg-emerald-800 transition-colors"
          >
            + Add product
          </Link>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, SKU, or barcode..."
          className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={stockFilter}
          onChange={(e) => setStockFilter(e.target.value as typeof stockFilter)}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
        >
          <option value="all">All stock</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
        </select>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-white">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-stone-500">
            Loading...
          </p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-stone-500">
            No products found. Add your first product to get started.
          </p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {rows.map((p) => {
              const isOut = p.stock <= 0;
              const isLow = !isOut && p.stock <= p.min_stock_level;
              return (
                <li key={p.product_id}>
                  <Link
                    href={`/products/${p.product_id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-stone-50 transition-colors"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.image_url}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-lg border border-stone-200 object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-400">
                          📦
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-stone-900">
                          {p.name}
                        </p>
                        <p className="truncate text-xs text-stone-500">
                          {p.barcode ? `⧉ ${p.barcode}` : "No barcode"}
                          {p.sku ? ` · SKU ${p.sku}` : ""}
                          {" · ₹"}
                          {Number(p.selling_price).toLocaleString("en-IN")}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`ml-3 shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        isOut
                          ? "bg-red-50 text-red-700"
                          : isLow
                            ? "bg-amber-50 text-amber-700"
                            : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {p.stock} {p.unit}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* PAGINATION */}
      {!loading && total > PAGE_SIZE && (
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-stone-500">
            {total.toLocaleString("en-IN")} products · page {page + 1} of{" "}
            {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-40"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
