"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/mongodb/client";
import type {
  Location,
  PurchaseOrder,
  PurchaseOrderItem,
  Supplier,
} from "@/lib/types";
import { ConfirmDialog } from "@/components/DashboardUI";

export default function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const supabase = createClient();

  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [items, setItems] = useState<PurchaseOrderItem[]>([]);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"cancel" | "receive" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [purchaseResult, itemResult, locationResult] = await Promise.all([
      supabase.from("purchase_orders").select("*").eq("id", id).single(),
      supabase.from("purchase_order_items").select("*").eq("po_id", id),
      supabase.from("locations").select("*").order("name"),
    ]);
    const loadError =
      purchaseResult.error ?? itemResult.error ?? locationResult.error;
    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }
    const locList = (locationResult.data ?? []) as Location[];
    setLocations(locList);
    setLocationId(
      (prev) =>
        prev || (locList.find((l) => l.is_default) ?? locList[0])?.id || ""
    );
    const poData = purchaseResult.data as PurchaseOrder | null;
    setPo(poData);
    setItems((itemResult.data ?? []) as PurchaseOrderItem[]);
    if (poData?.supplier_id) {
      const { data: s, error: supplierError } = await supabase
        .from("suppliers")
        .select("*")
        .eq("id", poData.supplier_id)
        .single();
      if (supplierError) setError(supplierError.message);
      setSupplier(s as Supplier | null);
    }
    setLoading(false);
  }, [supabase, id]);

  useEffect(() => {
    load();
  }, [load]);

  async function receive() {
    if (busy) return;
    setConfirmAction(null);
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("receive_purchase_order", {
      p_po_id: id,
      p_location_id: locationId || null,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    load();
  }

  async function cancel() {
    if (busy) return;
    setConfirmAction(null);
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("cancel_purchase_order", {
      p_po_id: id,
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    load();
  }

  if (loading)
    return <p className="py-8 text-center text-sm text-stone-500">Loading...</p>;
  if (!po)
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-stone-200 bg-white p-5 text-center">
        <p className="text-sm text-stone-600">
          {error ? `Purchase load nathi thayu: ${error}` : "PO not found"}
        </p>
        <Link href="/purchases" className="mt-3 inline-flex text-sm font-semibold text-emerald-700 hover:text-emerald-800">
          Back to purchases
        </Link>
      </div>
    );

  const inr = (n: number) =>
    "₹" +
    Number(n).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const statusBadge =
    po.status === "received"
      ? "bg-emerald-50 text-emerald-700"
      : po.status === "cancelled"
        ? "bg-stone-100 text-stone-500"
        : "bg-amber-50 text-amber-700";

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/purchases"
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          ← Purchases
        </Link>
        {po.status === "ordered" && (
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/purchases/${po.id}/edit`}
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              Edit
            </Link>
            {locations.length > 1 && (
              <select
                aria-label="Receive at location"
                className="rounded-lg border border-stone-300 bg-white px-2 py-2 text-sm"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={() => setConfirmAction("cancel")}
              disabled={busy}
              className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Cancel PO
            </button>
            <button
              type="button"
              onClick={() => setConfirmAction("receive")}
              disabled={busy}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {busy ? "Processing..." : "Receive goods"}
            </button>
          </div>
        )}
        {po.status === "received" && (
          <Link
            href={`/purchases/${po.id}/edit`}
            className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            Edit
          </Link>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-4 rounded-lg border border-stone-200 bg-white p-6">
        <div className="flex items-start justify-between border-b border-stone-200 pb-4">
          <div>
            <p className="text-sm font-bold text-stone-900">{po.po_no}</p>
            <p className="mt-0.5 text-xs text-stone-500">
              {new Date(po.created_at).toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
            {supplier && (
              <p className="mt-2 text-sm text-stone-700">
                <span className="text-xs uppercase text-stone-400">
                  Supplier:{" "}
                </span>
                {supplier.name}
                {supplier.phone && (
                  <span className="text-stone-500"> · {supplier.phone}</span>
                )}
              </p>
            )}
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusBadge}`}
          >
            {po.status}
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[500px] text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs text-stone-500">
                <th className="py-2 font-medium">#</th>
                <th className="py-2 font-medium">Item</th>
                <th className="py-2 text-right font-medium">Qty</th>
                <th className="py-2 text-right font-medium">Cost</th>
                <th className="py-2 text-right font-medium">Total</th>
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
                    {it.quantity} {it.unit}
                  </td>
                  <td className="py-2 text-right text-stone-700">
                    {inr(it.cost)}
                  </td>
                  <td className="py-2 text-right font-medium text-stone-900">
                    {inr(it.line_total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex justify-between border-t border-stone-200 pt-3 text-base font-bold text-stone-900">
          <span>Total</span>
          <span>{inr(po.total)}</span>
        </div>

        {po.note && (
          <p className="mt-4 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-600">
            Note: {po.note}
          </p>
        )}
        {po.received_at && (
          <p className="mt-3 text-xs text-emerald-700">
            Received on{" "}
            {new Date(po.received_at).toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
        )}
      </div>
      <ConfirmDialog
        open={confirmAction !== null}
        onCancel={() => setConfirmAction(null)}
        onConfirm={confirmAction === "receive" ? receive : cancel}
        busy={busy}
        tone={confirmAction === "receive" ? "primary" : "danger"}
        title={confirmAction === "receive" ? "Receive this purchase?" : "Cancel this purchase?"}
        description={
          confirmAction === "receive"
            ? "Every item will be added to stock at the selected location."
            : "The order will remain in history but cannot be received or edited afterward."
        }
        confirmLabel={confirmAction === "receive" ? "Receive goods" : "Cancel purchase"}
      />
    </div>
  );
}
