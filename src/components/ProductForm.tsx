"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import JsBarcode from "jsbarcode";
import { createClient } from "@/lib/mongodb/client";
import type { Category } from "@/lib/types";
import { ConfirmDialog } from "@/components/DashboardUI";

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
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    sku: "",
    barcode: initialBarcode ?? "",
    category_id: "",
    unit: "pcs",
    opening_stock: "",
    purchase_price: "",
    selling_price: "",
    mrp: "",
    weight_grams: "",
    min_stock_level: "",
    hsn_code: "",
    gst_rate: "0",
  });

  useEffect(() => {
    async function load() {
      const { data: cats, error: categoryError } = await supabase
        .from("categories")
        .select("*")
        .order("name");
      if (categoryError) setError(categoryError.message);
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
          opening_stock: "",
          purchase_price: Number(data.purchase_price) > 0 ? String(data.purchase_price) : "",
          selling_price: Number(data.selling_price) > 0 ? String(data.selling_price) : "",
          mrp: Number(data.mrp) > 0 ? String(data.mrp) : "",
          weight_grams: Number(data.weight_grams) > 0 ? String(data.weight_grams) : "",
          min_stock_level: Number(data.min_stock_level) > 0 ? String(data.min_stock_level) : "",
          hsn_code: data.hsn_code ?? "",
          gst_rate: String(data.gst_rate ?? 0),
        });
        setImageUrl(data.image_url);
        setIsActive(data.is_active !== false);
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
    const unit = form.unit.trim() || "pcs";
    if (/^-?\d+(\.\d+)?$/.test(unit)) {
      setError("Unit ma pcs/kg/box lakho. Stock quantity alag field ma nakho.");
      return;
    }
    const openingStock = Number(form.opening_stock);
    if (!productId && (!Number.isFinite(openingStock) || openingStock < 0)) {
      setError("Opening stock 0 ke tena thi vadhare hovu joie");
      return;
    }
    for (const [field, value] of [
      ["Purchase price", form.purchase_price],
      ["Selling price", form.selling_price],
      ["MRP", form.mrp],
      ["Weight", form.weight_grams],
      ["Min stock level", form.min_stock_level],
    ] as const) {
      if (value.trim() && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
        setError(`${field} 0 ke tena thi vadhare hovu joie`);
        return;
      }
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
      unit,
      purchase_price: Number(form.purchase_price) || 0,
      selling_price: Number(form.selling_price) || 0,
      mrp: form.mrp.trim() ? Number(form.mrp) : null,
      weight_grams: form.weight_grams.trim() ? Number(form.weight_grams) : null,
      min_stock_level: Number(form.min_stock_level) || 0,
      hsn_code: form.hsn_code.trim() || null,
      gst_rate: Number(form.gst_rate) || 0,
    };

    const { error } = productId
      ? await supabase.from("products").update(payload).eq("id", productId).single()
      : await supabase.rpc("create_product", {
          p_product: payload,
          p_opening_stock: openingStock,
        });

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

  async function handleStatusChange() {
    if (!productId || saving) return;
    setSaving(true);
    setConfirmDeactivate(false);
    setError(null);
    const nextActive = !isActive;
    const { error } = await supabase
      .from("products")
      .update({ is_active: nextActive })
      .eq("id", productId);
    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }
    setIsActive(nextActive);
    router.push("/products");
    router.refresh();
  }

  if (loading)
    return <p className="py-8 text-center text-sm text-stone-500">Loading...</p>;

  if (missingProduct) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-red-100 bg-white p-5">
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

      <form
        className="mt-4 space-y-4 rounded-lg border border-stone-200 bg-white p-5"
        onSubmit={(event) => {
          event.preventDefault();
          handleSave();
        }}
      >
        <div className="flex items-center gap-4">
          {imagePreview || imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imagePreview ?? imageUrl ?? ""}
              alt=""
              className="h-20 w-20 rounded-xl border border-stone-200 object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-stone-100 text-xs font-semibold text-stone-500">
              IMAGE
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="cursor-pointer rounded-lg border border-stone-300 px-3 py-1.5 text-center text-sm text-stone-700 hover:bg-stone-50">
              {imageUrl || imagePreview ? "Change photo" : "Add photo"}
              <input
                type="file"
                accept="image/*"
                aria-label="Product image"
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
          <label htmlFor="product-name" className={label}>Product name *</label>
          <input
            id="product-name"
            required
            className={input}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="e.g. Product 100g"
          />
        </div>

        <div>
            <label htmlFor="product-barcode" className={label}>Barcode</label>
          <div className="flex gap-2">
            <input
              id="product-barcode"
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

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="product-sku" className={label}>SKU</label>
            <input
              id="product-sku"
              className={input}
              value={form.sku}
              onChange={(e) => set("sku", e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div>
            <label htmlFor="product-category" className={label}>Category</label>
            <select
              id="product-category"
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
            <label htmlFor="product-purchase-price" className={label}>Purchase price (₹)</label>
            <input
              id="product-purchase-price"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              className={input}
              value={form.purchase_price}
              onChange={(e) => set("purchase_price", e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <label htmlFor="product-selling-price" className={label}>Selling price (₹)</label>
            <input
              id="product-selling-price"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              className={input}
              value={form.selling_price}
              onChange={(e) => set("selling_price", e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <label htmlFor="product-mrp" className={label}>MRP (₹)</label>
            <input
              id="product-mrp"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              className={input}
              value={form.mrp}
              onChange={(e) => set("mrp", e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="product-hsn" className={label}>HSN code</label>
            <input
              id="product-hsn"
              className={input}
              value={form.hsn_code}
              onChange={(e) => set("hsn_code", e.target.value)}
              placeholder="GST invoice mate"
            />
          </div>
          <div>
            <label htmlFor="product-gst" className={label}>GST rate</label>
            <select
              id="product-gst"
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
            <label htmlFor="product-unit" className={label}>Unit label</label>
            <input
              id="product-unit"
              className={input}
              value={form.unit}
              onChange={(e) => set("unit", e.target.value)}
              placeholder="pcs / kg / box"
            />
          </div>
          <div>
            <label htmlFor="product-min-stock" className={label}>Min stock level</label>
            <input
              id="product-min-stock"
              type="number"
              inputMode="numeric"
              min="0"
              className={input}
              value={form.min_stock_level}
              onChange={(e) => set("min_stock_level", e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label htmlFor="product-weight" className={label}>Weight (grams)</label>
            <input
              id="product-weight"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              className={input}
              value={form.weight_grams}
              onChange={(e) => set("weight_grams", e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>

        {!productId && (
          <div>
            <label htmlFor="product-opening-stock" className={label}>Opening stock</label>
            <input
              id="product-opening-stock"
              type="number"
              inputMode="numeric"
              min="0"
              className={input}
              value={form.opening_stock}
              onChange={(e) => set("opening_stock", e.target.value)}
              placeholder="0"
            />
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-lg bg-emerald-700 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : productId ? "Save changes" : "Add product"}
          </button>
          {productId && (
            <button
              type="button"
              onClick={() => setConfirmDeactivate(true)}
              disabled={saving}
              className={`rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "border-red-200 text-red-600 hover:bg-red-50"
                  : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              }`}
            >
              {isActive ? "Deactivate" : "Reactivate"}
            </button>
          )}
        </div>
      </form>
      <ConfirmDialog
        open={confirmDeactivate}
        onCancel={() => setConfirmDeactivate(false)}
        onConfirm={handleStatusChange}
        busy={saving}
        tone={isActive ? "danger" : "primary"}
        title={isActive ? "Deactivate product?" : "Reactivate product?"}
        description={
          isActive
            ? "The product will be hidden from new sales and purchases. Existing invoices and stock history will remain available."
            : "The product will be available again in new sales, purchases, scanning, and stock workflows."
        }
        confirmLabel={isActive ? "Deactivate" : "Reactivate"}
      />
    </div>
  );
}
