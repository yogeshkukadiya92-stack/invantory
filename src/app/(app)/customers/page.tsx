"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Customer } from "@/lib/types";

interface CustomerRow extends Customer {
  salesCount: number;
  salesTotal: number;
  balanceDue: number;
}

export default function CustomersPage() {
  const supabase = createClient();

  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", gstin: "", address: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: customers }, { data: sales }] = await Promise.all([
      supabase.from("customers").select("*").order("name"),
      supabase
        .from("sales")
        .select("customer_id, grand_total, paid_amount")
        .not("customer_id", "is", null),
    ]);

    const stats = new Map<
      string,
      { count: number; total: number; due: number }
    >();
    for (const s of sales ?? []) {
      const key = s.customer_id as string;
      const cur = stats.get(key) ?? { count: 0, total: 0, due: 0 };
      cur.count += 1;
      cur.total += Number(s.grand_total);
      cur.due += Number(s.grand_total) - Number(s.paid_amount);
      stats.set(key, cur);
    }

    setRows(
      ((customers ?? []) as Customer[]).map((c) => {
        const st = stats.get(c.id);
        return {
          ...c,
          salesCount: st?.count ?? 0,
          salesTotal: st?.total ?? 0,
          balanceDue: st?.due ?? 0,
        };
      })
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(c: Customer) {
    setEditing(c.id);
    setForm({
      name: c.name,
      phone: c.phone ?? "",
      gstin: c.gstin ?? "",
      address: c.address ?? "",
    });
    setShowForm(true);
  }

  function resetForm() {
    setEditing(null);
    setForm({ name: "", phone: "", gstin: "", address: "" });
    setShowForm(false);
  }

  async function save() {
    if (!form.name.trim()) {
      setError("Customer name jaruri che");
      return;
    }
    setError(null);
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      gstin: form.gstin.trim() || null,
      address: form.address.trim() || null,
    };
    const { error } = editing
      ? await supabase.from("customers").update(payload).eq("id", editing)
      : await supabase.from("customers").insert(payload);
    if (error) {
      setError(error.message);
      return;
    }
    resetForm();
    load();
  }

  const filtered = rows.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q)
    );
  });

  const inr = (n: number) =>
    "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  const input =
    "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600";

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-stone-900">Customers</h1>
        <button
          onClick={() => (showForm ? resetForm() : setShowForm(true))}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 transition-colors"
        >
          {showForm ? "Cancel" : "+ Add customer"}
        </button>
      </div>

      {showForm && (
        <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-stone-900">
            {editing ? "Edit customer" : "New customer"}
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input
              className={input}
              placeholder="Name *"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <input
              className={input}
              placeholder="Phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
            <input
              className={input}
              placeholder="GSTIN (B2B customers mate)"
              value={form.gstin}
              onChange={(e) => setForm((f) => ({ ...f, gstin: e.target.value }))}
            />
            <input
              className={input}
              placeholder="Address"
              value={form.address}
              onChange={(e) =>
                setForm((f) => ({ ...f, address: e.target.value }))
              }
            />
          </div>
          {error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <button
            onClick={save}
            className="mt-3 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            {editing ? "Save changes" : "Add customer"}
          </button>
        </div>
      )}

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or phone..."
        className={`${input} mt-4 w-full`}
      />

      <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-white">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-stone-500">
            Loading...
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-stone-500">
            No customers yet
          </p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {filtered.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stone-900">{c.name}</p>
                  <p className="text-xs text-stone-500">
                    {[c.phone, c.gstin && `GSTIN ${c.gstin}`]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </p>
                </div>
                <div className="ml-3 flex shrink-0 items-center gap-3 text-right">
                  <div>
                    <p className="text-sm font-semibold text-stone-900">
                      {inr(c.salesTotal)}
                    </p>
                    <p className="text-xs text-stone-500">
                      {c.salesCount} sales
                      {c.balanceDue > 0 && (
                        <span className="ml-1 font-semibold text-red-600">
                          · {inr(c.balanceDue)} due
                        </span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => startEdit(c)}
                    className="text-xs text-emerald-700 hover:underline"
                  >
                    Edit
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
