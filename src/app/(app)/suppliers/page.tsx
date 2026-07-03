"use client";

import { useCallback, useEffect, useState } from "react";
import type { Supplier } from "@/lib/types";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "" });

  const load = useCallback(async () => {
    const response = await fetch("/api/suppliers");
    const { data } = await response.json();
    setSuppliers((data ?? []) as Supplier[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addSupplier() {
    if (!form.name.trim()) return setMessage({ kind: "err", text: "Supplier name is required" });
    const response = await fetch("/api/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
      }),
    });
    const result = await response.json();
    if (!response.ok) return setMessage({ kind: "err", text: result.error ?? "Could not add supplier" });
    setMessage({ kind: "ok", text: "Supplier added" });
    setForm({ name: "", phone: "", address: "" });
    load();
  }

  async function deleteSupplier(id: string) {
    if (!confirm("Delete this supplier?")) return;
    const response = await fetch(`/api/suppliers/${id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return setMessage({ kind: "err", text: result.error ?? "Could not delete supplier" });
    setMessage({ kind: "ok", text: "Supplier deleted" });
    load();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:p-7">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">Master data</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Suppliers</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">Manage vendors used in purchases and stock receiving.</p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.72fr)_minmax(0,1.28fr)]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-black text-slate-950">Add supplier</h2>
          <div className="mt-4 space-y-3">
            <input className="w-full rounded-xl border px-3 py-2 text-sm" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Supplier name" />
            <input className="w-full rounded-xl border px-3 py-2 text-sm" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="Phone" />
            <textarea className="min-h-24 w-full rounded-xl border px-3 py-2 text-sm" value={form.address} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} placeholder="Address" />
            {message && (
              <p className={`rounded-2xl px-4 py-3 text-sm font-semibold ${message.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{message.text}</p>
            )}
            <button onClick={addSupplier} className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-slate-800">
              Add supplier
            </button>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-black text-slate-950">Supplier directory</h2>
            <p className="mt-1 text-xs font-medium text-slate-500">{suppliers.length} saved suppliers</p>
          </div>
          {suppliers.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm font-semibold text-slate-500">No suppliers yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {suppliers.map((supplier) => (
                <li key={supplier.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950">{supplier.name}</p>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      {[supplier.phone, supplier.address].filter(Boolean).join(" - ") || "No contact details"}
                    </p>
                  </div>
                  <button onClick={() => deleteSupplier(supplier.id)} className="w-fit rounded-xl border border-rose-100 px-3 py-2 text-xs font-black text-rose-700 transition hover:bg-rose-50">
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
