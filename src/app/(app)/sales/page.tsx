"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/mongodb/client";
import type { Sale, SaleStatus } from "@/lib/types";
import {
  ActionMenu,
  EmptyState,
  LoadingState,
  PageHeader,
  menuItemClass,
} from "@/components/DashboardUI";
import { indiaStartOfDayIso, indiaStartOfMonthIso } from "@/lib/date";

const PAGE_SIZE = 50;

interface SaleRow extends Sale {
  customers: { name: string } | null;
  return_total: number;
}

export default function SalesPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<"" | SaleStatus>("");
  const [customerId, setCustomerId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [todayTotal, setTodayTotal] = useState(0);
  const [monthTotal, setMonthTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCustomerId(new URLSearchParams(window.location.search).get("customer_id") ?? "");
  }, []);

  useEffect(() => {
    setPage(0);
  }, [customerId, statusFilter]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      let query = supabase
        .from("sales")
        .select("*, customers(name)", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (statusFilter) query = query.eq("status", statusFilter);
      if (customerId) query = query.eq("customer_id", customerId);

      const today = indiaStartOfDayIso();
      const monthStart = indiaStartOfMonthIso();
      const [
        listResult,
        todayResult,
        monthResult,
        todayReturnResult,
        monthReturnResult,
      ] = await Promise.all([
        query,
        supabase.from("sales").select("grand_total").gte("created_at", today),
        supabase.from("sales").select("grand_total").gte("created_at", monthStart),
        supabase.from("sale_returns").select("total").gte("created_at", today),
        supabase.from("sale_returns").select("total").gte("created_at", monthStart),
      ]);
      const listRows = (listResult.data ?? []) as Array<
        Omit<SaleRow, "return_total">
      >;
      const pageReturnResult =
        listRows.length > 0
          ? await supabase
              .from("sale_returns")
              .select("sale_id, total")
              .in("sale_id", listRows.map((sale) => sale.id))
          : { data: [], error: null };
      if (cancelled) return;
      const requestError =
        listResult.error ??
        todayResult.error ??
        monthResult.error ??
        todayReturnResult.error ??
        monthReturnResult.error ??
        pageReturnResult.error;
      if (requestError) {
        setError(requestError.message);
        setLoading(false);
        return;
      }
      const returnsBySale = new Map<string, number>();
      for (const returnRow of pageReturnResult.data ?? []) {
        const saleId = String(returnRow.sale_id);
        returnsBySale.set(
          saleId,
          (returnsBySale.get(saleId) ?? 0) + Number(returnRow.total)
        );
      }
      setRows(
        listRows.map((sale) => ({
          ...sale,
          return_total: returnsBySale.get(sale.id) ?? 0,
        }))
      );
      setTotal(listResult.count ?? 0);
      setTodayTotal(
        ((todayResult.data ?? []) as { grand_total: number }[]).reduce(
          (sum, row) => sum + Number(row.grand_total),
          0
        ) -
          ((todayReturnResult.data ?? []) as { total: number }[]).reduce(
            (sum, row) => sum + Number(row.total),
            0
          )
      );
      setMonthTotal(
        ((monthResult.data ?? []) as { grand_total: number }[]).reduce(
          (sum, row) => sum + Number(row.grand_total),
          0
        ) -
          ((monthReturnResult.data ?? []) as { total: number }[]).reduce(
            (sum, row) => sum + Number(row.total),
            0
          )
      );
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [customerId, page, statusFilter, supabase]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((sale) =>
      [sale.invoice_no, sale.customers?.name, sale.payment_method, sale.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const inr = (value: number) =>
    "₹" + value.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  const statusBadge = (status: SaleStatus) =>
    status === "paid"
      ? "bg-emerald-50 text-emerald-700"
      : status === "unpaid"
        ? "bg-red-50 text-red-700"
        : "bg-amber-50 text-amber-700";

  function clearCustomerFilter() {
    const url = new URL(window.location.href);
    url.searchParams.delete("customer_id");
    window.history.replaceState({}, "", url.pathname + url.search);
    setCustomerId("");
  }

  return (
    <div>
      <PageHeader
        title="Sales"
        description="Invoices, payments, returns, and customer balances"
        actions={
          <Link
            href="/sales/new"
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            New sale
          </Link>
        }
      />

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <p className="text-sm text-stone-500">Today&apos;s sales</p>
          <p className="mt-1 text-2xl font-semibold text-stone-950">{inr(todayTotal)}</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <p className="text-sm text-stone-500">This month</p>
          <p className="mt-1 text-2xl font-semibold text-stone-950">{inr(monthTotal)}</p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <section className="mt-4 rounded-lg border border-stone-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-stone-200 p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex max-w-full overflow-x-auto rounded-md border border-stone-300 bg-stone-50 p-1" aria-label="Filter sales by status">
            {(["", "paid", "unpaid", "partial"] as const).map((status) => (
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
            <span className="sr-only">Search current sales</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search invoice or customer"
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-emerald-600 focus:outline-none"
            />
          </label>
        </div>

        {customerId && (
          <div className="flex items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
            <span>Showing one customer&apos;s invoices</span>
            <button type="button" onClick={clearCustomerFilter} className="font-semibold underline">
              Clear
            </button>
          </div>
        )}

        {loading ? (
          <LoadingState label="Loading sales" />
        ) : filteredRows.length === 0 ? (
          <EmptyState
            title={search ? "No matching sales" : "No sales found"}
            description={
              search
                ? "Try another invoice number, customer, or payment status."
                : "Create a sale to generate an invoice and update stock."
            }
            actionHref={search ? undefined : "/sales/new"}
            actionLabel={search ? undefined : "Create sale"}
          />
        ) : (
          <ul className="divide-y divide-stone-100">
            {filteredRows.map((sale) => (
              <li key={sale.id} className="flex items-center gap-2 px-2 py-1.5 sm:px-3">
                <Link
                  href={`/sales/${sale.id}`}
                  className="min-w-0 flex-1 rounded-md px-2 py-2 hover:bg-stone-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-stone-900">
                        {sale.invoice_no}
                        <span className="ml-2 font-normal text-stone-500">
                          {sale.customers?.name ?? "Walk-in"}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-stone-500">
                        {new Date(sale.created_at).toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                        {" · "}
                        <span className="capitalize">{sale.payment_method}</span>
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-stone-900">
                        {inr(Number(sale.grand_total) - sale.return_total)}
                      </p>
                      {sale.return_total > 0 && (
                        <p className="text-[11px] font-medium text-amber-700">
                          {inr(sale.return_total)} returned
                        </p>
                      )}
                      <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${statusBadge(sale.status)}`}>
                        {sale.status}
                      </span>
                    </div>
                  </div>
                </Link>
                <ActionMenu label={`Actions for ${sale.invoice_no}`}>
                  <Link href={`/sales/${sale.id}`} className={menuItemClass}>View invoice</Link>
                  {sale.return_total === 0 && (
                    <Link href={`/sales/${sale.id}/edit`} className={menuItemClass}>Edit sale</Link>
                  )}
                  <Link href={`/sales/${sale.id}/return`} className={menuItemClass}>Create return</Link>
                </ActionMenu>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!loading && total > PAGE_SIZE && (
        <div className="mt-3 flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-stone-500">
            {total.toLocaleString("en-IN")} invoices · page {page + 1} of {totalPages}
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
