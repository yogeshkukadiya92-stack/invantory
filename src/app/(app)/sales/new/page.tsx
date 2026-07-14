"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal, PageHeader, useToast } from "@/components/DashboardUI";
import { createClient } from "@/lib/mongodb/client";
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
  const { showToast } = useToast();

  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<StockRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickCustomer, setQuickCustomer] = useState({ name: "", phone: "" });
  const [quickAdding, setQuickAdding] = useState(false);
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
      const [customerResult, locationResult] = await Promise.all([
        supabase.from("customers").select("*").order("name"),
        supabase.from("locations").select("*").order("name"),
      ]);
      const initialError = customerResult.error ?? locationResult.error;
      if (initialError) {
        setError(initialError.message);
        return;
      }
      setCustomers((customerResult.data ?? []) as Customer[]);
      const locList = (locationResult.data ?? []) as Location[];
      setLocations(locList);
      const saved = localStorage.getItem("sale_location");
      const def =
        locList.find((l) => l.id === saved) ??
        locList.find((l) => l.is_default) ??
        locList[0];
      if (def) setLocationId(def.id);
      if (!def) {
        setError("Sale mate stock location nathi. Settings ma location add karo.");
        return;
      }

      const productId = new URLSearchParams(window.location.search).get("product_id");
      if (productId) {
        const { data: productData, error: productError } = await supabase
          .from("location_stock")
          .select("*")
          .eq("product_id", productId)
          .eq("location_id", def.id)
          .eq("is_active", true)
          .gt("stock", 0)
          .limit(1);
        if (productError) {
          setError(productError.message);
          return;
        }
        const product = ((productData ?? []) as StockRow[])[0];
        if (product) {
          addProduct(product);
        } else {
          setError("Selected product no aa location par sale mate stock nathi.");
        }
      }
    }
    loadInitial();
    searchRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Product search — debounced
  useEffect(() => {
    const q = search.trim().replace(/[,()]/g, "");
    if (!q || !locationId) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data, error: searchError } = await supabase
        .from("location_stock")
        .select("*")
        .eq("location_id", locationId)
        .eq("is_active", true)
        .gt("stock", 0)
        .or(`name.ilike.%${q}%,sku.ilike.%${q}%,barcode.ilike.%${q}%`)
        .order("name")
        .limit(8);
      if (cancelled) return;
      if (searchError) {
        setError(searchError.message);
        setResults([]);
        return;
      }
      setResults((data ?? []) as StockRow[]);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [locationId, search, supabase]);

  useEffect(() => {
    if (!locationId || lines.length === 0) return;
    const productIds = lines.map((line) => line.product_id);
    let cancelled = false;
    async function refreshLineStock() {
      const { data, error: stockError } = await supabase
        .from("location_stock")
        .select("*")
        .eq("location_id", locationId)
        .in("product_id", productIds);
      if (cancelled) return;
      if (stockError) {
        setError(stockError.message);
        return;
      }
      const stockByProduct = new Map(
        ((data ?? []) as StockRow[]).map((product) => [
          product.product_id,
          Number(product.stock),
        ])
      );
      setLines((current) =>
        current.map((line) => ({
          ...line,
          stock: stockByProduct.get(line.product_id) ?? 0,
        }))
      );
    }
    refreshLineStock();
    return () => {
      cancelled = true;
    };
    // Only a location change can make existing line availability stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, supabase]);

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
    if (!locationId) {
      setError("Sale location select karo");
      return;
    }
    const { data, error: lookupError } = await supabase
      .from("location_stock")
      .select("*")
      .eq("location_id", locationId)
      .eq("is_active", true)
      .gt("stock", 0)
      .eq("barcode", code)
      .limit(1);
    if (lookupError) {
      setError(lookupError.message);
      return;
    }
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
    setQuickAdding(true);
    setError(null);
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
      setQuickAdding(false);
      return;
    }
    const c = data as Customer;
    setCustomers((prev) =>
      [...prev, c].sort((a, b) => a.name.localeCompare(b.name))
    );
    setCustomerId(c.id);
    setQuickCustomer({ name: "", phone: "" });
    setShowQuickAdd(false);
    setQuickAdding(false);
    showToast("Customer added and selected");
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
    if (saving) return;
    if (lines.length === 0) {
      setError("Ochha ma ochhi 1 item add karo");
      return;
    }
    if (!locationId) {
      setError("Sale location select karo");
      return;
    }
    if (discountNum < 0) {
      setError("Discount negative na hoi shake");
      return;
    }
    const paid = paidFull ? grandTotal : parseFloat(paidAmount) || 0;
    if (!paidFull && (paid < 0 || paid > grandTotal)) {
      setError("Paid amount 0 thi total sudhi hovu joie");
      return;
    }
    for (const l of lines) {
      const qty = parseFloat(l.quantity);
      const price = parseFloat(l.price);
      if (!qty || qty <= 0) {
        setError(`"${l.name}" ni quantity valid nathi`);
        return;
      }
      if (Number.isNaN(price) || price < 0) {
        setError(`"${l.name}" ni price valid nathi`);
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
      p_paid_amount: paidFull ? null : paid,
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
      <PageHeader
        title="New sale"
        description="Create an invoice and deduct stock from the selected location."
        actions={
          <>
            {locations.length > 1 && (
              <select
                aria-label="Sale location"
                className={input}
                value={locationId}
                onChange={(e) => {
                  setLocationId(e.target.value);
                  localStorage.setItem("sale_location", e.target.value);
                }}
              >
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
            <Link
              href="/sales"
              className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              Cancel
            </Link>
          </>
        }
      />

      {/* PRODUCT SEARCH */}
      <div className="relative mt-4">
        <label htmlFor="sale-product-search" className="mb-1 block text-xs font-medium text-stone-600">
          Product or barcode
        </label>
        <input
          id="sale-product-search"
          ref={searchRef}
          className={`${input} w-full py-3`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearchEnter()}
          placeholder="Search product or scan barcode"
          autoComplete="off"
        />
        {results.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg">
            {results.map((p) => (
              <li key={p.product_id}>
                <button
                  type="button"
                  onClick={() => addProduct(p)}
                  aria-label={`Add ${p.name} to sale`}
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
      <div className="mt-4 overflow-hidden rounded-lg border border-stone-200 bg-white">
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
                          aria-label={`Quantity for ${l.name}`}
                          type="number"
                          inputMode="decimal"
                          min="0.001"
                          step="any"
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
                          aria-label={`Price for ${l.name}`}
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
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
                          type="button"
                          onClick={() => removeLine(l.product_id)}
                          className="px-1 text-stone-400 hover:text-red-600"
                          title="Remove"
                          aria-label={`Remove ${l.name}`}
                        >
                          Remove
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
      <div className="mt-4 grid overflow-hidden rounded-lg border border-stone-200 bg-white sm:grid-cols-2 sm:divide-x sm:divide-stone-200">
        <section className="min-w-0 p-4" aria-labelledby="sale-customer-heading">
          <h2 id="sale-customer-heading" className="text-sm font-semibold text-stone-900">
            Customer
          </h2>
          <label htmlFor="sale-customer" className="mt-3 block text-xs font-medium text-stone-500">
            Customer account
          </label>
          <div className="mt-1 flex min-w-0 gap-2">
            <select
              id="sale-customer"
              className={`${input} min-w-0 flex-1`}
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
              type="button"
              onClick={() => {
                setError(null);
                setShowQuickAdd(true);
              }}
              className="shrink-0 rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
            >
              New
            </button>
          </div>

          <label htmlFor="sale-note" className="mt-3 block text-xs font-medium text-stone-500">
            Note (optional)
          </label>
          <input
            id="sale-note"
            className={`${input} mt-1 w-full`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. delivery Monday"
          />
        </section>

        <section className="min-w-0 border-t border-stone-200 p-4 sm:border-t-0" aria-labelledby="sale-payment-heading">
          <h2 id="sale-payment-heading" className="mb-3 text-sm font-semibold text-stone-900">
            Payment
          </h2>
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
              aria-label="Discount amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
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
                type="button"
                key={m}
                aria-pressed={paymentMethod === m}
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
                aria-label="Full payment received"
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
                aria-label="Paid amount"
                type="number"
                inputMode="decimal"
                min="0"
                max={grandTotal}
                step="0.01"
                className={`${input} w-28 text-right`}
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value)}
                placeholder="0"
              />
            </div>
          )}
        </section>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={saveSale}
        disabled={saving || lines.length === 0}
        className="mt-4 w-full rounded-xl bg-emerald-700 py-3.5 text-base font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        {saving ? "Saving..." : `Save sale · ${inr(grandTotal)}`}
      </button>

      <Modal
        open={showQuickAdd}
        onClose={() => {
          if (!quickAdding) setShowQuickAdd(false);
        }}
        title="Add customer"
        description="Create a customer and attach it to this sale."
        size="sm"
        footer={
          <>
            <button
              type="button"
              disabled={quickAdding}
              onClick={() => setShowQuickAdd(false)}
              className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={quickAdding || !quickCustomer.name.trim()}
              onClick={quickAddCustomer}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {quickAdding ? "Adding..." : "Add customer"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="quick-customer-name" className="text-sm font-medium text-stone-700">
              Customer name
            </label>
            <input
              id="quick-customer-name"
              autoFocus
              required
              className={`${input} mt-1 w-full`}
              value={quickCustomer.name}
              onChange={(e) =>
                setQuickCustomer((customer) => ({ ...customer, name: e.target.value }))
              }
            />
          </div>
          <div>
            <label htmlFor="quick-customer-phone" className="text-sm font-medium text-stone-700">
              Phone (optional)
            </label>
            <input
              id="quick-customer-phone"
              inputMode="tel"
              className={`${input} mt-1 w-full`}
              value={quickCustomer.phone}
              onChange={(e) =>
                setQuickCustomer((customer) => ({ ...customer, phone: e.target.value }))
              }
            />
          </div>
          {error && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
