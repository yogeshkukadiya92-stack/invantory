"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type {
  BusinessSettings,
  Customer,
  Sale,
  SaleItem,
  SaleReturn,
} from "@/lib/types";

export default function SaleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const supabase = createClient();

  const [sale, setSale] = useState<Sale | null>(null);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [business, setBusiness] = useState<BusinessSettings | null>(null);
  const [returns, setReturns] = useState<SaleReturn[]>([]);
  const [soldBy, setSoldBy] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: s }, { data: li }, { data: bs }, { data: rets }] =
        await Promise.all([
          supabase.from("sales").select("*").eq("id", id).single(),
          supabase.from("sale_items").select("*").eq("sale_id", id),
          supabase.from("business_settings").select("*").eq("id", 1).single(),
          supabase
            .from("sale_returns")
            .select("*")
            .eq("sale_id", id)
            .order("created_at"),
        ]);
      setReturns((rets ?? []) as SaleReturn[]);
      const saleData = s as Sale | null;
      setSale(saleData);
      setItems((li ?? []) as SaleItem[]);
      setBusiness(bs as BusinessSettings | null);

      if (saleData?.customer_id) {
        const { data: c } = await supabase
          .from("customers")
          .select("*")
          .eq("id", saleData.customer_id)
          .single();
        setCustomer(c as Customer | null);
      }
      if (saleData?.created_by) {
        const { data: p } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", saleData.created_by)
          .single();
        setSoldBy(p?.full_name ?? "");
      }
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading)
    return <p className="py-8 text-center text-sm text-stone-500">Loading...</p>;
  if (!sale)
    return (
      <p className="py-8 text-center text-sm text-stone-500">
        Invoice not found
      </p>
    );

  const inr = (n: number) =>
    "₹" +
    Number(n).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const balance = Number(sale.grand_total) - Number(sale.paid_amount);

  return (
    <div className="mx-auto max-w-2xl">
      {/* Print vakhte app chrome hide thay */}
      <style>{`
        @media print {
          header, nav, .no-print { display: none !important; }
          main { padding: 0 !important; max-width: 100% !important; }
          body { background: white !important; }
          .invoice-card { border: none !important; box-shadow: none !important; }
        }
      `}</style>

      <div className="no-print flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/sales" className="text-sm text-stone-500 hover:text-stone-700">
          ← Sales
        </Link>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/sales/${sale.id}/return`}
            className="rounded-lg border border-amber-600 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50"
          >
            ↩ Return
          </Link>
          <button
            onClick={() => {
              const lines = [
                `*${business?.name || "Invoice"}*`,
                `Invoice: ${sale.invoice_no}`,
                `Date: ${new Date(sale.created_at).toLocaleDateString("en-IN")}`,
                "",
                ...items.map(
                  (it) =>
                    `• ${it.product_name} × ${it.quantity} = ${inr(it.line_total)}`
                ),
                "",
                `*Total: ${inr(sale.grand_total)}*`,
                balance > 0 ? `Balance due: ${inr(balance)}` : "Paid ✓",
              ];
              const phone = (customer?.phone ?? "").replace(/\D/g, "");
              const phoneParam = phone
                ? `phone=${phone.length === 10 ? "91" + phone : phone}&`
                : "";
              window.open(
                `https://api.whatsapp.com/send?${phoneParam}text=${encodeURIComponent(lines.join("\n"))}`,
                "_blank"
              );
            }}
            className="rounded-lg border border-emerald-700 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
          >
            💬 WhatsApp
          </button>
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
          >
            🖨 Print invoice
          </button>
        </div>
      </div>

      {/* INVOICE */}
      <div className="invoice-card mt-4 rounded-2xl border border-stone-200 bg-white p-6">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-stone-200 pb-4">
          <div>
            <h2 className="text-lg font-bold text-stone-900">
              {business?.name || "Your Business"}
            </h2>
            {business?.address && (
              <p className="mt-0.5 whitespace-pre-line text-xs text-stone-500">
                {business.address}
              </p>
            )}
            {business?.phone && (
              <p className="text-xs text-stone-500">Ph: {business.phone}</p>
            )}
            {business?.gstin && (
              <p className="text-xs font-medium text-stone-600">
                GSTIN: {business.gstin}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
              Tax Invoice
            </p>
            <p className="mt-1 text-sm font-bold text-stone-900">
              {sale.invoice_no}
            </p>
            <p className="text-xs text-stone-500">
              {new Date(sale.created_at).toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>
        </div>

        {/* Customer */}
        <div className="mt-4 flex justify-between text-sm">
          <div>
            <p className="text-xs font-medium uppercase text-stone-400">
              Bill to
            </p>
            <p className="mt-0.5 font-medium text-stone-900">
              {customer?.name ?? "Walk-in customer"}
            </p>
            {customer?.phone && (
              <p className="text-xs text-stone-500">{customer.phone}</p>
            )}
            {customer?.gstin && (
              <p className="text-xs text-stone-500">GSTIN: {customer.gstin}</p>
            )}
          </div>
          <div className="text-right text-xs text-stone-500">
            <p>
              Payment:{" "}
              <span className="font-medium capitalize text-stone-700">
                {sale.payment_method}
              </span>
            </p>
            <p className="mt-0.5">
              Status:{" "}
              <span
                className={`font-semibold capitalize ${
                  sale.status === "paid"
                    ? "text-emerald-700"
                    : sale.status === "unpaid"
                      ? "text-red-600"
                      : "text-amber-600"
                }`}
              >
                {sale.status}
              </span>
            </p>
            {soldBy && <p className="mt-0.5">By: {soldBy}</p>}
          </div>
        </div>

        {/* Items */}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-y border-stone-200 text-left text-xs text-stone-500">
                <th className="py-2 font-medium">#</th>
                <th className="py-2 font-medium">Item</th>
                <th className="py-2 font-medium">HSN</th>
                <th className="py-2 text-right font-medium">Qty</th>
                <th className="py-2 text-right font-medium">Rate</th>
                <th className="py-2 text-right font-medium">GST%</th>
                <th className="py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {items.map((it, idx) => (
                <tr key={it.id}>
                  <td className="py-2 text-stone-500">{idx + 1}</td>
                  <td className="py-2 font-medium text-stone-900">
                    {it.product_name}
                  </td>
                  <td className="py-2 text-xs text-stone-500">
                    {it.hsn_code ?? "—"}
                  </td>
                  <td className="py-2 text-right text-stone-700">
                    {it.quantity} {it.unit}
                  </td>
                  <td className="py-2 text-right text-stone-700">
                    {inr(it.price)}
                  </td>
                  <td className="py-2 text-right text-stone-700">
                    {Number(it.gst_rate)}%
                  </td>
                  <td className="py-2 text-right font-medium text-stone-900">
                    {inr(it.line_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="mt-4 ml-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between text-stone-600">
            <span>Subtotal</span>
            <span>{inr(sale.subtotal)}</span>
          </div>
          <div className="flex justify-between text-stone-600">
            <span>CGST</span>
            <span>{inr(Number(sale.tax_total) / 2)}</span>
          </div>
          <div className="flex justify-between text-stone-600">
            <span>SGST</span>
            <span>{inr(Number(sale.tax_total) / 2)}</span>
          </div>
          {Number(sale.discount) > 0 && (
            <div className="flex justify-between text-stone-600">
              <span>Discount</span>
              <span>−{inr(sale.discount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-stone-200 pt-1.5 text-base font-bold text-stone-900">
            <span>Grand total</span>
            <span>{inr(sale.grand_total)}</span>
          </div>
          {sale.status !== "paid" && (
            <>
              <div className="flex justify-between text-stone-600">
                <span>Paid</span>
                <span>{inr(sale.paid_amount)}</span>
              </div>
              <div className="flex justify-between font-semibold text-red-600">
                <span>Balance due</span>
                <span>{inr(balance)}</span>
              </div>
            </>
          )}
        </div>

        {sale.note && (
          <p className="mt-4 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-600">
            Note: {sale.note}
          </p>
        )}

        <p className="mt-6 border-t border-stone-100 pt-3 text-center text-xs text-stone-400">
          Thank you for your business!
        </p>
      </div>

      {/* RETURNS / CREDIT NOTES */}
      {returns.length > 0 && (
        <div className="no-print mt-4 rounded-2xl border border-amber-200 bg-white">
          <div className="border-b border-stone-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-stone-900">
              ↩ Returns against this invoice
            </h2>
          </div>
          <ul className="divide-y divide-stone-100">
            {returns.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/returns/${r.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-stone-50"
                >
                  <div>
                    <p className="text-sm font-medium text-stone-900">
                      {r.return_no}
                    </p>
                    <p className="text-xs text-stone-500">
                      {new Date(r.created_at).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                      {r.reason ? ` · ${r.reason}` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-amber-700">
                    −{inr(r.total)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
