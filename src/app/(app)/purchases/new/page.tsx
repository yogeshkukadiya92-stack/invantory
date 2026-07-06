"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { StockRow, Supplier } from "@/lib/types";

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
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadSuppliers() {
      const { data } = await supabase.from("suppliers").select("*").order("name");
      setSuppliers((data ?? []) as Supplier[]);
    }
    loadSuppliers();
    searchRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    });

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    router.push(`/purchases/${(data as { po_id: string }).po_id}`);
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
      <h1 className="text-xl font-semibold text-stone-900">
        New purchase order
      </h1>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <select
          className={input}
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
        <input
          className={input}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
        />
      </div>

      <div className="relative mt-3">
        <input
          ref={searchRef}
          className={`${input} w-full py-3`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Product search karo..."
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
                        className={`${input} w-20 text-right`}
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
                        value={l.cost}
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
                        onClick={() => removeLine(l.product_id)}
                        className="px-1 text-stone-400 hover:text-red-600"
                        title="Remove"
                      >
                        ✕
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
        onClick={savePO}
        disabled={saving || lines.length === 0}
        className="mt-4 w-full rounded-xl bg-emerald-700 py-3.5 text-base font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        {saving ? "Saving..." : `📦 Create PO — ${inr(total)}`}
      </button>
    </div>
  );
}
