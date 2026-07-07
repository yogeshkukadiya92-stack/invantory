"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/mongodb/client";
import type { POStatus, PurchaseOrder } from "@/lib/types";

const PAGE_SIZE = 50;

interface PORow extends PurchaseOrder {
  suppliers: { name: string } | null;
}

export default function PurchasesPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<PORow[]>([]);
  const [statusFilter, setStatusFilter] = useState<"" | POStatus>("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPage(0);
  }, [statusFilter]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      let query = supabase
        .from("purchase_orders")
        .select("*, suppliers(name)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (statusFilter) query = query.eq("status", statusFilter);

      const { data, count } = await query;
      setRows((data ?? []) as PORow[]);
      setTotal(count ?? 0);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const inr = (n: number) =>
    "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 0 });

  const statusBadge = (s: POStatus) =>
    s === "received"
      ? "bg-emerald-50 text-emerald-700"
      : s === "cancelled"
        ? "bg-stone-100 text-stone-500"
        : "bg-amber-50 text-amber-700";

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-stone-900">Purchases</h1>
        <Link
          href="/purchases/new"
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 transition-colors"
        >
          + New PO
        </Link>
      </div>

      <div className="mt-4 flex gap-2">
        {(["", "ordered", "received", "cancelled"] as const).map((s) => (
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
            No purchase orders yet. Supplier pase thi mangavva &quot;+ New
            PO&quot; dabavo.
          </p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {rows.map((po) => (
              <li key={po.id}>
                <Link
                  href={`/purchases/${po.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-stone-50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-900">
                      {po.po_no}
                      <span className="ml-2 font-normal text-stone-500">
                        {po.suppliers?.name ?? "No supplier"}
                      </span>
                    </p>
                    <p className="text-xs text-stone-500">
                      {new Date(po.created_at).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                  <div className="ml-3 flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusBadge(po.status)}`}
                    >
                      {po.status}
                    </span>
                    <span className="text-sm font-semibold text-stone-900">
                      {inr(po.total)}
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
            {total.toLocaleString("en-IN")} POs · page {page + 1} of{" "}
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
