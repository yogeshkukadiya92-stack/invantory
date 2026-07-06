"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
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

  useEffect(() => {
    async function load() {
      const [{ data: s }, { data: li }, { data: locs }] = await Promise.all([
        supabase.from("sales").select("*").eq("id", id).single(),
        supabase.from("sale_items").select("*").eq("sale_id", id),
        supabase.from("locations").select("*").order("name"),
      ]);
      setSale(s as Sale | null);

      const saleItems = (li ?? []) as SaleItem[];
      // Dar item ma thi pehla ketlu return thai gayu che
      const { data: prevReturns } = await supabase
        .from("sale_return_items")
        .select("sale_item_id, quantity")
        .in(
          "sale_item_id",
          saleItems.map((it) => it.id)
        );
      const returnedMap = new Map<string, number>();
      for (const r of prevReturns ?? []) {
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

      const locList = (locs ?? []) as Location[];
      setLocations(locList);
      const def = locList.find((l) => l.is_default) ?? locList[0];
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
  const refundTotal = refundSubtotal + refundTax;

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
      <p className="py-8 text-center text-sm text-stone-500">Sale not found</p>
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
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={`/sales/${id}`}
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          ← {sale.invoice_no}
        </Link>
        {locations.length > 1 && (
          <select
            className={input}
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            title="Stock kya pacho aavshe"
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                📍 {l.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <h1 className="mt-3 text-xl font-semibold text-stone-900">
        Return items — {sale.invoice_no}
      </h1>
      <p className="mt-1 text-sm text-stone-500">
        Return karva ni quantity nakho. Stock pacho &apos;in&apos; thashe ane
        credit note banshe.
      </p>

      <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-white">
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
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={max}
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

      <input
        className={`${input} mt-3 w-full`}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (e.g. damaged, wrong item)"
      />

      {selected.length > 0 && (
        <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4 text-sm">
          <div className="flex justify-between text-stone-600">
            <span>Refund subtotal</span>
            <span>{inr(refundSubtotal)}</span>
          </div>
          <div className="mt-1 flex justify-between text-stone-600">
            <span>GST</span>
            <span>{inr(refundTax)}</span>
          </div>
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
        onClick={saveReturn}
        disabled={saving || selected.length === 0}
        className="mt-4 w-full rounded-xl bg-amber-600 py-3.5 text-base font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {saving ? "Saving..." : `↩ Create credit note — ${inr(refundTotal)}`}
      </button>
    </div>
  );
}
