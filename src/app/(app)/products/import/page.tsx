"use client";

import { useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import type { Category } from "@/lib/types";

interface ImportRow {
  name: string;
  sku: string | null;
  barcode: string | null;
  category: string | null;
  unit: string;
  purchase_price: number;
  selling_price: number;
  min_stock_level: number;
  hsn_code: string | null;
  gst_rate: number;
  opening_stock: number;
  error?: string;
}

const TEMPLATE_COLUMNS = [
  "Name",
  "SKU",
  "Barcode",
  "Category",
  "Unit",
  "Purchase price",
  "Selling price",
  "Min stock",
  "HSN code",
  "GST rate",
  "Opening stock",
];

export default function ImportProductsPage() {
  const supabase = createClient();

  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      TEMPLATE_COLUMNS,
      [
        "Parle-G 100g",
        "PG100",
        "8901719104046",
        "Biscuits",
        "pcs",
        8,
        10,
        20,
        "1905",
        18,
        100,
      ],
    ]);
    ws["!cols"] = TEMPLATE_COLUMNS.map(() => ({ wch: 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "products-import-template.xlsx");
  }

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    setFileName(file.name);

    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      defval: "",
    });

    if (raw.length === 0) {
      setError("File ma koi rows nathi");
      return;
    }

    // Column names case-insensitive match karo
    const norm = (obj: Record<string, unknown>, key: string) => {
      const found = Object.keys(obj).find(
        (k) => k.trim().toLowerCase() === key.toLowerCase()
      );
      return found !== undefined ? String(obj[found]).trim() : "";
    };
    const num = (obj: Record<string, unknown>, key: string) => {
      const v = parseFloat(norm(obj, key));
      return isNaN(v) ? 0 : v;
    };

    // File ni andar duplicate barcode/SKU check
    const seenBarcodes = new Set<string>();
    const seenSkus = new Set<string>();

    const parsed: ImportRow[] = raw.map((r) => {
      const row: ImportRow = {
        name: norm(r, "Name"),
        sku: norm(r, "SKU") || null,
        barcode: norm(r, "Barcode") || null,
        category: norm(r, "Category") || null,
        unit: norm(r, "Unit") || "pcs",
        purchase_price: num(r, "Purchase price"),
        selling_price: num(r, "Selling price"),
        min_stock_level: num(r, "Min stock"),
        hsn_code: norm(r, "HSN code") || null,
        gst_rate: num(r, "GST rate"),
        opening_stock: num(r, "Opening stock"),
      };
      if (!row.name) row.error = "Name khali che";
      else if (row.barcode && seenBarcodes.has(row.barcode))
        row.error = "File ma duplicate barcode";
      else if (row.sku && seenSkus.has(row.sku))
        row.error = "File ma duplicate SKU";
      if (row.barcode) seenBarcodes.add(row.barcode);
      if (row.sku) seenSkus.add(row.sku);
      return row;
    });

    // Database sathe duplicate check (chunks ma)
    const barcodes = parsed.map((r) => r.barcode).filter(Boolean) as string[];
    const skus = parsed.map((r) => r.sku).filter(Boolean) as string[];
    const existingBarcodes = new Set<string>();
    const existingSkus = new Set<string>();

    for (let i = 0; i < barcodes.length; i += 200) {
      const { data } = await supabase
        .from("products")
        .select("barcode")
        .in("barcode", barcodes.slice(i, i + 200));
      (data ?? []).forEach((p) => p.barcode && existingBarcodes.add(p.barcode));
    }
    for (let i = 0; i < skus.length; i += 200) {
      const { data } = await supabase
        .from("products")
        .select("sku")
        .in("sku", skus.slice(i, i + 200));
      (data ?? []).forEach((p) => p.sku && existingSkus.add(p.sku));
    }

    for (const row of parsed) {
      if (row.error) continue;
      if (row.barcode && existingBarcodes.has(row.barcode))
        row.error = "Barcode already database ma che";
      else if (row.sku && existingSkus.has(row.sku))
        row.error = "SKU already database ma che";
    }

    setRows(parsed);
  }

  async function runImport() {
    const valid = rows.filter((r) => !r.error);
    if (valid.length === 0) {
      setError("Import karva layak koi row nathi");
      return;
    }
    setImporting(true);
    setError(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Categories: name → id map; missing categories banavva try karo
    const { data: cats } = await supabase.from("categories").select("*");
    const catMap = new Map(
      ((cats ?? []) as Category[]).map((c) => [c.name.toLowerCase(), c.id])
    );
    const missingCats = [
      ...new Set(
        valid
          .map((r) => r.category)
          .filter((c): c is string => !!c && !catMap.has(c.toLowerCase()))
      ),
    ];
    for (const name of missingCats) {
      // Staff mate RLS block kare to category vagar import thase
      const { data } = await supabase
        .from("categories")
        .insert({ name })
        .select()
        .single();
      if (data) catMap.set(name.toLowerCase(), (data as Category).id);
    }

    let imported = 0;
    const CHUNK = 100;
    for (let i = 0; i < valid.length; i += CHUNK) {
      const chunk = valid.slice(i, i + CHUNK);
      setProgress(`Importing ${i + 1}–${Math.min(i + CHUNK, valid.length)} of ${valid.length}...`);

      const { data: inserted, error } = await supabase
        .from("products")
        .insert(
          chunk.map((r) => ({
            name: r.name,
            sku: r.sku,
            barcode: r.barcode,
            category_id: r.category
              ? (catMap.get(r.category.toLowerCase()) ?? null)
              : null,
            unit: r.unit,
            purchase_price: r.purchase_price,
            selling_price: r.selling_price,
            min_stock_level: r.min_stock_level,
            hsn_code: r.hsn_code,
            gst_rate: r.gst_rate,
          }))
        )
        .select("id, barcode, sku, name");

      if (error) {
        setError(`Row ${i + 1} pase error: ${error.message}`);
        setImporting(false);
        setProgress("");
        return;
      }

      // Opening stock movements
      const movements = (inserted ?? []).flatMap((p) => {
        const src = chunk.find(
          (r) =>
            (r.barcode && r.barcode === p.barcode) ||
            (r.sku && r.sku === p.sku) ||
            r.name === p.name
        );
        if (!src || src.opening_stock <= 0) return [];
        return [
          {
            product_id: p.id,
            type: "in" as const,
            quantity: src.opening_stock,
            reason: "Opening stock (import)",
            created_by: user!.id,
          },
        ];
      });

      if (movements.length > 0) {
        const { error: mvError } = await supabase
          .from("stock_movements")
          .insert(movements);
        if (mvError) {
          setError(`Opening stock error: ${mvError.message}`);
        }
      }
      imported += chunk.length;
    }

    setResult({ imported, skipped: rows.length - imported });
    setRows([]);
    setFileName("");
    setImporting(false);
    setProgress("");
  }

  const validCount = rows.filter((r) => !r.error).length;
  const errorCount = rows.length - validCount;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-stone-900">
          Bulk import products
        </h1>
        <Link
          href="/products"
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          ← Products
        </Link>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-stone-900">
            Step 1: Template download karo
          </h2>
          <p className="mt-1 text-xs text-stone-500">
            Excel template ma tamara products bharo. Name column jaruri che,
            baki optional.
          </p>
          <button
            onClick={downloadTemplate}
            className="mt-3 rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            ⬇ Download template
          </button>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-stone-900">
            Step 2: File upload karo
          </h2>
          <p className="mt-1 text-xs text-stone-500">
            .xlsx athva .csv — preview joine pachhi import thase
          </p>
          <label className="mt-3 inline-block cursor-pointer rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800">
            📂 Choose file
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </label>
          {fileName && (
            <p className="mt-2 text-xs text-stone-500">{fileName}</p>
          )}
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-3 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          ✓ {result.imported} products import thaya
          {result.skipped > 0 && ` · ${result.skipped} skip thaya (errors)`}
          {" — "}
          <Link href="/products" className="font-medium underline">
            Products jovo
          </Link>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="mt-4 flex items-center justify-between">
            <p className="text-sm text-stone-600">
              <span className="font-semibold text-emerald-700">
                {validCount} ready
              </span>
              {errorCount > 0 && (
                <span className="ml-2 font-semibold text-red-600">
                  {errorCount} errors (skip thashe)
                </span>
              )}
            </p>
            <button
              onClick={runImport}
              disabled={importing || validCount === 0}
              className="rounded-lg bg-emerald-700 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              {importing
                ? progress || "Importing..."
                : `⬆ Import ${validCount} products`}
            </button>
          </div>

          <div className="mt-3 overflow-hidden rounded-2xl border border-stone-200 bg-white">
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-stone-50">
                  <tr className="border-b border-stone-100 text-left text-xs text-stone-500">
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Barcode</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 text-right font-medium">Sell ₹</th>
                    <th className="px-3 py-2 text-right font-medium">Stock</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {rows.map((r, i) => (
                    <tr key={i} className={r.error ? "bg-red-50/50" : ""}>
                      <td className="px-3 py-2 font-medium text-stone-900">
                        {r.name || "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-stone-500">
                        {r.barcode ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-stone-500">
                        {r.category ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-stone-700">
                        {r.selling_price}
                      </td>
                      <td className="px-3 py-2 text-right text-stone-700">
                        {r.opening_stock}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.error ? (
                          <span className="font-medium text-red-600">
                            {r.error}
                          </span>
                        ) : (
                          <span className="text-emerald-700">✓ OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
