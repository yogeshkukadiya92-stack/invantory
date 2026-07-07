"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import JsBarcode from "jsbarcode";
import { createClient } from "@/lib/mongodb/client";
import type { Category, Product } from "@/lib/types";

interface Props {
  productId?: string; // hoy to edit mode
  initialBarcode?: string; // scan par thi aavya hoy to prefill
}

export function ProductForm({ productId, initialBarcode }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const barcodeSvgRef = useRef<SVGSVGElement>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(!!productId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingProduct, setMissingProduct] = useState(false);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    sku: "",
    barcode: initialBarcode ?? "",
    category_id: "",
    unit: "pcs",
    purchase_price: "",
    selling_price: "",
    min_stock_level: "0",
    hsn_code: "",
    gst_rate: "0",
  });

  useEffect(() => {
    async function load() {
      const { data: cats } = await supabase
        .from("categories")
        .select("*")
        .order("name");
      setCategories((cats ?? []) as Category[]);

      if (productId) {
        const { data, error: productError } = await supabase
          .from("products")
          .select("*")
          .eq("id", productId)
          .single();
        if (productError || !data) {
          setMissingProduct(true);
          setError(
            "Product not found. Products page refresh karo ane product fari open karo."
          );
          setLoading(false);
          return;
        }
        setForm({
          name: data.name,
          sku: data.sku ?? "",
          barcode: data.barcode ?? "",
          category_id: data.category_id ?? "",
          unit: data.unit,
          purchase_price: String(data.purchase_price),
          selling_price: String(data.selling_price),
          min_stock_level: String(data.min_stock_level),
          hsn_code: data.hsn_code ?? "",
          gst_rate: String(data.gst_rate ?? 0),
        });
        setImageUrl(data.image_url);
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

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
    if (saving) return;
    if (!form.name.trim()) {
      setError("Product name is required");
      return;
    }
    setSaving(true);
    setError(null);

    // Navi image select kari hoy to pehla storage ma upload karo
    let finalImageUrl = imageUrl;
    if (imageFile) {
      const ext = imageFile.name.split(".").pop() || "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(path, imageFile, { upsert: false });
      if (uploadError) {
        setError("Image upload fail thayu: " + uploadError.message);
        setSaving(false);
        return;
      }
      finalImageUrl = supabase.storage
        .from("product-images")
        .getPublicUrl(path).data.publicUrl;
    }

    const payload = {
      image_url: finalImageUrl,
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      barcode: form.barcode.trim() || null,
      category_id: form.category_id || null,
      unit: form.unit.trim() || "pcs",
      purchase_price: Number(form.purchase_price) || 0,
      selling_price: Number(form.selling_price) || 0,
      min_stock_level: Number(form.min_stock_level) || 0,
      hsn_code: form.hsn_code.trim() || null,
      gst_rate: Number(form.gst_rate) || 0,
    };

    const { error } = productId
      ? await supabase.from("products").update(payload).eq("id", productId)
      : await supabase.from("products").insert(payload);

    if (error) {
      setError(
        error.message.includes("duplicate")
          ? "Aa barcode ke SKU already exist kare che"
          : error.message
      );
      setSaving(false);
      return;
    }
    router.push("/products");
    router.refresh();
  }

  async function handleDeactivate() {
    if (!productId || saving) return;
    if (!confirm("Product ne deactivate karvu che? (Data delete nahi thay)"))
      return;
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from("products")
      .update({ is_active: false })
      .eq("id", productId);
    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    router.push("/products");
    router.refresh();
  }

  if (loading)
    return <p className="py-8 text-center text-sm text-stone-500">Loading...</p>;

  if (missingProduct) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-red-100 bg-white p-5">
        <h1 className="text-lg font-semibold text-stone-900">
          Product open nathi thai rahyu
        </h1>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        <button
          type="button"
          onClick={() => router.push("/products")}
          className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800"
        >
          Back to products
        </button>
      </div>
    );
  }

  const input =
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600";
  const label = "block text-sm font-medium text-stone-700 mb-1";

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-semibold text-stone-900">
        {productId ? "Edit product" : "Add product"}
      </h1>

      <div className="mt-4 space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
        <div className="flex items-center gap-4">
          {imagePreview || imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imagePreview ?? imageUrl ?? ""}
              alt=""
              className="h-20 w-20 rounded-xl border border-stone-200 object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-stone-100 text-2xl text-stone-400">
              📦
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="cursor-pointer rounded-lg border border-stone-300 px-3 py-1.5 text-center text-sm text-stone-700 hover:bg-stone-50">
              {imageUrl || imagePreview ? "Change photo" : "Add photo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 3 * 1024 * 1024) {
                    setError("Image 3MB thi nani rakho");
                    return;
                  }
                  setImageFile(f);
                  setImagePreview(URL.createObjectURL(f));
                }}
              />
            </label>
            {(imageUrl || imagePreview) && (
              <button
                type="button"
                onClick={() => {
                  setImageFile(null);
                  setImagePreview(null);
                  setImageUrl(null);
                }}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        <div>
          <label className={label}>Product name *</label>
          <input
            className={input}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Product 100g"
          />
        </div>

        <div>
          <label className={label}>Barcode</label>
          <div className="flex gap-2">
            <input
              className={input}
              value={form.barcode}
              onChange={(e) => set("barcode", e.target.value)}
              placeholder="Scan karo athva Generate dabavo"
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
            <label className={label}>HSN code</label>
            <input
              className={input}
              value={form.hsn_code}
              onChange={(e) => set("hsn_code", e.target.value)}
              placeholder="GST invoice mate"
            />
          </div>
          <div>
            <label className={label}>GST rate</label>
            <select
              className={input}
              value={form.gst_rate}
              onChange={(e) => set("gst_rate", e.target.value)}
            >
              <option value="0">0% (exempt)</option>
              <option value="5">5%</option>
              <option value="12">12%</option>
              <option value="18">18%</option>
              <option value="28">28%</option>
            </select>
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
              disabled={saving}
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
