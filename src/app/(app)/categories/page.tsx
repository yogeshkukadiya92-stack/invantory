"use client";

import { useCallback, useEffect, useState } from "react";
import type { Category } from "@/lib/types";

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/categories");
    const { data } = await response.json();
    setCategories((data ?? []) as Category[]);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addCategory() {
    if (!name.trim()) return setMessage({ kind: "err", text: "Category name is required" });
    const response = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    const result = await response.json();
    if (!response.ok) return setMessage({ kind: "err", text: result.error ?? "Could not add category" });
    setMessage({ kind: "ok", text: "Category added" });
    setName("");
    load();
  }

  async function deleteCategory(id: string) {
    if (!confirm("Delete this category? It will be removed from products.")) return;
    const response = await fetch(`/api/categories/${id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) return setMessage({ kind: "err", text: result.error ?? "Could not delete category" });
    setMessage({ kind: "ok", text: "Category deleted" });
    load();
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:p-7">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-indigo-700">Catalog structure</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Categories</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">Keep products organized for faster reporting, scanning, and stock review.</p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <input className="w-full rounded-xl border px-3 py-2 text-sm" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addCategory()} placeholder="New category name" />
          <button onClick={addCategory} className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-slate-800">
            Add category
          </button>
        </div>
        {message && (
          <p className={`mt-4 rounded-2xl px-4 py-3 text-sm font-semibold ${message.kind === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{message.text}</p>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {categories.length === 0 ? (
          <p className="rounded-3xl border border-slate-200 bg-white px-5 py-12 text-center text-sm font-semibold text-slate-500 shadow-sm sm:col-span-2 xl:col-span-3">
            No categories yet.
          </p>
        ) : (
          categories.map((category) => (
            <article key={category.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-black text-slate-950">{category.name}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    Created {new Date(category.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                </div>
                <button onClick={() => deleteCategory(category.id)} className="rounded-xl border border-rose-100 px-3 py-2 text-xs font-black text-rose-700 transition hover:bg-rose-50">
                  Delete
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
