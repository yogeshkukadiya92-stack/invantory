"use client";

import { useEffect, useMemo, useState } from "react";
import JsBarcode from "jsbarcode";
import { PageHeader } from "@/components/DashboardUI";
import { createClient } from "@/lib/mongodb/client";
import type { StockRow } from "@/lib/types";

interface LabelSelection {
  [productId: string]: number; // copies count
}

export default function LabelsPage() {
  const supabase = createClient();
  const [products, setProducts] = useState<StockRow[]>([]);
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<LabelSelection>({});
  const [showPrice, setShowPrice] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("current_stock")
        .select("*")
        .eq("is_active", true)
        .not("barcode", "is", null)
        .order("name");
      setProducts((data ?? []) as StockRow[]);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || (p.barcode ?? "").includes(q)
    );
  }, [products, search]);

  // Print sheet mate flat label list (copies expand karine)
  const labels = useMemo(() => {
    const list: { product: StockRow; key: string }[] = [];
    for (const p of products) {
      const copies = selection[p.product_id] ?? 0;
      for (let i = 0; i < copies; i++) {
        list.push({ product: p, key: `${p.product_id}-${i}` });
      }
    }
    return list;
  }, [products, selection]);

  // Labels render thaya pachi barcodes draw karo
  useEffect(() => {
    for (const { product, key } of labels) {
      const el = document.getElementById(`bc-${key}`);
      if (el && product.barcode) {
        try {
          JsBarcode(el, product.barcode, {
            format: "CODE128",
            height: 34,
            width: 1.4,
            displayValue: true,
            fontSize: 10,
            margin: 0,
          });
        } catch {
          // invalid code skip
        }
      }
    }
  }, [labels, showPrice]);

  function setCopies(productId: string, copies: number) {
    setSelection((s) => {
      const next = { ...s };
      if (copies <= 0) delete next[productId];
      else next[productId] = Math.min(copies, 99);
      return next;
    });
  }

  const totalLabels = labels.length;

  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #label-sheet, #label-sheet * { visibility: visible; }
          #label-sheet {
            position: absolute; left: 0; top: 0; width: 100%;
            display: grid !important;
            grid-template-columns: repeat(3, 1fr);
            gap: 4mm; padding: 6mm;
          }
          #label-sheet .label {
            border: 1px dashed #bbb;
            break-inside: avoid;
          }
        }
      `}</style>

      <div className="print:hidden">
        <PageHeader
          title="Print labels"
          description="Select products and the number of barcode labels to print."
          actions={
            <button
              type="button"
              onClick={() => window.print()}
              disabled={totalLabels === 0}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              Print {totalLabels > 0 ? `(${totalLabels})` : ""}
            </button>
          }
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 print:hidden">
        {/* PRODUCT SELECTION */}
        <section className="rounded-lg border border-stone-200 bg-white">
          <div className="border-b border-stone-100 p-3">
            <label htmlFor="label-product-search" className="sr-only">
              Search products
            </label>
            <input
              id="label-product-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
            <label className="mt-2 flex items-center gap-2 text-sm text-stone-600">
              <input
                type="checkbox"
                checked={showPrice}
                onChange={(e) => setShowPrice(e.target.checked)}
                className="h-4 w-4 accent-emerald-700"
              />
              Label par price batavo
            </label>
          </div>
          <ul className="max-h-[420px] divide-y divide-stone-100 overflow-y-auto">
            {filtered.map((p) => {
              const copies = selection[p.product_id] ?? 0;
              return (
                <li
                  key={p.product_id}
                  className="flex items-center justify-between px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-stone-900">
                      {p.name}
                    </p>
                    <p className="truncate font-mono text-xs text-stone-500">
                      {p.barcode}
                    </p>
                  </div>
                  <div className="ml-3 flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Decrease label copies for ${p.name}`}
                      onClick={() => setCopies(p.product_id, copies - 1)}
                      className="h-8 w-8 rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-50"
                    >
                      −
                    </button>
                    <input
                      aria-label={`Label copies for ${p.name}`}
                      type="number"
                      inputMode="numeric"
                      min="0"
                      max="99"
                      value={copies || ""}
                      onChange={(e) =>
                        setCopies(p.product_id, parseInt(e.target.value) || 0)
                      }
                      placeholder="0"
                      className="h-8 w-12 rounded-lg border border-stone-300 text-center text-sm"
                    />
                    <button
                      type="button"
                      aria-label={`Increase label copies for ${p.name}`}
                      onClick={() => setCopies(p.product_id, copies + 1)}
                      className="h-8 w-8 rounded-lg border border-stone-300 text-stone-700 hover:bg-stone-50"
                    >
                      +
                    </button>
                  </div>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-stone-500">
                Barcode vala products nathi. Pehla product ma barcode add karo.
              </li>
            )}
          </ul>
        </section>

        {/* PREVIEW NOTE */}
        <section className="rounded-lg border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-stone-900">Preview</h2>
          <p className="mt-1 text-xs text-stone-500">
            Niche je labels dekhay che e j print thashe — A4 sheet par 3
            columns ma. Thermal label printer hoy to browser ni print
            settings ma paper size select karjo.
          </p>
          <p className="mt-2 text-xs text-stone-400">
            Tip: Print dialog ma &quot;Margins: None&quot; ane
            &quot;Scale: 100%&quot; rakhvu best rahese.
          </p>
        </section>
      </div>

      {/* LABEL SHEET (screen preview + print area) */}
      <div
        id="label-sheet"
        className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
      >
        {labels.map(({ product, key }) => (
          <div
            key={key}
            className="label flex flex-col items-center rounded-lg border border-stone-200 bg-white px-2 py-2 text-center"
          >
            <p className="w-full truncate text-[11px] font-semibold text-stone-900">
              {product.name}
            </p>
            {showPrice && (
              <p className="text-[11px] font-medium text-stone-700">
                ₹{Number(product.selling_price).toLocaleString("en-IN")}
              </p>
            )}
            <svg id={`bc-${key}`} className="mt-1 max-w-full" />
          </div>
        ))}
        {totalLabels === 0 && (
          <p className="col-span-full rounded-lg border border-dashed border-stone-300 py-10 text-center text-sm text-stone-400 print:hidden">
            Products select karo — labels ahi preview thashe
          </p>
        )}
      </div>
    </div>
  );
}
