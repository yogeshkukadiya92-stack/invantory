"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/mongodb/client";
import type { POStatus, PurchaseOrder } from "@/lib/types";
import {
  ActionMenu,
  EmptyState,
  LoadingState,
  PageHeader,
  menuItemClass,
} from "@/components/DashboardUI";

const PAGE_SIZE = 50;

interface PORow extends PurchaseOrder {
  suppliers: { name: string } | null;
}

export default function PurchasesPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<PORow[]>([]);
  const [statusFilter, setStatusFilter] = useState<"" | POStatus>("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      300
    );
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, statusFilter]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      let query = supabase
        .from("purchase_orders")
        .select("*, suppliers(name)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (statusFilter) query = query.eq("status", statusFilter);
      if (debouncedSearch) {
        const safeSearch = debouncedSearch.replace(/[,()]/g, "");
        query = query.or(
          `po_no.ilike.%${safeSearch}%,supplier_name.ilike.%${safeSearch}%,status.ilike.%${safeSearch}%`
        );
      }
      const { data, count, error: loadError } = await query;
      if (cancelled) return;
      if (loadError) {
        setError(loadError.message);
        setLoading(false);
        return;
      }
      setRows((data ?? []) as PORow[]);
      setTotal(count ?? 0);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, page, statusFilter, supabase]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const inr = (value: number) =>
    "₹" + Number(value).toLocaleString("en-IN", { maximumFractionDigits: 0 });
  const statusBadge = (status: POStatus) =>
    status === "received"
      ? "bg-emerald-50 text-emerald-700"
      : status === "cancelled"
        ? "bg-stone-100 text-stone-600"
        : "bg-amber-50 text-amber-700";

  return (
    <div>
      <PageHeader
        title="Purchases"
        description="Purchase orders, receiving, supplier costs, and incoming stock"
        actions={
          <Link
            href="/purchases/new"
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            New purchase
          </Link>
        }
      />

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <section className="mt-5 rounded-lg border border-stone-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-stone-200 p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex max-w-full overflow-x-auto rounded-md border border-stone-300 bg-stone-50 p-1" aria-label="Filter purchases by status">
            {(["", "ordered", "received", "cancelled"] as const).map((status) => (
              <button
                key={status || "all"}
                type="button"
                onClick={() => setStatusFilter(status)}
                aria-pressed={statusFilter === status}
                className={`rounded px-3 py-1.5 text-sm font-medium capitalize ${
                  statusFilter === status
                    ? "bg-white text-stone-950 shadow-sm"
                    : "text-stone-600 hover:text-stone-950"
                }`}
              >
                {status || "All"}
              </button>
            ))}
          </div>
          <label className="block w-full lg:max-w-sm">
            <span className="sr-only">Search purchases</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search PO or supplier"
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
            />
          </label>
        </div>

        {loading ? (
          <LoadingState label="Loading purchases" />
        ) : rows.length === 0 ? (
          <EmptyState
            title={debouncedSearch ? "No matching purchases" : "No purchase orders found"}
            description={
              debouncedSearch
                ? "Try another PO number, supplier, or status."
                : "Create a purchase order to record supplier costs and incoming stock."
            }
            actionHref={debouncedSearch ? undefined : "/purchases/new"}
            actionLabel={debouncedSearch ? undefined : "Create purchase"}
          />
        ) : (
          <ul className="divide-y divide-stone-100">
            {rows.map((purchase) => (
              <li key={purchase.id} className="flex items-center gap-2 px-2 py-1.5 sm:px-3">
                <Link
                  href={`/purchases/${purchase.id}`}
                  className="min-w-0 flex-1 rounded-md px-2 py-2 hover:bg-stone-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-stone-900">
                        {purchase.po_no}
                        <span className="ml-2 font-normal text-stone-500">
                          {purchase.suppliers?.name ?? "No supplier"}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-stone-500">
                        {new Date(purchase.created_at).toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-stone-900">{inr(purchase.total)}</p>
                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${statusBadge(purchase.status)}`}>
                        {purchase.status}
                      </span>
                    </div>
                  </div>
                </Link>
                <ActionMenu label={`Actions for ${purchase.po_no}`}>
                  <Link href={`/purchases/${purchase.id}`} className={menuItemClass}>View purchase</Link>
                  {purchase.status !== "cancelled" && (
                    <Link href={`/purchases/${purchase.id}/edit`} className={menuItemClass}>Edit purchase</Link>
                  )}
                </ActionMenu>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!loading && total > PAGE_SIZE && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-stone-500">
            {total.toLocaleString("en-IN")} orders · page {page + 1} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              disabled={page === 0}
              className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
