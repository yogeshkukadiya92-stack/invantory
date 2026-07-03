"use client";

import { useCallback, useEffect, useState } from "react";
import type { Category, Supplier } from "@/lib/types";

export default function SettingsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [newSupplier, setNewSupplier] = useState({ name: "", phone: "" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [catsRes, supsRes] = await Promise.all([
      fetch("/api/categories"),
      fetch("/api/suppliers"),
    ]);
    const [{ data: cats }, { data: sups }] = await Promise.all([
      catsRes.json(),
      supsRes.json(),
    ]);
    setCategories((cats ?? []) as Category[]);
    setSuppliers((sups ?? []) as Supplier[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addCategory() {
    if (!newCategory.trim()) return;
    setError(null);
    const response = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newCategory.trim() }),
    });
    const result = await response.json();
    if (!response.ok) return setError(result.error ?? "Could not add category");
    setNewCategory("");
    load();
  }

  async function deleteCategory(id: string) {
    if (!confirm("Delete this category? It will be removed from products.")) return;
    const response = await fetch(`/api/categories/${id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return setError(result.error ?? "Could not delete category");
    load();
  }

  async function addSupplier() {
    if (!newSupplier.name.trim()) return;
    setError(null);
    const response = await fetch("/api/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newSupplier.name.trim(),
        phone: newSupplier.phone.trim() || null,
      }),
    });
    const result = await response.json();
    if (!response.ok) return setError(result.error ?? "Could not add supplier");
    setNewSupplier({ name: "", phone: "" });
    load();
  }

  async function deleteSupplier(id: string) {
    if (!confirm("Delete this supplier?")) return;
    const response = await fetch(`/api/suppliers/${id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return setError(result.error ?? "Could not delete supplier");
    load();
  }

  const input =
    "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600";

  return (
    <div>
      <h1 className="text-xl font-semibold text-stone-900">Settings</h1>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-stone-900">Categories</h2>
          <div className="mt-3 flex gap-2">
            <input
              className={`${input} flex-1`}
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCategory()}
              placeholder="New category name"
            />
            <button onClick={addCategory} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">
              Add
            </button>
          </div>
          <ul className="mt-3 divide-y divide-stone-100">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-stone-800">{c.name}</span>
                <button onClick={() => deleteCategory(c.id)} className="text-xs text-red-500 hover:text-red-700">
                  Delete
                </button>
              </li>
            ))}
            {categories.length === 0 && <li className="py-3 text-sm text-stone-500">No categories yet</li>}
          </ul>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-stone-900">Suppliers</h2>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input className={`${input} flex-1`} value={newSupplier.name} onChange={(e) => setNewSupplier((s) => ({ ...s, name: e.target.value }))} placeholder="Supplier name" />
            <input className={`${input} sm:w-36`} value={newSupplier.phone} onChange={(e) => setNewSupplier((s) => ({ ...s, phone: e.target.value }))} placeholder="Phone" />
            <button onClick={addSupplier} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">
              Add
            </button>
          </div>
          <ul className="mt-3 divide-y divide-stone-100">
            {suppliers.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2.5">
                <div>
                  <span className="text-sm text-stone-800">{s.name}</span>
                  {s.phone && <span className="ml-2 text-xs text-stone-500">{s.phone}</span>}
                </div>
                <button onClick={() => deleteSupplier(s.id)} className="text-xs text-red-500 hover:text-red-700">
                  Delete
                </button>
              </li>
            ))}
            {suppliers.length === 0 && <li className="py-3 text-sm text-stone-500">No suppliers yet</li>}
          </ul>
        </section>
      </div>

      <p className="mt-4 text-xs text-stone-400">
        Note: The first registered account becomes admin automatically.
      </p>
    </div>
  );
}
