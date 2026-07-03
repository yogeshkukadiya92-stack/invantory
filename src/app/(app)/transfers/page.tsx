"use client";

import { useCallback, useEffect, useState } from "react";
import type { StockRow, TransferRecord } from "@/lib/types";

export default function TransfersPage() {
  const [products, setProducts] = useState<StockRow[]>([]);
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [form, setForm] = useState({
    product_id: "",
    quantity: "",
    from_location: "Main store",
    to_location: "",
    note: "",
  });

  const load = useCallback(async () => {
    const [productsRes, transfersRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/transfers"),
    ]);
    const [{ data: productData }, { data: transferData }] = await Promise.all([
      productsRes.json(),
      transfersRes.json(),
    ]);
    setProducts((productData ?? []) as StockRow[]);
    setTransfers((transferData ?? []) as TransferRecord[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function saveTransfer() {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const result = await response.json();
    setBusy(false);

    if (!response.ok) return setMessage({ kind: "err", text: result.error ?? "Could not save transfer" });

    setMessage({ kind: "ok", text: "Transfer recorded" });
    setForm({ product_id: "", quantity: "", from_location: "Main store", to_location: "", note: "" });
    load();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:p-7">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-cyan-700">Stock movement</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Internal transfers</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">
          Track product movement between counters, rooms, warehouses, or branches without changing total company stock.
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.75fr)_minmax(0,1.25fr)]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-black text-slate-950">Record transfer</h2>
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
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">Quantity</span>
              <input className="w-full rounded-xl border px-3 py-2 text-sm" type="number" min="1" value={form.quantity} onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))} placeholder="10" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-slate-700">From</span>
                <input className="w-full rounded-xl border px-3 py-2 text-sm" value={form.from_location} onChange={(event) => setForm((current) => ({ ...current, from_location: event.target.value }))} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-slate-700">To</span>
                <input className="w-full rounded-xl border px-3 py-2 text-sm" value={form.to_location} onChange={(event) => setForm((current) => ({ ...current, to_location: event.target.value }))} placeholder="Branch A" />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">Note</span>
              <textarea className="min-h-24 w-full rounded-xl border px-3 py-2 text-sm" value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} placeholder="Courier, staff handover, shelf movement..." />
            </label>
            {message && (
              <p className={`rounded-2xl px-4 py-3 text-sm font-semibold ${message.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>
                {message.text}
              </p>
            )}
            <button onClick={saveTransfer} disabled={busy} className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50">
              {busy ? "Saving..." : "Save transfer"}
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-black text-slate-950">Transfer log</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">Location movement history for operations tracking.</p>
          </div>
          {transfers.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm font-semibold text-slate-500">No transfers recorded yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {transfers.map((transfer) => (
                <li key={transfer.id} className="px-5 py-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950">{transfer.products?.name ?? "Unknown product"}</p>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {transfer.from_location} to {transfer.to_location}
                        {transfer.note ? ` - ${transfer.note}` : ""}
                      </p>
                    </div>
                    <span className="w-fit rounded-full bg-cyan-50 px-3 py-1 text-xs font-black text-cyan-700">
                      {transfer.quantity} {transfer.products?.unit ?? ""}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
