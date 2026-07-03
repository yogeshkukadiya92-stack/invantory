"use client";

import { useCallback, useEffect, useState } from "react";
import type { MovementResult, StockRow } from "@/lib/types";

interface AdjustmentRow {
  id: string;
  quantity: number;
  reason: string | null;
  created_at: string;
  products: { name: string; unit: string } | null;
  profiles: { full_name: string } | null;
}

export default function AdjustmentsPage() {
  const [products, setProducts] = useState<StockRow[]>([]);
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [form, setForm] = useState({ product_id: "", quantity: "", reason: "" });

  const load = useCallback(async () => {
    const [productsRes, movementsRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/stock/movements"),
    ]);
    const [{ data: productData }, { data: movementData }] = await Promise.all([
      productsRes.json(),
      movementsRes.json(),
    ]);
    setProducts((productData ?? []) as StockRow[]);
    setAdjustments(((movementData ?? []) as Array<AdjustmentRow & { type: string }>).filter((row) => row.type === "adjustment"));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedProduct = products.find((product) => product.product_id === form.product_id);

  async function saveAdjustment() {
    const quantity = Number(form.quantity);
    if (!form.product_id) return setMessage({ kind: "err", text: "Select a product" });
    if (!Number.isFinite(quantity) || quantity === 0) return setMessage({ kind: "err", text: "Enter a positive or negative adjustment" });
    if (!form.reason.trim()) return setMessage({ kind: "err", text: "Reason is required for audit trail" });

    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/stock/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: form.product_id,
        type: "adjustment",
        quantity,
        reason: form.reason.trim(),
      }),
    });
    const result = (await response.json()) as MovementResult & { error?: string };
    setBusy(false);

    if (!response.ok) return setMessage({ kind: "err", text: result.error ?? "Could not save adjustment" });

    setMessage({ kind: "ok", text: `Adjustment saved. New stock: ${result.new_stock}` });
    setForm({ product_id: "", quantity: "", reason: "" });
    load();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:p-7">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Inventory control</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Stock adjustments</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">Correct damaged, missing, counted, or returned stock with a clear audit reason.</p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.75fr)_minmax(0,1.25fr)]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-black text-slate-950">New adjustment</h2>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">Product</span>
              <select className="w-full rounded-xl border px-3 py-2 text-sm" value={form.product_id} onChange={(event) => setForm((current) => ({ ...current, product_id: event.target.value }))}>
                <option value="">Select product</option>
                {products.map((product) => (
                  <option key={product.product_id} value={product.product_id}>
                    {product.name} ({product.stock} {product.unit})
                  </option>
                ))}
              </select>
              {selectedProduct && (
                <p className="mt-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                  Current stock: {selectedProduct.stock} {selectedProduct.unit}
                </p>
              )}
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">Adjustment quantity</span>
              <input className="w-full rounded-xl border px-3 py-2 text-sm" type="number" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} placeholder="-5 or 10" />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">Reason</span>
              <textarea className="min-h-24 w-full rounded-xl border px-3 py-2 text-sm" value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Cycle count correction, damaged goods, missing stock..." />
            </label>

            {message && (
              <p className={`rounded-2xl px-4 py-3 text-sm font-semibold ${message.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>
                {message.text}
              </p>
            )}

            <button onClick={saveAdjustment} disabled={busy} className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50">
              {busy ? "Saving..." : "Save adjustment"}
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-black text-slate-950">Adjustment audit</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">Every correction stays visible for accountability.</p>
          </div>
          {adjustments.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm font-semibold text-slate-500">No adjustments recorded yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {adjustments.map((adjustment) => (
                <li key={adjustment.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950">{adjustment.products?.name ?? "Unknown product"}</p>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      {new Date(adjustment.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                      {adjustment.reason ? ` - ${adjustment.reason}` : ""}
                    </p>
                  </div>
                  <span className={`w-fit rounded-full px-3 py-1 text-xs font-black ${adjustment.quantity >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                    {adjustment.quantity > 0 ? "+" : ""}{adjustment.quantity} {adjustment.products?.unit ?? ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
