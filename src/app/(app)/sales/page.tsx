"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/mongodb/client";
import type { Sale, SaleStatus } from "@/lib/types";

const PAGE_SIZE = 50;

interface SaleRow extends Sale {
  customers: { name: string } | null;
}

export default function SalesPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<"" | SaleStatus>("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [todayTotal, setTodayTotal] = useState(0);
  const [monthTotal, setMonthTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPage(0);
  }, [statusFilter]);

  useEffect(() => {
    async function load() {
      setLoading(true);

      let query = supabase
        .from("sales")
        .select("*, customers(name)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (statusFilter) query = query.eq("status", statusFilter);

      const today = new Date().toISOString().slice(0, 10);
      const monthStart = today.slice(0, 8) + "01";

      const [{ data, count }, { data: todayRows }, { data: monthRows }] =
        await Promise.all([
          query,
          supabase.from("sales").select("grand_total").gte("created_at", today),
          supabase
            .from("sales")
            .select("grand_total")
            .gte("created_at", monthStart),
        ]);

      setRows((data ?? []) as SaleRow[]);
      setTotal(count ?? 0);
      setTodayTotal(
        ((todayRows ?? []) as { grand_total: number }[]).reduce(
          (s, r) => s + Number(r.grand_total),
          0
        )
      );
      setMonthTotal(
        ((monthRows ?? []) as { grand_total: number }[]).reduce(
          (s, r) => s + Number(r.grand_total),
          0
        )
      );
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const inr = (n: number) =>
    "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

  const statusBadge = (s: SaleStatus) =>
    s === "paid"
      ? "bg-emerald-50 text-emerald-700"
      : s === "unpaid"
        ? "bg-red-50 text-red-700"
        : "bg-amber-50 text-amber-700";

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-stone-900">Sales</h1>
        <Link
          href="/sales/new"
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 transition-colors"
        >
          + New sale
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-sm text-stone-500">Today&apos;s sales</p>
          <p className="mt-1 text-2xl font-semibold text-stone-900">
            {inr(todayTotal)}
          </p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-sm text-stone-500">This month</p>
          <p className="mt-1 text-2xl font-semibold text-stone-900">
            {inr(monthTotal)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        {(["", "paid", "unpaid", "partial"] as const).map((s) => (
          <button
            key={s || "all"}
            onClick={() => setStatusFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-sm capitalize transition-colors ${
              statusFilter === s
                ? "bg-emerald-700 text-white"
                : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
            }`}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-white">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-stone-500">
            Loading...
          </p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-stone-500">
            No sales yet. Pehli sale banavva &quot;+ New sale&quot; dabavo.
          </p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {rows.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/sales/${s.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-stone-50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-900">
                      {s.invoice_no}
                      <span className="ml-2 font-normal text-stone-500">
                        {s.customers?.name ?? "Walk-in"}
                      </span>
                    </p>
                    <p className="text-xs text-stone-500">
                      {new Date(s.created_at).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                      {" · "}
                      <span className="capitalize">{s.payment_method}</span>
                    </p>
                  </div>
                  <div className="ml-3 flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusBadge(s.status)}`}
                    >
                      {s.status}
                    </span>
                    <span className="text-sm font-semibold text-stone-900">
                      {inr(Number(s.grand_total))}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!loading && total > PAGE_SIZE && (
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-stone-500">
            {total.toLocaleString("en-IN")} invoices · page {page + 1} of{" "}
            {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-40"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
