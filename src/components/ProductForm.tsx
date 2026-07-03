"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import JsBarcode from "jsbarcode";
import { createClient } from "@/lib/supabase/client";
import type { Category, Product } from "@/lib/types";

interface Props {
  productId?: string; // edit mode when present
  initialBarcode?: string; // prefill when opened from scan
}

export function ProductForm({ productId, initialBarcode }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const barcodeSvgRef = useRef<SVGSVGElement>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(!!productId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    sku: "",
    barcode: initialBarcode ?? "",
    category_id: "",
    unit: "pcs",
    purchase_price: "",
    selling_price: "",
    min_stock_level: "0",
  });

  useEffect(() => {
    async function load() {
      const { data: cats } = await supabase
        .from("categories")
        .select("*")
        .order("name");
      setCategories((cats ?? []) as Category[]);

      if (productId) {
        const { data } = await supabase
          .from("products")
          .select("*")
          .eq("id", productId)
          .single<Product>();
        if (data) {
          setForm({
            name: data.name,
            sku: data.sku ?? "",
            barcode: data.barcode ?? "",
            category_id: data.category_id ?? "",
            unit: data.unit,
            purchase_price: String(data.purchase_price),
            selling_price: String(data.selling_price),
            min_stock_level: String(data.min_stock_level),
          });
        }
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  // Barcode preview render
  useEffect(() => {
    if (barcodeSvgRef.current && form.barcode.trim()) {
      try {
        JsBarcode(barcodeSvgRef.current, form.barcode.trim(), {
          format: "CODE128",
          height: 48,
          displayValue: true,
          fontSize: 13,
          margin: 8,
        });
      } catch {
        // invalid barcode value — preview skip
      }
    }
  }, [form.barcode]);

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function generateBarcode() {
    // 12-digit unique code: timestamp + random
    const code =
      String(Date.now()).slice(-10) +
      String(Math.floor(Math.random() * 90) + 10);
    set("barcode", code);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setError("Product name is required");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      barcode: form.barcode.trim() || null,
      category_id: form.category_id || null,
      unit: form.unit.trim() || "pcs",
      purchase_price: Number(form.purchase_price) || 0,
      selling_price: Number(form.selling_price) || 0,
      min_stock_level: Number(form.min_stock_level) || 0,
    };

    const response = await fetch(productId ? `/api/products/${productId}` : "/api/products", {
      method: productId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (!response.ok) {
      setError(
        String(result.error ?? "").includes("exists")
          ? "This barcode or SKU already exists"
          : result.error ?? "Could not save product"
      );
      setSaving(false);
      return;
    }
    router.push("/products");
    router.refresh();
  }

  async function handleDeactivate() {
    if (!productId) return;
    if (!confirm("Deactivate this product? Existing records will be kept."))
      return;
    await fetch(`/api/products/${productId}`, { method: "DELETE" });
    router.push("/products");
    router.refresh();
  }

  if (loading)
    return <p className="py-8 text-center text-sm text-stone-500">Loading...</p>;

  const input =
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600";
  const label = "block text-sm font-medium text-stone-700 mb-1";

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-semibold text-stone-900">
        {productId ? "Edit product" : "Add product"}
      </h1>

      <div className="mt-4 space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
        <div>
          <label className={label}>Product name *</label>
          <input
            className={input}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Parle-G 100g"
          />
        </div>

        <div>
          <label className={label}>Barcode</label>
          <div className="flex gap-2">
            <input
              className={input}
              value={form.barcode}
              onChange={(e) => set("barcode", e.target.value)}
              placeholder="Scan barcode or click Generate"
            />
            <button
              type="button"
              onClick={generateBarcode}
              className="shrink-0 rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50"
            >
              Generate
            </button>
          </div>
          {form.barcode.trim() && (
            <div className="mt-2 overflow-hidden rounded-lg border border-stone-200 bg-white p-2 text-center">
              <svg ref={barcodeSvgRef} className="mx-auto max-w-full" />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>SKU</label>
            <input
              className={input}
              value={form.sku}
              onChange={(e) => set("sku", e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <label className={label}>Category</label>
            <select
              className={input}
              value={form.category_id}
              onChange={(e) => set("category_id", e.target.value)}
            >
              <option value="">— None —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Purchase price (₹)</label>
            <input
              type="number"
              inputMode="decimal"
              className={input}
              value={form.purchase_price}
              onChange={(e) => set("purchase_price", e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className={label}>Selling price (₹)</label>
            <input
              type="number"
              inputMode="decimal"
              className={input}
              value={form.selling_price}
              onChange={(e) => set("selling_price", e.target.value)}
              placeholder="0.00"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Unit</label>
            <input
              className={input}
              value={form.unit}
              onChange={(e) => set("unit", e.target.value)}
              placeholder="pcs / kg / box"
            />
          </div>
          <div>
            <label className={label}>Min stock level</label>
            <input
              type="number"
              inputMode="numeric"
              className={input}
              value={form.min_stock_level}
              onChange={(e) => set("min_stock_level", e.target.value)}
            />
          </div>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-lg bg-emerald-700 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : productId ? "Save changes" : "Add product"}
          </button>
          {productId && (
            <button
              onClick={handleDeactivate}
              className="rounded-lg border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              Deactivate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
