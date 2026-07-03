"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PurchaseOrder, StockRow, Supplier } from "@/lib/types";

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export default function PurchasesPage() {
  const [products, setProducts] = useState<StockRow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [form, setForm] = useState({
    product_id: "",
    supplier_id: "",
    quantity: "",
    unit_cost: "",
    reference: "",
    note: "",
  });

  const load = useCallback(async () => {
    const [productsRes, suppliersRes, purchasesRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/suppliers"),
      fetch("/api/purchases"),
    ]);
    const [{ data: productData }, { data: supplierData }, { data: purchaseData }] = await Promise.all([
      productsRes.json(),
      suppliersRes.json(),
      purchasesRes.json(),
    ]);
    setProducts((productData ?? []) as StockRow[]);
    setSuppliers((supplierData ?? []) as Supplier[]);
    setPurchases((purchaseData ?? []) as PurchaseOrder[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedProduct = products.find((product) => product.product_id === form.product_id);
  const totalCost = useMemo(() => {
    const quantity = Number(form.quantity) || 0;
    const cost = Number(form.unit_cost) || selectedProduct?.purchase_price || 0;
    return quantity * cost;
  }, [form.quantity, form.unit_cost, selectedProduct?.purchase_price]);

  async function submitPurchase() {
    setBusy(true);
    setMessage(null);
    const response = await fetch("/api/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        unit_cost: form.unit_cost || selectedProduct?.purchase_price || 0,
      }),
    });
    const result = await response.json();
    setBusy(false);

    if (!response.ok) {
      setMessage({ kind: "err", text: result.error ?? "Could not receive stock" });
      return;
    }

    setMessage({ kind: "ok", text: `Purchase received. New stock: ${result.new_stock}` });
    setForm({ product_id: "", supplier_id: "", quantity: "", unit_cost: "", reference: "", note: "" });
    load();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:p-7">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">Procurement</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Purchase receiving</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Receive supplier stock and automatically update inventory levels.
            </p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
            Recent purchases: {purchases.length}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.78fr)_minmax(0,1.2fr)]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-black text-slate-950">Receive stock</h2>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">Product</span>
              <select
                className="w-full rounded-xl border px-3 py-2 text-sm"
                value={form.product_id}
                onChange={(event) => {
                  const product = products.find((item) => item.product_id === event.target.value);
                  setForm((current) => ({
                    ...current,
                    product_id: event.target.value,
                    unit_cost: product ? String(product.purchase_price) : current.unit_cost,
                  }));
                }}
              >
                <option value="">Select product</option>
                {products.map((product) => (
                  <option key={product.product_id} value={product.product_id}>
                    {product.name} ({product.stock} {product.unit})
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">Supplier</span>
              <select
                className="w-full rounded-xl border px-3 py-2 text-sm"
                value={form.supplier_id}
                onChange={(event) => setForm((current) => ({ ...current, supplier_id: event.target.value }))}
              >
                <option value="">No supplier selected</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-slate-700">Quantity</span>
                <input
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  type="number"
                  min="1"
                  value={form.quantity}
                  onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))}
                  placeholder="50"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-slate-700">Unit cost</span>
                <input
                  className="w-full rounded-xl border px-3 py-2 text-sm"
                  type="number"
                  min="0"
                  value={form.unit_cost}
                  onChange={(event) => setForm((current) => ({ ...current, unit_cost: event.target.value }))}
                  placeholder="0"
                />
              </label>
            </div>

            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">Bill or PO reference</span>
              <input
                className="w-full rounded-xl border px-3 py-2 text-sm"
                value={form.reference}
                onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))}
                placeholder="INV-1001"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-bold text-slate-700">Note</span>
              <textarea
                className="min-h-24 w-full rounded-xl border px-3 py-2 text-sm"
                value={form.note}
                onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                placeholder="Quality check, batch note, delivery remark..."
              />
            </label>

            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">Estimated value</p>
              <p className="mt-1 text-2xl font-black text-slate-950">{currency.format(totalCost)}</p>
            </div>

            {message && (
              <p className={`rounded-2xl px-4 py-3 text-sm font-semibold ${message.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>
                {message.text}
              </p>
            )}

            <button
              onClick={submitPurchase}
              disabled={busy}
              className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
            >
              {busy ? "Receiving..." : "Receive purchase"}
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-black text-slate-950">Purchase history</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">Latest received stock entries.</p>
          </div>
          {purchases.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm font-semibold text-slate-500">No purchases received yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs font-black uppercase tracking-[0.08em] text-slate-400">
                    <th className="px-5 py-3">Product</th>
                    <th className="px-5 py-3">Supplier</th>
                    <th className="px-5 py-3 text-right">Qty</th>
                    <th className="px-5 py-3 text-right">Value</th>
                    <th className="px-5 py-3 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {purchases.map((purchase) => (
                    <tr key={purchase.id} className="hover:bg-slate-50/70">
                      <td className="max-w-[260px] px-5 py-4">
                        <p className="truncate font-bold text-slate-950">{purchase.products?.name ?? "Unknown product"}</p>
                        {purchase.reference && <p className="text-xs font-medium text-slate-500">{purchase.reference}</p>}
                      </td>
                      <td className="px-5 py-4 text-slate-600">{purchase.suppliers?.name || "Direct"}</td>
                      <td className="px-5 py-4 text-right font-black text-slate-950">
                        {purchase.quantity} {purchase.products?.unit ?? ""}
                      </td>
                      <td className="px-5 py-4 text-right font-bold text-slate-700">{currency.format(purchase.quantity * purchase.unit_cost)}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-right text-xs font-semibold text-slate-500">
                        {new Date(purchase.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
