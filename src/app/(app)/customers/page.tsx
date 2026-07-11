"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/mongodb/client";
import type { Customer } from "@/lib/types";
import {
  ActionMenu,
  Drawer,
  EmptyState,
  LoadingState,
  PageHeader,
  menuItemClass,
  useToast,
} from "@/components/DashboardUI";

interface CustomerRow extends Customer {
  balanceDue: number;
  salesCount: number;
  salesTotal: number;
}

const emptyForm = { address: "", gstin: "", name: "", phone: "" };

export default function CustomersPage() {
  const supabase = createClient();
  const { showToast } = useToast();
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [
      { data: customers, error: customerError },
      { data: sales, error: salesError },
      { data: returns, error: returnsError },
    ] =
      await Promise.all([
        supabase.from("customers").select("*").order("name"),
        supabase
          .from("sales")
          .select("id, customer_id, grand_total, paid_amount")
          .not("customer_id", "is", null),
        supabase.from("sale_returns").select("sale_id, total"),
      ]);

    if (customerError || salesError || returnsError) {
      setError(
        customerError?.message ??
          salesError?.message ??
          returnsError?.message ??
          "Customers load nathi thaya"
      );
      setLoading(false);
      return;
    }

    const returnsBySale = new Map<string, number>();
    for (const returnRow of returns ?? []) {
      const saleId = String(returnRow.sale_id);
      returnsBySale.set(
        saleId,
        (returnsBySale.get(saleId) ?? 0) + Number(returnRow.total)
      );
    }
    const stats = new Map<string, { count: number; due: number; total: number }>();
    for (const sale of sales ?? []) {
      const key = sale.customer_id as string;
      const current = stats.get(key) ?? { count: 0, due: 0, total: 0 };
      const netTotal = Math.max(
        0,
        Number(sale.grand_total) - (returnsBySale.get(String(sale.id)) ?? 0)
      );
      current.count += 1;
      current.total += netTotal;
      current.due += Math.max(0, netTotal - Number(sale.paid_amount));
      stats.set(key, current);
    }

    setRows(
      ((customers ?? []) as Customer[]).map((customer) => {
        const stat = stats.get(customer.id);
        return {
          ...customer,
          balanceDue: stat?.due ?? 0,
          salesCount: stat?.count ?? 0,
          salesTotal: stat?.total ?? 0,
        };
      })
    );
    setError(null);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const closeDrawer = useCallback(() => {
    if (saving) return;
    setDrawerOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setError(null);
  }, [saving]);

  function startCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setDrawerOpen(true);
  }

  function startEdit(customer: Customer) {
    setEditing(customer.id);
    setForm({
      address: customer.address ?? "",
      gstin: customer.gstin ?? "",
      name: customer.name,
      phone: customer.phone ?? "",
    });
    setError(null);
    setDrawerOpen(true);
  }

  async function save() {
    if (saving) return;
    if (!form.name.trim()) {
      setError("Customer name jaruri che");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      address: form.address.trim() || null,
      gstin: form.gstin.trim() || null,
      name: form.name.trim(),
      phone: form.phone.trim() || null,
    };
    const { error: saveError } = editing
      ? await supabase.from("customers").update(payload).eq("id", editing)
      : await supabase.from("customers").insert(payload);
    setSaving(false);
    if (saveError) {
      setError(saveError.message);
      return;
    }
    const message = editing ? "Customer changes saved" : "Customer added";
    closeDrawer();
    await load();
    showToast(message);
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((customer) =>
      [customer.name, customer.phone, customer.gstin]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [rows, search]);

  const inr = (value: number) =>
    "₹" + value.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  const input =
    "w-full rounded-md border border-stone-300 bg-white px-3 py-2.5 text-sm focus:border-emerald-600 focus:outline-none";
  const label = "mb-1 block text-sm font-medium text-stone-700";

  return (
    <div>
      <PageHeader
        title="Customers"
        description={`${rows.length.toLocaleString("en-IN")} customer records and outstanding balances`}
        actions={
          <button
            type="button"
            onClick={startCreate}
            className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            Add customer
          </button>
        }
      />

      {error && !drawerOpen && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{error}</span>
          <button type="button" onClick={load} className="font-semibold underline">
            Retry
          </button>
        </div>
      )}

      <div className="mt-5 rounded-lg border border-stone-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-stone-200 p-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative block w-full sm:max-w-md">
            <span className="sr-only">Search customers</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, phone, or GSTIN"
              className={input}
            />
          </label>
          <p className="text-xs text-stone-500">
            {filtered.length.toLocaleString("en-IN")} shown
          </p>
        </div>

        {loading ? (
          <LoadingState label="Loading customers" />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={search ? "No matching customers" : "No customers yet"}
            description={
              search
                ? "Try a different name, phone number, or GSTIN."
                : "Add a customer to track invoices, sales, and outstanding balances."
            }
          />
        ) : (
          <ul className="divide-y divide-stone-100">
            {filtered.map((customer) => (
              <li key={customer.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-stone-900">
                    {customer.name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-stone-500">
                    {[customer.phone, customer.gstin && `GSTIN ${customer.gstin}`]
                      .filter(Boolean)
                      .join(" · ") || "No contact details"}
                  </p>
                </div>
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-semibold text-stone-900">
                    {inr(customer.salesTotal)}
                  </p>
                  <p className="text-xs text-stone-500">
                    {customer.salesCount} sales
                    {customer.balanceDue > 0 && (
                      <span className="ml-1 font-semibold text-red-600">
                        · {inr(customer.balanceDue)} due
                      </span>
                    )}
                  </p>
                </div>
                <ActionMenu label={`Actions for ${customer.name}`}>
                  <button
                    type="button"
                    onClick={() => startEdit(customer)}
                    className={menuItemClass}
                  >
                    Edit customer
                  </button>
                  <Link
                    href={`/sales?customer_id=${encodeURIComponent(customer.id)}`}
                    className={menuItemClass}
                  >
                    View sales
                  </Link>
                </ActionMenu>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editing ? "Edit customer" : "Add customer"}
        description="Contact and tax details used on invoices"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={closeDrawer}
              disabled={saving}
              className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {saving ? "Saving..." : editing ? "Save changes" : "Add customer"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="customer-name" className={label}>
              Customer name <span className="text-red-600">*</span>
            </label>
            <input
              id="customer-name"
              autoFocus
              className={input}
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              autoComplete="name"
            />
          </div>
          <div>
            <label htmlFor="customer-phone" className={label}>Phone</label>
            <input
              id="customer-phone"
              type="tel"
              className={input}
              value={form.phone}
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
              autoComplete="tel"
            />
          </div>
          <div>
            <label htmlFor="customer-gstin" className={label}>GSTIN</label>
            <input
              id="customer-gstin"
              className={`${input} uppercase`}
              value={form.gstin}
              onChange={(event) => setForm((current) => ({ ...current, gstin: event.target.value }))}
              maxLength={30}
            />
          </div>
          <div>
            <label htmlFor="customer-address" className={label}>Address</label>
            <textarea
              id="customer-address"
              rows={4}
              className={input}
              value={form.address}
              onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
              autoComplete="street-address"
            />
          </div>
          {error && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
        </div>
      </Drawer>
    </div>
  );
}
