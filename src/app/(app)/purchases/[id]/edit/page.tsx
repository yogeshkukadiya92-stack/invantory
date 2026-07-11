"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/mongodb/client";
import type { PurchaseOrder, PurchaseOrderItem, StockRow, Supplier } from "@/lib/types";

interface Line {
  product_id: string;
  name: string;
  unit: string;
  stock: number;
  quantity: string;
  cost: string;
}

export default function EditPurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const supabase = createClient();
  const searchRef = useRef<HTMLInputElement>(null);

  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<StockRow[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [{ data: p }, { data: items }, { data: sups }] = await Promise.all([
        supabase.from("purchase_orders").select("*").eq("id", id).single(),
        supabase.from("purchase_order_items").select("*").eq("po_id", id),
        supabase.from("suppliers").select("*").order("name"),
      ]);
      const poData = p as PurchaseOrder | null;
      setPo(poData);
      setSupplierId(poData?.supplier_id ?? "");
      setNote(poData?.note ?? "");
      setSuppliers((sups ?? []) as Supplier[]);
      setLines(
        ((items ?? []) as PurchaseOrderItem[]).map((item) => ({
          product_id: item.product_id ?? "",
          name: item.product_name,
          unit: item.unit,
          stock: 0,
          quantity: String(item.quantity),
          cost: String(item.cost),
        }))
      );
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const q = search.trim().replace(/[,()]/g, "");
    if (!q) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("current_stock")
        .select("*")
        .eq("is_active", true)
        .or(`name.ilike.%${q}%,sku.ilike.%${q}%,barcode.ilike.%${q}%`)
        .order("name")
        .limit(8);
      setResults((data ?? []) as StockRow[]);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function addProduct(product: StockRow) {
    setError(null);
    setLines((prev) => {
      const existing = prev.find((line) => line.product_id === product.product_id);
      if (existing) {
        return prev.map((line) =>
          line.product_id === product.product_id
            ? { ...line, quantity: String((parseFloat(line.quantity) || 0) + 1) }
            : line
        );
      }
      return [
        ...prev,
        {
          product_id: product.product_id,
          name: product.name,
          unit: product.unit,
          stock: product.stock,
          quantity: "1",
          cost: String(product.purchase_price),
        },
      ];
    });
    setSearch("");
    setResults([]);
    searchRef.current?.focus();
  }

  function updateLine(id: string, field: "quantity" | "cost", value: string) {
    setLines((prev) => prev.map((line) => (line.product_id === id ? { ...line, [field]: value } : line)));
  }

  const total = lines.reduce((sum, line) => sum + (parseFloat(line.quantity) || 0) * (parseFloat(line.cost) || 0), 0);
  const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  async function save() {
    if (saving || po?.status === "cancelled") return;
    if (lines.length === 0) {
      setError("Ochha ma ochhi 1 item add karo");
      return;
    }
    for (const line of lines) {
      if (!line.product_id) {
        setError(`"${line.name}" product valid nathi`);
        return;
      }
      if (!(parseFloat(line.quantity) > 0)) {
        setError(`"${line.name}" ni quantity valid nathi`);
        return;
      }
      const cost = parseFloat(line.cost);
      if (Number.isNaN(cost) || cost < 0) {
        setError(`"${line.name}" no cost valid nathi`);
        return;
      }
    }
    setSaving(true);
    setError(null);
    const { error } = await supabase.rpc("update_purchase_order", {
      p_po_id: id,
      p_items: lines.map((line) => ({
        product_id: line.product_id,
        quantity: parseFloat(line.quantity),
        cost: parseFloat(line.cost) || 0,
      })),
      p_supplier_id: supplierId || null,
      p_note: note.trim() || null,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(`/purchases/${id}`);
    router.refresh();
  }

  if (loading) return <p className="py-8 text-center text-sm text-stone-500">Loading...</p>;
  if (!po) return <p className="py-8 text-center text-sm text-stone-500">PO not found</p>;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-stone-900">Edit purchase</h1>
        <Link href={`/purchases/${id}`} className="text-sm text-stone-500 hover:text-stone-700">
          Cancel
        </Link>
      </div>

      {po.status === "received" && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Aa PO received che. Save karta stock entries pan update thashe.
        </p>
      )}
      {po.status === "cancelled" && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          Cancelled PO edit nathi thai shaktu.
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label>
          <span className="sr-only">Supplier</span>
          <select className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">— Supplier select karo —</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Purchase note</span>
          <input className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note" />
        </label>
      </div>

      <div className="relative mt-4">
        <label className="block">
          <span className="sr-only">Search products</span>
          <input
          ref={searchRef}
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Product add karva search karo..."
          disabled={po.status === "cancelled"}
          />
        </label>
        {results.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-stone-200 bg-white shadow-lg">
            {results.map((product) => (
              <li key={product.product_id}>
                <button type="button" onClick={() => addProduct(product)} className="flex w-full justify-between px-4 py-2.5 text-left text-sm hover:bg-stone-50">
                  <span>{product.name}</span>
                  <span className="text-stone-500">Cost ₹{Number(product.purchase_price).toLocaleString("en-IN")}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50 text-left text-xs text-stone-500">
              <th className="px-4 py-2 font-medium">Item</th>
              <th className="px-2 py-2 text-right font-medium">Qty</th>
              <th className="px-2 py-2 text-right font-medium">Cost</th>
              <th className="px-2 py-2 text-right font-medium">Total</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {lines.map((line) => {
              const qty = parseFloat(line.quantity) || 0;
              const cost = parseFloat(line.cost) || 0;
              return (
                <tr key={line.product_id || line.name}>
                  <td className="px-4 py-2 font-medium text-stone-900">{line.name}</td>
                  <td className="px-2 py-2 text-right">
                    <input type="number" inputMode="decimal" min="0.001" step="any" aria-label={`Quantity for ${line.name}`} className="w-20 rounded-lg border border-stone-300 px-2 py-1.5 text-right" value={line.quantity} disabled={po.status === "cancelled"} onChange={(e) => updateLine(line.product_id, "quantity", e.target.value)} />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <input type="number" inputMode="decimal" min="0" step="any" aria-label={`Cost for ${line.name}`} className="w-24 rounded-lg border border-stone-300 px-2 py-1.5 text-right" value={line.cost} disabled={po.status === "cancelled"} onChange={(e) => updateLine(line.product_id, "cost", e.target.value)} />
                  </td>
                  <td className="px-2 py-2 text-right font-medium">{inr(qty * cost)}</td>
                  <td className="px-2 py-2 text-right">
                    <button type="button" aria-label={`Remove ${line.name}`} disabled={po.status === "cancelled"} onClick={() => setLines((prev) => prev.filter((item) => item.product_id !== line.product_id))} className="text-stone-400 hover:text-red-600 disabled:opacity-40">
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex justify-between rounded-lg border border-stone-200 bg-white px-4 py-3 text-base font-bold text-stone-900">
        <span>Total</span>
        <span>{inr(total)}</span>
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button type="button" onClick={save} disabled={saving || po.status === "cancelled"} className="mt-4 w-full rounded-lg bg-emerald-700 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {saving ? "Saving..." : "Save purchase changes"}
      </button>
    </div>
  );
}
