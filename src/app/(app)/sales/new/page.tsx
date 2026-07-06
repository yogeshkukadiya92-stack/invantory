"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type {
  CreateSaleResult,
  Customer,
  Location,
  StockRow,
} from "@/lib/types";

interface Line {
  product_id: string;
  name: string;
  unit: string;
  stock: number;
  gst_rate: number;
  quantity: string;
  price: string;
}

export default function NewSalePage() {
  const router = useRouter();
  const supabase = createClient();

  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<StockRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickCustomer, setQuickCustomer] = useState({ name: "", phone: "" });
  const [discount, setDiscount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paidFull, setPaidFull] = useState(true);
  const [paidAmount, setPaidAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadInitial() {
      const [{ data }, { data: locs }] = await Promise.all([
        supabase.from("customers").select("*").order("name"),
        supabase.from("locations").select("*").order("name"),
      ]);
      setCustomers((data ?? []) as Customer[]);
      const locList = (locs ?? []) as Location[];
      setLocations(locList);
      const saved = localStorage.getItem("sale_location");
      const def =
        locList.find((l) => l.id === saved) ??
        locList.find((l) => l.is_default) ??
        locList[0];
      if (def) setLocationId(def.id);
    }
    loadInitial();
    searchRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Product search — debounced
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

  function addProduct(p: StockRow) {
    setError(null);
    setLines((prev) => {
      const existing = prev.find((l) => l.product_id === p.product_id);
      if (existing) {
        return prev.map((l) =>
          l.product_id === p.product_id
            ? { ...l, quantity: String((parseFloat(l.quantity) || 0) + 1) }
            : l
        );
      }
      return [
        ...prev,
        {
          product_id: p.product_id,
          name: p.name,
          unit: p.unit,
          stock: p.stock,
          gst_rate: Number(p.gst_rate) || 0,
          quantity: "1",
          price: String(p.selling_price),
        },
      ];
    });
    setSearch("");
    setResults([]);
    searchRef.current?.focus();
  }

  // Barcode scanner: exact match par Enter → direct add
  async function handleSearchEnter() {
    const code = search.trim();
    if (!code) return;
    const { data } = await supabase
      .from("current_stock")
      .select("*")
      .eq("is_active", true)
      .eq("barcode", code)
      .limit(1);
    if (data && data.length > 0) {
      addProduct(data[0] as StockRow);
    } else if (results.length > 0) {
      addProduct(results[0]);
    }
  }

  function updateLine(id: string, field: "quantity" | "price", value: string) {
    setLines((prev) =>
      prev.map((l) => (l.product_id === id ? { ...l, [field]: value } : l))
    );
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.product_id !== id));
  }

  async function quickAddCustomer() {
    if (!quickCustomer.name.trim()) return;
    const { data, error } = await supabase
      .from("customers")
      .insert({
        name: quickCustomer.name.trim(),
        phone: quickCustomer.phone.trim() || null,
      })
      .select()
      .single();
    if (error) {
      setError(error.message);
      return;
    }
    const c = data as Customer;
    setCustomers((prev) =>
      [...prev, c].sort((a, b) => a.name.localeCompare(b.name))
    );
    setCustomerId(c.id);
    setQuickCustomer({ name: "", phone: "" });
    setShowQuickAdd(false);
  }

  // Totals
  const subtotal = lines.reduce(
    (s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.price) || 0),
    0
  );
  const taxTotal = lines.reduce(
    (s, l) =>
      s +
      ((parseFloat(l.quantity) || 0) * (parseFloat(l.price) || 0) * l.gst_rate) /
        100,
    0
  );
  const discountNum = parseFloat(discount) || 0;
  const grandTotal = Math.max(0, subtotal + taxTotal - discountNum);

  async function saveSale() {
    if (lines.length === 0) {
      setError("Ochha ma ochhi 1 item add karo");
      return;
    }
    for (const l of lines) {
      const qty = parseFloat(l.quantity);
      if (!qty || qty <= 0) {
        setError(`"${l.name}" ni quantity valid nathi`);
        return;
      }
      if (qty > l.stock) {
        setError(`"${l.name}" no stock ochho che (available: ${l.stock})`);
        return;
      }
    }
    setSaving(true);
    setError(null);

    const { data, error } = await supabase.rpc("create_sale", {
      p_items: lines.map((l) => ({
        product_id: l.product_id,
        quantity: parseFloat(l.quantity),
        price: parseFloat(l.price) || 0,
      })),
      p_customer_id: customerId || null,
      p_discount: discountNum,
      p_payment_method: paymentMethod,
      p_paid_amount: paidFull ? null : parseFloat(paidAmount) || 0,
      p_note: note.trim() || null,
      p_location_id: locationId || null,
    });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    const result = data as CreateSaleResult;
    router.push(`/sales/${result.sale_id}`);
  }

  const input =
    "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600";
  const inr = (n: number) =>
    "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-stone-900">New sale</h1>
        {locations.length > 1 && (
          <select
            className={input}
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value);
              localStorage.setItem("sale_location", e.target.value);
            }}
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                📍 {l.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* PRODUCT SEARCH */}
      <div className="relative mt-4">
        <input
          ref={searchRef}
          className={`${input} w-full py-3`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearchEnter()}
          placeholder="🔍 Product search karo athva barcode scan karo..."
          autoComplete="off"
        />
        {results.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg">
            {results.map((p) => (
              <li key={p.product_id}>
                <button
                  onClick={() => addProduct(p)}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-stone-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-stone-900">
                      {p.name}
                    </p>
                    <p className="text-xs text-stone-500">
                      ₹{Number(p.selling_price).toLocaleString("en-IN")} · Stock:{" "}
                      {p.stock} {p.unit}
                    </p>
                  </div>
                  <span className="ml-2 text-emerald-700">+</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* LINES */}
      <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-white">
        {lines.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-stone-500">
            Upar search karine items add karo
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50 text-left text-xs text-stone-500">
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-2 py-2 text-right font-medium">Qty</th>
                  <th className="px-2 py-2 text-right font-medium">Price</th>
                  <th className="px-2 py-2 text-right font-medium">GST</th>
                  <th className="px-2 py-2 text-right font-medium">Total</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {lines.map((l) => {
                  const qty = parseFloat(l.quantity) || 0;
                  const price = parseFloat(l.price) || 0;
                  return (
                    <tr key={l.product_id}>
                      <td className="px-4 py-2">
                        <p className="font-medium text-stone-900">{l.name}</p>
                        <p className="text-xs text-stone-400">
                          Stock: {l.stock} {l.unit}
                        </p>
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input
                          type="number"
                          inputMode="decimal"
                          className={`${input} w-20 text-right ${
                            qty > l.stock ? "border-red-400" : ""
                          }`}
                          value={l.quantity}
                          onChange={(e) =>
                            updateLine(l.product_id, "quantity", e.target.value)
                          }
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <input
                          type="number"
                          inputMode="decimal"
                          className={`${input} w-24 text-right`}
                          value={l.price}
                          onChange={(e) =>
                            updateLine(l.product_id, "price", e.target.value)
                          }
                        />
                      </td>
                      <td className="px-2 py-2 text-right text-xs text-stone-500">
                        {l.gst_rate}%
                      </td>
                      <td className="px-2 py-2 text-right font-medium text-stone-900">
                        {inr(qty * price)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <button
                          onClick={() => removeLine(l.product_id)}
                          className="px-1 text-stone-400 hover:text-red-600"
                          title="Remove"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CUSTOMER + PAYMENT */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <label className="text-xs font-medium text-stone-500">Customer</label>
          <div className="mt-1 flex gap-2">
            <select
              className={`${input} flex-1`}
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">Walk-in customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.phone ? ` (${c.phone})` : ""}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowQuickAdd((v) => !v)}
              className="shrink-0 rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
            >
              + New
            </button>
          </div>
          {showQuickAdd && (
            <div className="mt-2 flex flex-col gap-2">
              <input
                className={input}
                placeholder="Customer name"
                value={quickCustomer.name}
                onChange={(e) =>
                  setQuickCustomer((c) => ({ ...c, name: e.target.value }))
                }
              />
              <div className="flex gap-2">
                <input
                  className={`${input} flex-1`}
                  placeholder="Phone (optional)"
                  value={quickCustomer.phone}
                  onChange={(e) =>
                    setQuickCustomer((c) => ({ ...c, phone: e.target.value }))
                  }
                />
                <button
                  onClick={quickAddCustomer}
                  className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          <label className="mt-3 block text-xs font-medium text-stone-500">
            Note (optional)
          </label>
          <input
            className={`${input} mt-1 w-full`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. delivery Monday"
          />
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <div className="flex justify-between text-sm text-stone-600">
            <span>Subtotal</span>
            <span>{inr(subtotal)}</span>
          </div>
          <div className="mt-1 flex justify-between text-sm text-stone-600">
            <span>GST</span>
            <span>{inr(taxTotal)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-sm text-stone-600">
            <span>Discount</span>
            <input
              type="number"
              inputMode="decimal"
              className={`${input} w-24 text-right`}
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="mt-2 flex justify-between border-t border-stone-200 pt-2 text-base font-semibold text-stone-900">
            <span>Total</span>
            <span>{inr(grandTotal)}</span>
          </div>

          <div className="mt-3 flex gap-2">
            {["cash", "upi", "card", "credit"].map((m) => (
              <button
                key={m}
                onClick={() => {
                  setPaymentMethod(m);
                  if (m === "credit") {
                    setPaidFull(false);
                    setPaidAmount("0");
                  } else {
                    setPaidFull(true);
                  }
                }}
                className={`flex-1 rounded-lg py-2 text-xs font-medium capitalize transition-colors ${
                  paymentMethod === m
                    ? "bg-emerald-700 text-white"
                    : "border border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          <label className="mt-3 flex items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              checked={paidFull}
              onChange={(e) => setPaidFull(e.target.checked)}
              className="h-4 w-4 accent-emerald-700"
            />
            Full payment received
          </label>
          {!paidFull && (
            <div className="mt-2 flex items-center justify-between text-sm text-stone-600">
              <span>Paid amount</span>
              <input
                type="number"
                inputMode="decimal"
                className={`${input} w-28 text-right`}
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                placeholder="0"
              />
            </div>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        onClick={saveSale}
        disabled={saving || lines.length === 0}
        className="mt-4 w-full rounded-xl bg-emerald-700 py-3.5 text-base font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        {saving ? "Saving..." : `💾 Save sale — ${inr(grandTotal)}`}
      </button>
    </div>
  );
}
