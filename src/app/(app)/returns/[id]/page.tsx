"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/mongodb/client";
import type {
  BusinessSettings,
  Customer,
  Sale,
  SaleReturn,
  SaleReturnItem,
} from "@/lib/types";

export default function ReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const supabase = createClient();

  const [ret, setRet] = useState<SaleReturn | null>(null);
  const [items, setItems] = useState<SaleReturnItem[]>([]);
  const [sale, setSale] = useState<Sale | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [business, setBusiness] = useState<BusinessSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [returnResult, itemResult, businessResult] = await Promise.all([
        supabase.from("sale_returns").select("*").eq("id", id).single(),
        supabase.from("sale_return_items").select("*").eq("return_id", id),
        supabase.from("business_settings").select("*").eq("id", 1).single(),
      ]);
      const loadError =
        returnResult.error ?? itemResult.error ?? businessResult.error;
      if (loadError) {
        setError(loadError.message);
        setLoading(false);
        return;
      }
      const retData = returnResult.data as SaleReturn | null;
      setRet(retData);
      setItems((itemResult.data ?? []) as SaleReturnItem[]);
      setBusiness(businessResult.data as BusinessSettings | null);

      if (retData) {
        const { data: s, error: saleError } = await supabase
          .from("sales")
          .select("*")
          .eq("id", retData.sale_id)
          .single();
        if (saleError) setError(saleError.message);
        const saleData = s as Sale | null;
        setSale(saleData);
        if (saleData?.customer_id) {
          const { data: c, error: customerError } = await supabase
            .from("customers")
            .select("*")
            .eq("id", saleData.customer_id)
            .single();
          if (customerError) setError(customerError.message);
          setCustomer(c as Customer | null);
        }
      }
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading)
    return <p className="py-8 text-center text-sm text-stone-500">Loading...</p>;
  if (!ret)
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-stone-200 bg-white p-5 text-center">
        <p className="text-sm text-stone-600">
          {error ? `Credit note load nathi thayu: ${error}` : "Credit note not found"}
        </p>
        <Link href="/sales" className="mt-3 inline-flex text-sm font-semibold text-emerald-700 hover:text-emerald-800">
          Back to sales
        </Link>
      </div>
    );

  const inr = (n: number) =>
    "₹" +
    Number(n).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <div className="mx-auto max-w-2xl">
      <style>{`
        @media print {
          header, nav, .no-print { display: none !important; }
          main { padding: 0 !important; max-width: 100% !important; }
          body { background: white !important; }
          .invoice-card { border: none !important; box-shadow: none !important; }
        }
      `}</style>

      <div className="no-print flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={sale ? `/sales/${sale.id}` : "/sales"}
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          ← {sale?.invoice_no ?? "Sales"}
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Print credit note
        </button>
      </div>

      {error && (
        <p role="alert" className="no-print mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="invoice-card mt-4 rounded-lg border border-stone-200 bg-white p-6">
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
            {business?.gstin && (
              <p className="text-xs font-medium text-stone-600">
                GSTIN: {business.gstin}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
              Credit Note
            </p>
            <p className="mt-1 text-sm font-bold text-stone-900">
              {ret.return_no}
            </p>
            <p className="text-xs text-stone-500">
              {new Date(ret.created_at).toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
            {sale && (
              <p className="mt-1 text-xs text-stone-500">
                Against invoice:{" "}
                <span className="font-medium">{sale.invoice_no}</span>
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 text-sm">
          <p className="text-xs font-medium uppercase text-stone-400">
            Customer
          </p>
          <p className="mt-0.5 font-medium text-stone-900">
            {customer?.name ?? "Walk-in customer"}
          </p>
          {customer?.phone && (
            <p className="text-xs text-stone-500">{customer.phone}</p>
          )}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-y border-stone-200 text-left text-xs text-stone-500">
                <th className="py-2 font-medium">#</th>
                <th className="py-2 font-medium">Item</th>
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
                  <td className="py-2 text-right text-stone-700">
                    {Number(it.quantity)} {it.unit}
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

        <div className="mt-4 ml-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between text-stone-600">
            <span>Subtotal</span>
            <span>{inr(ret.subtotal)}</span>
          </div>
          <div className="flex justify-between text-stone-600">
            <span>CGST</span>
            <span>{inr(Number(ret.tax_total) / 2)}</span>
          </div>
          <div className="flex justify-between text-stone-600">
            <span>SGST</span>
            <span>{inr(Number(ret.tax_total) / 2)}</span>
          </div>
          {Number(ret.discount ?? 0) > 0 && (
            <div className="flex justify-between text-stone-600">
              <span>Invoice discount</span>
              <span>−{inr(Number(ret.discount))}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-stone-200 pt-1.5 text-base font-bold text-amber-700">
            <span>Total refund</span>
            <span>{inr(ret.total)}</span>
          </div>
        </div>

        {ret.reason && (
          <p className="mt-4 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-600">
            Reason: {ret.reason}
          </p>
        )}
      </div>
    </div>
  );
}
