"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/mongodb/client";
import type { Customer, Sale, SaleItem, SaleReturn, StockRow } from "@/lib/types";

interface Line {
  product_id: string;
  name: string;
  unit: string;
  stock: number;
  gst_rate: number;
  quantity: string;
  price: string;
}

export default function EditSalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const supabase = createClient();
  const searchRef = useRef<HTMLInputElement>(null);

  const [sale, setSale] = useState<Sale | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<StockRow[]>([]);
  const [discount, setDiscount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paidAmount, setPaidAmount] = useState("");
  const [note, setNote] = useState("");
  const [hasReturns, setHasReturns] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [{ data: s }, { data: items }, { data: custs }, { data: returns }] =
        await Promise.all([
          supabase.from("sales").select("*").eq("id", id).single(),
          supabase.from("sale_items").select("*").eq("sale_id", id),
          supabase.from("customers").select("*").order("name"),
          supabase.from("sale_returns").select("id").eq("sale_id", id).limit(1),
        ]);
      const saleData = s as Sale | null;
      setSale(saleData);
      setCustomers((custs ?? []) as Customer[]);
      setCustomerId(saleData?.customer_id ?? "");
      setDiscount(saleData ? String(saleData.discount ?? 0) : "");
      setPaymentMethod(saleData?.payment_method ?? "cash");
      setPaidAmount(saleData ? String(saleData.paid_amount ?? 0) : "");
      setNote(saleData?.note ?? "");
      setHasReturns(((returns ?? []) as SaleReturn[]).length > 0);
      setLines(
        ((items ?? []) as SaleItem[]).map((item) => ({
          product_id: item.product_id ?? "",
          name: item.product_name,
          unit: item.unit,
          stock: Number(item.quantity),
          gst_rate: Number(item.gst_rate) || 0,
          quantity: String(item.quantity),
          price: String(item.price),
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
          gst_rate: Number(product.gst_rate) || 0,
          quantity: "1",
          price: String(product.selling_price),
        },
      ];
    });
    setSearch("");
    setResults([]);
    searchRef.current?.focus();
  }

  function updateLine(id: string, field: "quantity" | "price", value: string) {
    setLines((prev) => prev.map((line) => (line.product_id === id ? { ...line, [field]: value } : line)));
  }

  const subtotal = lines.reduce((sum, line) => sum + (parseFloat(line.quantity) || 0) * (parseFloat(line.price) || 0), 0);
  const taxTotal = lines.reduce(
    (sum, line) => sum + (((parseFloat(line.quantity) || 0) * (parseFloat(line.price) || 0) * line.gst_rate) / 100),
    0
  );
  const discountNum = parseFloat(discount) || 0;
  const grandTotal = Math.max(0, subtotal + taxTotal - discountNum);
  const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  async function save() {
    if (saving || hasReturns) return;
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
      const price = parseFloat(line.price);
      if (Number.isNaN(price) || price < 0) {
        setError(`"${line.name}" ni price valid nathi`);
        return;
      }
    }
    const paid = parseFloat(paidAmount) || 0;
    if (paid < 0 || paid > grandTotal) {
      setError("Paid amount 0 thi total sudhi hovu joie");
      return;
    }
    setSaving(true);
    setError(null);
    const { error } = await supabase.rpc("update_sale", {
      p_sale_id: id,
      p_items: lines.map((line) => ({
        product_id: line.product_id,
        quantity: parseFloat(line.quantity),
        price: parseFloat(line.price) || 0,
      })),
      p_customer_id: customerId || null,
      p_discount: discountNum,
      p_payment_method: paymentMethod,
      p_paid_amount: paid,
      p_note: note.trim() || null,
    });
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(`/sales/${id}`);
    router.refresh();
  }

  if (loading) return <p className="py-8 text-center text-sm text-stone-500">Loading...</p>;
  if (!sale) return <p className="py-8 text-center text-sm text-stone-500">Sale not found</p>;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-stone-900">Edit sale</h1>
        <Link href={`/sales/${id}`} className="text-sm text-stone-500 hover:text-stone-700">
          Cancel
        </Link>
      </div>

      {hasReturns && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Aa sale par return thayu che, items edit nathi thai shakta.
        </p>
      )}

      <div className="relative mt-4">
        <input
          ref={searchRef}
          className="w-full rounded-lg border border-stone-300 bg-white px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Product add karva search karo..."
          disabled={hasReturns}
        />
        {results.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg">
            {results.map((product) => (
              <li key={product.product_id}>
                <button onClick={() => addProduct(product)} className="flex w-full justify-between px-4 py-2.5 text-left text-sm hover:bg-stone-50">
                  <span>{product.name}</span>
                  <span className="text-stone-500">Stock {product.stock}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-100 bg-stone-50 text-left text-xs text-stone-500">
              <th className="px-4 py-2 font-medium">Item</th>
              <th className="px-2 py-2 text-right font-medium">Qty</th>
              <th className="px-2 py-2 text-right font-medium">Price</th>
              <th className="px-2 py-2 text-right font-medium">Total</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {lines.map((line) => {
              const qty = parseFloat(line.quantity) || 0;
              const price = parseFloat(line.price) || 0;
              return (
                <tr key={line.product_id || line.name}>
                  <td className="px-4 py-2 font-medium text-stone-900">{line.name}</td>
                  <td className="px-2 py-2 text-right">
                    <input className="w-20 rounded-lg border border-stone-300 px-2 py-1.5 text-right" value={line.quantity} disabled={hasReturns} onChange={(e) => updateLine(line.product_id, "quantity", e.target.value)} />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <input className="w-24 rounded-lg border border-stone-300 px-2 py-1.5 text-right" value={line.price} disabled={hasReturns} onChange={(e) => updateLine(line.product_id, "price", e.target.value)} />
                  </td>
                  <td className="px-2 py-2 text-right font-medium">{inr(qty * price)}</td>
                  <td className="px-2 py-2 text-right">
                    <button disabled={hasReturns} onClick={() => setLines((prev) => prev.filter((item) => item.product_id !== line.product_id))} className="text-stone-400 hover:text-red-600 disabled:opacity-40">
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <label className="text-xs font-medium text-stone-500">Customer</label>
          <select className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Walk-in customer</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>{customer.name}</option>
            ))}
          </select>
          <label className="mt-3 block text-xs font-medium text-stone-500">Note</label>
          <input className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <div className="flex justify-between text-sm"><span>Subtotal</span><span>{inr(subtotal)}</span></div>
          <div className="mt-1 flex justify-between text-sm"><span>GST</span><span>{inr(taxTotal)}</span></div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span>Discount</span>
            <input className="w-24 rounded-lg border border-stone-300 px-2 py-1.5 text-right" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </div>
          <div className="mt-2 flex justify-between border-t border-stone-200 pt-2 font-semibold"><span>Total</span><span>{inr(grandTotal)}</span></div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span>Paid</span>
            <input className="w-28 rounded-lg border border-stone-300 px-2 py-1.5 text-right" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
          </div>
          <select className="mt-3 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            {["cash", "upi", "card", "credit"].map((method) => <option key={method} value={method}>{method}</option>)}
          </select>
        </div>
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button onClick={save} disabled={saving || hasReturns} className="mt-4 w-full rounded-xl bg-emerald-700 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
        {saving ? "Saving..." : "Save sale changes"}
      </button>
    </div>
  );
}
