"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/mongodb/client";
import type { Location, StockRow, Supplier } from "@/lib/types";
import { Modal } from "@/components/DashboardUI";

interface Line {
  product_id: string;
  name: string;
  unit: string;
  stock: number;
  quantity: string;
  cost: string;
}

export default function NewPurchasePage() {
  const router = useRouter();
  const supabase = createClient();

  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<StockRow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: "", phone: "" });
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");
  const [receiveNow, setReceiveNow] = useState(true);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadInitial() {
      const [supplierResult, locationResult] = await Promise.all([
        supabase.from("suppliers").select("*").order("name"),
        supabase.from("locations").select("*").order("name"),
      ]);
      const initialError = supplierResult.error ?? locationResult.error;
      if (initialError) {
        setError(initialError.message);
        return;
      }
      setSuppliers((supplierResult.data ?? []) as Supplier[]);
      const locList = (locationResult.data ?? []) as Location[];
      setLocations(locList);
      const def = locList.find((l) => l.is_default) ?? locList[0];
      if (def) setLocationId(def.id);

      const productId = new URLSearchParams(window.location.search).get("product_id");
      if (productId) {
        const { data: productData, error: productError } = await supabase
          .from("current_stock")
          .select("*")
          .eq("product_id", productId)
          .eq("is_active", true)
          .limit(1);
        if (productError) {
          setError(productError.message);
          return;
        }
        const product = ((productData ?? []) as StockRow[])[0];
        if (product) {
          addProduct(product);
        } else {
          setError("Selected product inactive che athva malyo nathi.");
        }
      }
    }
    loadInitial();
    searchRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const q = search.trim().replace(/[,()]/g, "");
    if (!q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data, error: searchError } = await supabase
        .from("current_stock")
        .select("*")
        .eq("is_active", true)
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
          quantity: "1",
          cost: String(p.purchase_price),
        },
      ];
    });
    setSearch("");
    setResults([]);
    searchRef.current?.focus();
  }

  function updateLine(id: string, field: "quantity" | "cost", value: string) {
    setLines((prev) =>
      prev.map((l) => (l.product_id === id ? { ...l, [field]: value } : l))
    );
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.product_id !== id));
  }

  const total = lines.reduce(
    (s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.cost) || 0),
    0
  );

  async function addSupplier() {
    if (savingSupplier) return;
    const name = newSupplier.name.trim();
    if (!name) {
      setError("Supplier name lakho");
      return;
    }
    setSavingSupplier(true);
    setError(null);
    const { data, error } = await supabase
      .from("suppliers")
      .insert({
        name,
        phone: newSupplier.phone.trim() || null,
      })
      .select("*")
      .single();
    setSavingSupplier(false);
    if (error) {
      setError(error.message);
      return;
    }
    const supplier = data as Supplier;
    setSuppliers((prev) =>
      [...prev, supplier].sort((a, b) => a.name.localeCompare(b.name))
    );
    setSupplierId(supplier.id);
    setNewSupplier({ name: "", phone: "" });
    setShowSupplierForm(false);
  }

  async function savePO() {
    if (saving) return;
    if (lines.length === 0) {
      setError("Ochha ma ochhi 1 item add karo");
      return;
    }
    for (const l of lines) {
      if (!(parseFloat(l.quantity) > 0)) {
        setError(`"${l.name}" ni quantity valid nathi`);
        return;
      }
      const cost = parseFloat(l.cost);
      if (Number.isNaN(cost) || cost < 0) {
        setError(`"${l.name}" no cost valid nathi`);
        return;
      }
    }
    setSaving(true);
    setError(null);

    const { data, error } = await supabase.rpc("create_purchase_order", {
      p_items: lines.map((l) => ({
        product_id: l.product_id,
        quantity: parseFloat(l.quantity),
        cost: parseFloat(l.cost) || 0,
      })),
      p_supplier_id: supplierId || null,
      p_note: note.trim() || null,
      p_receive_now: receiveNow,
      p_location_id: receiveNow ? locationId || null : null,
    });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    const poId = (data as { po_id: string }).po_id;
    router.push(`/purchases/${poId}`);
  }

  const input =
    "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600";
  const inr = (n: number) =>
    "₹" +
    n.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold text-stone-950">New purchase</h1>
      <p className="mt-1 text-sm text-stone-500">Create a purchase order and optionally receive stock immediately.</p>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="flex gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Supplier</span>
              <select
              className={`${input} min-w-0 flex-1`}
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">— Supplier select karo —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setShowSupplierForm(true);
              }}
              className="shrink-0 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              Add supplier
            </button>
          </div>
        </div>
        <label>
          <span className="sr-only">Purchase note</span>
          <input
            className={input}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-col gap-2 rounded-lg border border-stone-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
          <input
            type="checkbox"
            checked={receiveNow}
            onChange={(e) => setReceiveNow(e.target.checked)}
            className="h-4 w-4 accent-emerald-700"
          />
          Purchase save karta stock ma entry karo
        </label>
        {receiveNow && locations.length > 1 && (
          <select
            aria-label="Stock receive location"
            className={input}
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
                {l.is_default ? " (default)" : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="relative mt-3">
        <label className="block">
          <span className="sr-only">Search products</span>
          <input
          ref={searchRef}
          className={`${input} w-full py-3`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products by name, SKU, or barcode"
          autoComplete="off"
          />
        </label>
        {results.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-stone-200 bg-white shadow-lg">
            {results.map((p) => (
              <li key={p.product_id}>
                <button
                  type="button"
                  onClick={() => addProduct(p)}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-stone-50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-stone-900">
                      {p.name}
                    </p>
                    <p className="text-xs text-stone-500">
                      Cost: ₹{Number(p.purchase_price).toLocaleString("en-IN")}{" "}
                      · Stock: {p.stock} {p.unit}
                    </p>
                  </div>
                  <span className="ml-2 text-emerald-700">+</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

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
                  <th className="px-2 py-2 text-right font-medium">Cost</th>
                  <th className="px-2 py-2 text-right font-medium">Total</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {lines.map((l) => (
                  <tr key={l.product_id}>
                    <td className="px-4 py-2">
                      <p className="font-medium text-stone-900">{l.name}</p>
                      <p className="text-xs text-stone-400">
                        Current: {l.stock} {l.unit}
                      </p>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0.001"
                        step="any"
                        className={`${input} w-20 text-right`}
                        value={l.quantity}
                        aria-label={`Quantity for ${l.name}`}
                        onChange={(e) =>
                          updateLine(l.product_id, "quantity", e.target.value)
                        }
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        className={`${input} w-24 text-right`}
                        value={l.cost}
                        aria-label={`Cost for ${l.name}`}
                        onChange={(e) =>
                          updateLine(l.product_id, "cost", e.target.value)
                        }
                      />
                    </td>
                    <td className="px-2 py-2 text-right font-medium text-stone-900">
                      {inr(
                        (parseFloat(l.quantity) || 0) *
                          (parseFloat(l.cost) || 0)
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => removeLine(l.product_id)}
                        className="px-1 text-stone-400 hover:text-red-600"
                        aria-label={`Remove ${l.name}`}
                        title="Remove"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={savePO}
        disabled={saving || lines.length === 0}
        className="mt-4 w-full rounded-xl bg-emerald-700 py-3.5 text-base font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        {saving
          ? "Saving..."
          : receiveNow
            ? `Save purchase and receive stock — ${inr(total)}`
            : `Create purchase order — ${inr(total)}`}
      </button>

      <Modal
        open={showSupplierForm}
        onClose={() => (savingSupplier ? undefined : setShowSupplierForm(false))}
        title="Add supplier"
        description="The supplier will be selected on this purchase"
        size="sm"
        footer={
          <>
            <button type="button" onClick={() => setShowSupplierForm(false)} disabled={savingSupplier} className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50">Cancel</button>
            <button type="button" onClick={addSupplier} disabled={savingSupplier} className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">{savingSupplier ? "Saving..." : "Add supplier"}</button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="new-supplier-name" className="mb-1 block text-sm font-medium text-stone-700">Supplier name</label>
            <input id="new-supplier-name" autoFocus className={`${input} w-full`} value={newSupplier.name} onChange={(e) => setNewSupplier((s) => ({ ...s, name: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="new-supplier-phone" className="mb-1 block text-sm font-medium text-stone-700">Phone</label>
            <input id="new-supplier-phone" type="tel" className={`${input} w-full`} value={newSupplier.phone} onChange={(e) => setNewSupplier((s) => ({ ...s, phone: e.target.value }))} />
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
