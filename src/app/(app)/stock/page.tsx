"use client";

import { useCallback, useEffect, useState } from "react";
import type { MovementResult, MovementType, StockRow, Supplier } from "@/lib/types";

interface MovementRow {
  id: string;
  type: MovementType;
  quantity: number;
  reason: string | null;
  created_at: string;
  products: { name: string; unit: string } | null;
  profiles: { full_name: string } | null;
}

export default function StockPage() {
  const [products, setProducts] = useState<StockRow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [form, setForm] = useState({
    product_id: "",
    type: "in" as MovementType,
    quantity: "",
    reason: "",
    supplier_id: "",
  });

  const loadProducts = useCallback(async () => {
    const response = await fetch("/api/products");
    const { data } = await response.json();
    setProducts((data ?? []) as StockRow[]);
  }, []);

  const loadMovements = useCallback(async () => {
    const response = await fetch("/api/stock/movements");
    const { data } = await response.json();
    setMovements((data ?? []) as MovementRow[]);
  }, []);

  useEffect(() => {
    async function load() {
      const suppliersRes = await fetch("/api/suppliers");
      const { data: sups } = await suppliersRes.json();
      setSuppliers((sups ?? []) as Supplier[]);
      await Promise.all([loadProducts(), loadMovements()]);
    }
    load();
  }, [loadMovements, loadProducts]);

  const selectedProduct = products.find((p) => p.product_id === form.product_id);

  async function handleSubmit() {
    if (!form.product_id) {
      setMessage({ kind: "err", text: "Select a product" });
      return;
    }
    const qty = parseInt(form.quantity, 10);
    if (!qty || (form.type !== "adjustment" && qty <= 0)) {
      setMessage({ kind: "err", text: "Enter a valid quantity" });
      return;
    }
    setBusy(true);
    setMessage(null);

    const response = await fetch("/api/stock/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: form.product_id,
        type: form.type,
        quantity: qty,
        reason: form.reason.trim() || null,
        supplier_id: form.type === "in" && form.supplier_id ? form.supplier_id : null,
      }),
    });
    const result = (await response.json()) as MovementResult & { error?: string };
    setBusy(false);

    if (!response.ok) {
      setMessage({ kind: "err", text: result.error ?? "Could not save entry" });
      return;
    }
    setMessage({ kind: "ok", text: `Entry saved - new stock: ${result.new_stock}` });
    setForm((f) => ({ ...f, quantity: "", reason: "" }));
    await Promise.all([loadProducts(), loadMovements()]);
  }

  const input =
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600";
  const label = "block text-sm font-medium text-stone-700 mb-1";

  return (
    <div>
      <h1 className="text-xl font-semibold text-stone-900">Stock</h1>
      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <section className="rounded-2xl border border-stone-200 bg-white p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-stone-900">Manual entry</h2>
          <div className="mt-3 space-y-3">
            <div>
              <label className={label}>Product</label>
              <select className={input} value={form.product_id} onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}>
                <option value="">Select product</option>
                {products.map((p) => (
                  <option key={p.product_id} value={p.product_id}>
                    {p.name} ({p.stock} {p.unit})
                  </option>
                ))}
              </select>
              {selectedProduct && (
                <p className="mt-1 text-xs text-stone-500">
                  Current stock: {selectedProduct.stock} {selectedProduct.unit}
                </p>
              )}
            </div>

            <div>
              <label className={label}>Type</label>
              <div className="grid grid-cols-3 gap-2">
                {(["in", "out", "adjustment"] as MovementType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setForm((f) => ({ ...f, type: t }))}
                    className={`rounded-lg py-2 text-sm font-medium capitalize transition-colors ${
                      form.type === t
                        ? t === "in"
                          ? "bg-emerald-700 text-white"
                          : t === "out"
                            ? "bg-amber-600 text-white"
                            : "bg-stone-700 text-white"
                        : "border border-stone-300 text-stone-700 hover:bg-stone-50"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={label}>Quantity</label>
              <input type="number" inputMode="numeric" className={input} value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} placeholder={form.type === "adjustment" ? "e.g. -5 or 10" : "e.g. 50"} />
            </div>

            {form.type === "in" && (
              <div>
                <label className={label}>Supplier (optional)</label>
                <select className={input} value={form.supplier_id} onChange={(e) => setForm((f) => ({ ...f, supplier_id: e.target.value }))}>
                  <option value="">None</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className={label}>Reason (optional)</label>
              <input className={input} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder={form.type === "adjustment" ? "e.g. Damaged, count correction" : "e.g. New purchase, sale"} />
            </div>

            {message && (
              <p className={`rounded-lg px-3 py-2 text-sm ${message.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
                {message.text}
              </p>
            )}

            <button onClick={handleSubmit} disabled={busy} className="w-full rounded-lg bg-emerald-700 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-800 disabled:opacity-50">
              {busy ? "Saving..." : "Save entry"}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white lg:col-span-3">
          <div className="border-b border-stone-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-stone-900">Recent movements (last 50)</h2>
          </div>
          {movements.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-stone-500">No entries yet</p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {movements.map((m) => {
                const badge =
                  m.type === "in"
                    ? "bg-emerald-50 text-emerald-700"
                    : m.type === "out"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-stone-100 text-stone-600";
                const sign = m.type === "in" ? "+" : m.type === "out" ? "-" : m.quantity > 0 ? "+" : "";
                return (
                  <li key={m.id} className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-stone-900">{m.products?.name ?? "Unknown"}</p>
                      <p className="truncate text-xs text-stone-500">
                        {new Date(m.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                        {m.profiles?.full_name ? ` - ${m.profiles.full_name}` : ""}
                        {m.reason ? ` - ${m.reason}` : ""}
                      </p>
                    </div>
                    <span className={`ml-3 shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${badge}`}>
                      {sign}
                      {m.type === "adjustment" ? m.quantity : Math.abs(m.quantity)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
