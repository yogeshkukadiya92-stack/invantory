"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/DashboardUI";
import { createClient } from "@/lib/mongodb/client";
import type { Location, Sale, SaleItem } from "@/lib/types";

interface ReturnableItem extends SaleItem {
  alreadyReturned: number;
  returnQty: string;
}

export default function SaleReturnPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const supabase = createClient();

  const [sale, setSale] = useState<Sale | null>(null);
  const [items, setItems] = useState<ReturnableItem[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [previouslyRefunded, setPreviouslyRefunded] = useState(0);

  useEffect(() => {
    async function load() {
      const [saleResult, itemResult, locationResult, movementResult] = await Promise.all([
        supabase.from("sales").select("*").eq("id", id).single(),
        supabase.from("sale_items").select("*").eq("sale_id", id),
        supabase.from("locations").select("*").order("name"),
        supabase
          .from("stock_movements")
          .select("location_id")
          .eq("sale_id", id)
          .eq("type", "out")
          .limit(1),
      ]);
      const loadError =
        saleResult.error ??
        itemResult.error ??
        locationResult.error ??
        movementResult.error;
      if (loadError) {
        setError(loadError.message);
        setLoading(false);
        return;
      }
      const saleData = saleResult.data as Sale | null;
      setSale(saleData);

      const saleItems = (itemResult.data ?? []) as SaleItem[];
      // Dar item ma thi pehla ketlu return thai gayu che
      const [returnItemResult, previousReturnResult] = await Promise.all([
        supabase
          .from("sale_return_items")
          .select("sale_item_id, quantity")
          .in(
            "sale_item_id",
            saleItems.map((it) => it.id)
          ),
        supabase.from("sale_returns").select("total").eq("sale_id", id),
      ]);
      const returnLoadError = returnItemResult.error ?? previousReturnResult.error;
      if (returnLoadError) {
        setError(returnLoadError.message);
        setLoading(false);
        return;
      }
      setPreviouslyRefunded(
        ((previousReturnResult.data ?? []) as Array<{ total: number }>).reduce(
          (sum, previousReturn) => sum + Number(previousReturn.total),
          0
        )
      );
      const returnedMap = new Map<string, number>();
      for (const r of returnItemResult.data ?? []) {
        returnedMap.set(
          r.sale_item_id,
          (returnedMap.get(r.sale_item_id) ?? 0) + Number(r.quantity)
        );
      }

      setItems(
        saleItems.map((it) => ({
          ...it,
          alreadyReturned: returnedMap.get(it.id) ?? 0,
          returnQty: "",
        }))
      );

      const locList = (locationResult.data ?? []) as Location[];
      setLocations(locList);
      const movementLocation = (
        (movementResult.data ?? []) as Array<{ location_id?: string | null }>
      )[0]?.location_id;
      const saleLocationId = saleData?.location_id ?? movementLocation;
      const def =
        locList.find((location) => location.id === saleLocationId) ??
        locList.find((location) => location.is_default) ??
        locList[0];
      if (def) setLocationId(def.id);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function setQty(itemId: string, value: string) {
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, returnQty: value } : it))
    );
  }

  const selected = items.filter((it) => (parseFloat(it.returnQty) || 0) > 0);
  const refundSubtotal = selected.reduce(
    (s, it) => s + (parseFloat(it.returnQty) || 0) * Number(it.price),
    0
  );
  const refundTax = selected.reduce(
    (s, it) =>
      s +
      ((parseFloat(it.returnQty) || 0) * Number(it.price) * Number(it.gst_rate)) /
        100,
    0
  );
  const grossRefund = refundSubtotal + refundTax;
  const saleGross = sale ? Number(sale.subtotal) + Number(sale.tax_total) : 0;
  const refundDiscount =
    saleGross > 0
      ? Math.round((grossRefund * Number(sale?.discount ?? 0) * 100) / saleGross) / 100
      : 0;
  const refundableBalance = Math.max(
    0,
    Number(sale?.grand_total ?? 0) - previouslyRefunded
  );
  const refundTotal = Math.min(
    Math.round((grossRefund - refundDiscount) * 100) / 100,
    Math.round(refundableBalance * 100) / 100
  );

  async function saveReturn() {
    if (saving) return;
    if (selected.length === 0) {
      setError("Ochha ma ochhi 1 item ni return quantity nakho");
      return;
    }
    for (const it of selected) {
      const qty = parseFloat(it.returnQty);
      const max = Number(it.quantity) - it.alreadyReturned;
      if (!qty || qty <= 0) {
        setError(`"${it.product_name}" ni return quantity valid nathi`);
        return;
      }
      if (qty > max) {
        setError(`"${it.product_name}" ma vadhu ma vadhu ${max} return thai shake`);
        return;
      }
    }
    setSaving(true);
    setError(null);

    const { data, error } = await supabase.rpc("create_sale_return", {
      p_sale_id: id,
      p_items: selected.map((it) => ({
        sale_item_id: it.id,
        quantity: parseFloat(it.returnQty),
      })),
      p_reason: reason.trim() || null,
      p_location_id: locationId || null,
    });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    router.push(`/returns/${(data as { return_id: string }).return_id}`);
  }

  if (loading)
    return <p className="py-8 text-center text-sm text-stone-500">Loading...</p>;
  if (!sale)
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-stone-200 bg-white p-5 text-center">
        <p className="text-sm text-stone-600">
          {error ? `Sale load nathi thayu: ${error}` : "Sale not found"}
        </p>
        <Link href="/sales" className="mt-3 inline-flex text-sm font-semibold text-emerald-700 hover:text-emerald-800">
          Back to sales
        </Link>
      </div>
    );

  const inr = (n: number) =>
    "₹" +
    n.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const input =
    "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600";

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={`Return items · ${sale.invoice_no}`}
        description="Returned quantities are restored to stock and recorded on a credit note."
        actions={
          <>
            {locations.length > 1 && (
              <select
                aria-label="Return stock location"
                className={input}
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
              >
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            )}
            <Link
              href={`/sales/${id}`}
              className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              Cancel
            </Link>
          </>
        }
      />

      <div className="mt-4 overflow-hidden rounded-lg border border-stone-200 bg-white">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50 text-left text-xs text-stone-500">
              <th className="px-4 py-2 font-medium">Item</th>
              <th className="px-2 py-2 text-right font-medium">Sold</th>
              <th className="px-2 py-2 text-right font-medium">Returnable</th>
              <th className="px-2 py-2 text-right font-medium">Return qty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {items.map((it) => {
              const max = Number(it.quantity) - it.alreadyReturned;
              return (
                <tr key={it.id} className={max <= 0 ? "opacity-40" : ""}>
                  <td className="px-4 py-2">
                    <p className="font-medium text-stone-900">
                      {it.product_name}
                    </p>
                    <p className="text-xs text-stone-400">
                      {inr(Number(it.price))} / {it.unit}
                    </p>
                  </td>
                  <td className="px-2 py-2 text-right text-stone-700">
                    {Number(it.quantity)}
                  </td>
                  <td className="px-2 py-2 text-right text-stone-700">{max}</td>
                  <td className="px-2 py-2 text-right">
                    <input
                      aria-label={`Return quantity for ${it.product_name}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={max}
                      step="any"
                      disabled={max <= 0}
                      className={`${input} w-20 text-right`}
                      value={it.returnQty}
                      onChange={(e) => setQty(it.id, e.target.value)}
                      placeholder="0"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      <div className="mt-3">
        <label htmlFor="return-reason" className="mb-1 block text-xs font-medium text-stone-600">
          Return reason (optional)
        </label>
        <input
          id="return-reason"
          className={`${input} w-full`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Damaged, wrong item, or another reason"
        />
      </div>

      {selected.length > 0 && (
        <div className="mt-3 rounded-lg border border-stone-200 bg-white p-4 text-sm">
          <div className="flex justify-between text-stone-600">
            <span>Refund subtotal</span>
            <span>{inr(refundSubtotal)}</span>
          </div>
          <div className="mt-1 flex justify-between text-stone-600">
            <span>GST</span>
            <span>{inr(refundTax)}</span>
          </div>
          {refundDiscount > 0 && (
            <div className="mt-1 flex justify-between text-stone-600">
              <span>Invoice discount</span>
              <span>−{inr(refundDiscount)}</span>
            </div>
          )}
          <div className="mt-2 flex justify-between border-t border-stone-200 pt-2 font-semibold text-stone-900">
            <span>Total refund</span>
            <span>{inr(refundTotal)}</span>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={saveReturn}
        disabled={saving || selected.length === 0}
        className="mt-4 w-full rounded-xl bg-amber-600 py-3.5 text-base font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {saving ? "Saving..." : `Create credit note · ${inr(refundTotal)}`}
      </button>
    </div>
  );
}
