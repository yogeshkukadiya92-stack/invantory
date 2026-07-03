"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Category, StockRow } from "@/lib/types";

export default function ProductsPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<StockRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: stock }, { data: cats }] = await Promise.all([
        supabase
          .from("current_stock")
          .select("*")
          .eq("is_active", true)
          .order("name"),
        supabase.from("categories").select("*").order("name"),
      ]);
      setRows((stock ?? []) as StockRow[]);
      setCategories((cats ?? []) as Category[]);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const q = search.trim().toLowerCase();
      if (
        q &&
        !r.name.toLowerCase().includes(q) &&
        !(r.sku ?? "").toLowerCase().includes(q) &&
        !(r.barcode ?? "").includes(q)
      )
        return false;
      if (categoryFilter && r.category_id !== categoryFilter) return false;
      if (stockFilter === "low" && r.stock > r.min_stock_level) return false;
      if (stockFilter === "out" && r.stock > 0) return false;
      return true;
    });
  }, [rows, search, categoryFilter, stockFilter]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-stone-900">Products</h1>
        <div className="flex gap-2">
          <Link
            href="/products/labels"
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors"
          >
            🖨 Labels
          </Link>
          <Link
            href="/products/new"
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 transition-colors"
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
        ) : filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-stone-500">
            No products found. Add your first product to get started.
          </p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {filtered.map((p) => {
              const isOut = p.stock <= 0;
              const isLow = !isOut && p.stock <= p.min_stock_level;
              return (
                <li key={p.product_id}>
                  <Link
                    href={`/products/${p.product_id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-stone-50 transition-colors"
                  >
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
    </div>
  );
}
