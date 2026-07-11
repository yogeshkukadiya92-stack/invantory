"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/mongodb/client";
import type { MovementType, StockRow } from "@/lib/types";

interface ProductMovement {
  created_at: string;
  id: string;
  quantity: number;
  reason: string | null;
  type: MovementType;
}

function inr(value: number) {
  return "₹" + value.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function movementLabel(type: MovementType) {
  if (type === "in") return "In";
  if (type === "out") return "Out";
  return "Adjust";
}

function movementBadge(type: MovementType) {
  if (type === "in") return "bg-emerald-50 text-emerald-700";
  if (type === "out") return "bg-amber-50 text-amber-700";
  return "bg-stone-100 text-stone-600";
}

export function DashboardProductSearch({ products }: { products: StockRow[] }) {
  const supabase = createClient();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(products[0]?.product_id ?? "");
  const [activity, setActivity] = useState<ProductMovement[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [activityError, setActivityError] = useState<string | null>(null);

  const selected = useMemo(
    () => products.find((product) => product.product_id === selectedId) ?? null,
    [products, selectedId]
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? products.filter((product) =>
          [product.name, product.sku, product.barcode]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(q))
        )
      : products;
    return list.slice(0, 8);
  }, [products, query]);

  useEffect(() => {
    if (!selectedId) {
      setActivity([]);
      return;
    }

    let cancelled = false;
    async function loadActivity() {
      setLoadingActivity(true);
      setActivityError(null);
      const { data, error } = await supabase
        .from("stock_movements")
        .select("id, type, quantity, reason, created_at")
        .eq("product_id", selectedId)
        .order("created_at", { ascending: false })
        .limit(12);
      if (!cancelled) {
        setActivity((data ?? []) as ProductMovement[]);
        setActivityError(error?.message ?? null);
        setLoadingActivity(false);
      }
    }
    loadActivity();
    return () => {
      cancelled = true;
    };
  }, [selectedId, supabase]);

  if (products.length === 0) return null;

  return (
    <section className="mt-6 rounded-lg border border-stone-200 bg-white">
      <div className="border-b border-stone-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-stone-900">Product search</h2>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div>
          <label className="block">
            <span className="sr-only">Search products</span>
            <input
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Product name, SKU, barcode search karo..."
            type="search"
            />
          </label>

          <div className="mt-3 overflow-hidden rounded-lg border border-stone-100">
            {results.length === 0 ? (
              <p className="px-3 py-4 text-sm text-stone-500">
                Product nathi malyo.
              </p>
            ) : (
              <ul className="divide-y divide-stone-100">
                {results.map((product) => (
                  <li key={product.product_id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(product.product_id)}
                      className={`flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors ${
                        selectedId === product.product_id
                          ? "bg-emerald-50"
                          : "hover:bg-stone-50"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-stone-900">
                          {product.name}
                        </p>
                        <p className="text-xs text-stone-500">
                          Stock: {product.stock} {product.unit}
                        </p>
                      </div>
                      <span
                        className={`ml-3 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          product.stock <= 0
                            ? "bg-red-50 text-red-700"
                            : product.stock <= product.min_stock_level
                              ? "bg-amber-50 text-amber-700"
                              : "bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {product.stock}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {selected && (
          <div className="space-y-4 lg:border-l lg:border-stone-200 lg:pl-4">
            <div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-base font-semibold text-stone-900">
                    {selected.name}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    {[selected.sku && `SKU ${selected.sku}`, selected.barcode && `Barcode ${selected.barcode}`]
                      .filter(Boolean)
                      .join(" · ") || "No SKU/barcode"}
                  </p>
                </div>
                <span className="rounded-full bg-stone-100 px-3 py-1 text-sm font-semibold text-stone-900">
                  {selected.stock} {selected.unit}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-stone-500">Current stock</p>
                  <p className="mt-1 text-lg font-semibold text-stone-900">
                    {selected.stock}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-stone-500">Min level</p>
                  <p className="mt-1 text-lg font-semibold text-stone-900">
                    {selected.min_stock_level}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-stone-500">Sell price</p>
                  <p className="mt-1 text-lg font-semibold text-stone-900">
                    {inr(Number(selected.selling_price))}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-stone-500">Stock value</p>
                  <p className="mt-1 text-lg font-semibold text-stone-900">
                    {inr(Number(selected.stock_value))}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <Link
                  href={`/sales/new?product_id=${encodeURIComponent(selected.product_id)}`}
                  className="rounded-lg bg-emerald-700 px-3 py-2.5 text-center text-sm font-medium text-white hover:bg-emerald-800"
                >
                  Add sale
                </Link>
                <Link
                  href={`/purchases/new?product_id=${encodeURIComponent(selected.product_id)}`}
                  className="rounded-lg border border-emerald-700 px-3 py-2.5 text-center text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                >
                  Add purchase
                </Link>
              </div>
            </div>

            <div className="border-t border-stone-200 pt-3">
              <div className="pb-2">
                <h3 className="text-sm font-semibold text-stone-900">
                  Product activity
                </h3>
              </div>
              {loadingActivity ? (
                <div className="space-y-2 py-2" role="status" aria-label="Loading product activity">
                  <div className="h-10 animate-pulse rounded-md bg-stone-100" />
                  <div className="h-10 animate-pulse rounded-md bg-stone-100" />
                </div>
              ) : activityError ? (
                <p className="rounded-md bg-red-50 px-3 py-3 text-sm text-red-800">
                  {activityError}
                </p>
              ) : activity.length === 0 ? (
                <p className="py-3 text-sm text-stone-500">
                  Aa product ni activity nathi.
                </p>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {activity.map((movement) => (
                    <li
                      key={movement.id}
                    className="flex items-center justify-between py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-stone-900">
                          {movement.reason || movementLabel(movement.type)}
                        </p>
                        <p className="text-xs text-stone-500">
                          {new Date(movement.created_at).toLocaleString("en-IN", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>
                      <span
                        className={`ml-3 shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${movementBadge(
                          movement.type
                        )}`}
                      >
                        {movementLabel(movement.type)} {Math.abs(movement.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
