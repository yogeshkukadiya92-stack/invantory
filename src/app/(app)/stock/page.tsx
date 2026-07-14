"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/mongodb/client";
import type {
  BatchStockRow,
  Location,
  LocationStockRow,
  MovementResult,
  MovementType,
  StockRow,
  Supplier,
} from "@/lib/types";

interface MovementRow {
  id: string;
  type: MovementType;
  quantity: number;
  reason: string | null;
  created_at: string;
  products: { name: string; unit: string } | null;
  profiles: { full_name: string } | null;
  locations: { name: string } | null;
  batches: { batch_no: string } | null;
}

export default function StockPage() {
  const supabase = createClient();

  const [products, setProducts] = useState<StockRow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [locStock, setLocStock] = useState<LocationStockRow[]>([]);
  const [batchOptions, setBatchOptions] = useState<BatchStockRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<"entry" | "history" | "transfer">("entry");
  const [message, setMessage] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  const [form, setForm] = useState({
    product_id: "",
    type: "in" as MovementType,
    quantity: "",
    reason: "",
    supplier_id: "",
    location_id: "",
    batch_no: "",
    expiry_date: "",
    batch_id: "",
  });

  const [transfer, setTransfer] = useState({
    product_id: "",
    from_location: "",
    to_location: "",
    quantity: "",
  });
  const [transferMsg, setTransferMsg] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  const loadMovements = useCallback(async () => {
    const { data, error } = await supabase
      .from("stock_movements")
      .select(
        "id, type, quantity, reason, created_at, products(name, unit), profiles:created_by(full_name), locations(name), batches(batch_no)"
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      setLoadError(error.message);
      return;
    }
    setMovements((data ?? []) as unknown as MovementRow[]);
  }, [supabase]);

  const loadProducts = useCallback(async () => {
    const { data, error } = await supabase
      .from("current_stock")
      .select("*")
      .eq("is_active", true)
      .order("name");
    if (error) {
      setLoadError(error.message);
      return;
    }
    setProducts((data ?? []) as StockRow[]);
  }, [supabase]);

  useEffect(() => {
    async function load() {
      const [supplierResult, locationResult] = await Promise.all([
        supabase.from("suppliers").select("*").order("name"),
        supabase.from("locations").select("*").order("name"),
      ]);
      const initialError = supplierResult.error ?? locationResult.error;
      if (initialError) {
        setLoadError(initialError.message);
        return;
      }
      setSuppliers((supplierResult.data ?? []) as Supplier[]);
      const locList = (locationResult.data ?? []) as Location[];
      setLocations(locList);
      const def = locList.find((l) => l.is_default) ?? locList[0];
      if (def) {
        setForm((f) => ({ ...f, location_id: def.id }));
        setTransfer((t) => ({ ...t, from_location: def.id }));
      }
      loadProducts();
      loadMovements();
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Selected product nu location-wise stock
  useEffect(() => {
    if (!form.product_id) {
      setLocStock([]);
      return;
    }
    async function loadLocStock() {
      const { data, error } = await supabase
        .from("location_stock")
        .select("*")
        .eq("product_id", form.product_id);
      if (error) {
        setLoadError(error.message);
        return;
      }
      setLocStock((data ?? []) as LocationStockRow[]);
    }
    loadLocStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.product_id, movements]);

  // 'Out' mate batch options (aa location par stock vala batches)
  useEffect(() => {
    if (!form.product_id || !form.location_id || form.type !== "out") {
      setBatchOptions([]);
      return;
    }
    async function loadBatches() {
      const { data, error } = await supabase
        .from("batch_stock")
        .select("*")
        .eq("product_id", form.product_id)
        .eq("location_id", form.location_id)
        .gt("stock", 0)
        .order("expiry_date", { ascending: true, nullsFirst: false });
      if (error) {
        setLoadError(error.message);
        return;
      }
      setBatchOptions((data ?? []) as BatchStockRow[]);
    }
    loadBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.product_id, form.location_id, form.type, movements]);

  const selectedProduct = products.find((p) => p.product_id === form.product_id);
  const selectedLocationStock =
    locStock.find((row) => row.location_id === form.location_id)?.stock ??
    (locStock.length === 0 ? selectedProduct?.stock ?? 0 : 0);

  async function getFreshLocationStock() {
    if (!form.product_id || !form.location_id) return 0;
    const { data, error } = await supabase
      .from("location_stock")
      .select("*")
      .eq("product_id", form.product_id)
      .limit(100);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as LocationStockRow[];
    const selected = rows.find((row) => row.location_id === form.location_id);
    if (selected) return Number(selected.stock ?? 0);
    if (rows.length > 0) return 0;
    const { data: currentData, error: currentError } = await supabase
      .from("current_stock")
      .select("*")
      .eq("product_id", form.product_id)
      .limit(1);
    if (currentError) throw new Error(currentError.message);
    return Number(((currentData ?? []) as StockRow[])[0]?.stock ?? 0);
  }

  async function handleSubmit() {
    if (busy) return;
    if (!form.product_id) {
      setMessage({ kind: "err", text: "Product select karo" });
      return;
    }
    const qty = Number(form.quantity);
    if (
      !Number.isFinite(qty) ||
      (form.type === "adjustment" ? qty < 0 : qty <= 0)
    ) {
      setMessage({ kind: "err", text: "Valid quantity nakho" });
      return;
    }
    setBusy(true);
    setMessage(null);

    let movementQuantity = qty;
    let reason = form.reason.trim() || null;
    if (form.type === "adjustment") {
      let current: number;
      try {
        current = await getFreshLocationStock();
      } catch (error) {
        setBusy(false);
        setMessage({
          kind: "err",
          text: error instanceof Error ? error.message : "Stock load nathi thayu",
        });
        return;
      }
      movementQuantity = qty - current;
      reason = reason || `Set stock to ${qty}`;
      if (movementQuantity === 0) {
        const locName =
          locations.find((l) => l.id === form.location_id)?.name ?? "location";
        setBusy(false);
        setMessage({ kind: "ok", text: `${locName} par stock already ${qty} che` });
        return;
      }
    }

    const { data, error } = await supabase.rpc("record_movement", {
      p_product_id: form.product_id,
      p_type: form.type,
      p_quantity: movementQuantity,
      p_reason: reason,
      p_supplier_id: form.type === "in" && form.supplier_id ? form.supplier_id : null,
      p_location_id: form.location_id || null,
      p_batch_no: form.type === "in" && form.batch_no.trim() ? form.batch_no.trim() : null,
      p_expiry_date: form.type === "in" && form.expiry_date ? form.expiry_date : null,
      p_batch_id: form.type === "out" && form.batch_id ? form.batch_id : null,
    });
    setBusy(false);

    if (error) {
      setMessage({ kind: "err", text: error.message });
      return;
    }
    const result = data as MovementResult;
    const locName =
      locations.find((l) => l.id === form.location_id)?.name ?? "location";
    setMessage({
      kind: "ok",
      text: `Entry saved — ${locName} par have: ${result.new_stock}`,
    });
    setForm((f) => ({
      ...f,
      quantity: "",
      reason: "",
      batch_no: "",
      expiry_date: "",
      batch_id: "",
    }));
    loadProducts();
    loadMovements();
  }

  async function handleTransfer() {
    if (busy) return;
    if (!transfer.product_id || !transfer.from_location || !transfer.to_location) {
      setTransferMsg({ kind: "err", text: "Product ane locations select karo" });
      return;
    }
    if (transfer.from_location === transfer.to_location) {
      setTransferMsg({ kind: "err", text: "From ane To location alag hovi joie" });
      return;
    }
    const qty = Number(transfer.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setTransferMsg({ kind: "err", text: "Valid quantity nakho" });
      return;
    }
    setBusy(true);
    setTransferMsg(null);

    const { error } = await supabase.rpc("transfer_stock", {
      p_product_id: transfer.product_id,
      p_from_location: transfer.from_location,
      p_to_location: transfer.to_location,
      p_quantity: qty,
    });
    setBusy(false);

    if (error) {
      setTransferMsg({ kind: "err", text: error.message });
      return;
    }
    setTransferMsg({ kind: "ok", text: "Transfer completed" });
    setTransfer((t) => ({ ...t, quantity: "" }));
    loadProducts();
    loadMovements();
  }

  const input =
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600";
  const label = "block text-sm font-medium text-stone-700 mb-1";

  return (
    <div>
      <div>
        <h1 className="text-xl font-semibold text-stone-950">Stock</h1>
        <p className="mt-1 text-sm text-stone-500">
          Adjust quantities, transfer inventory, and review movement history
        </p>
      </div>

      {loadError && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{loadError}</span>
          <button type="button" onClick={() => setLoadError(null)} className="font-semibold underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="mt-5 flex max-w-full overflow-x-auto border-b border-stone-300" role="tablist" aria-label="Stock workspace">
        {([
          { id: "entry" as const, label: "Adjust stock" },
          ...(locations.length > 1 ? [{ id: "transfer" as const, label: "Transfer" }] : []),
          { id: "history" as const, label: "History" },
        ]).map((panel) => (
          <button
            key={panel.id}
            type="button"
            role="tab"
            aria-selected={activePanel === panel.id}
            onClick={() => setActivePanel(panel.id)}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium ${
              activePanel === panel.id
                ? "border-emerald-700 text-emerald-800"
                : "border-transparent text-stone-500 hover:text-stone-900"
            }`}
          >
            {panel.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <div className="space-y-4">
          {/* MANUAL ENTRY FORM */}
          <section className={`${activePanel === "entry" ? "block" : "hidden"} max-w-2xl rounded-lg border border-stone-200 bg-white p-5`}>
            <h2 className="text-sm font-semibold text-stone-900">
              Manual entry
            </h2>

            <div className="mt-3 space-y-3">
              <div>
                <label htmlFor="stock-product" className={label}>Product</label>
                <select
                  id="stock-product"
                  className={input}
                  value={form.product_id}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, product_id: e.target.value, batch_id: "" }))
                  }
                >
                  <option value="">— Select product —</option>
                  {products.map((p) => (
                    <option key={p.product_id} value={p.product_id}>
                      {p.name} ({p.stock} {p.unit})
                    </option>
                  ))}
                </select>
                {selectedProduct && locStock.length > 0 && (
                  <p className="mt-1 text-xs text-stone-500">
                    {locStock
                      .map((ls) => `${ls.location_name}: ${ls.stock}`)
                      .join(" · ")}
                  </p>
                )}
              </div>

              {locations.length > 1 && (
                <div>
                  <label htmlFor="stock-location" className={label}>Location</label>
                  <select
                    id="stock-location"
                    className={input}
                    value={form.location_id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, location_id: e.target.value, batch_id: "" }))
                    }
                  >
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                        {l.is_default ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className={label}>Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["in", "out", "adjustment"] as MovementType[]).map((t) => (
                    <button
                      type="button"
                      key={t}
                      aria-pressed={form.type === t}
                      onClick={() => setForm((f) => ({ ...f, type: t, batch_id: "" }))}
                      className={`rounded-lg py-2 text-sm font-medium capitalize transition-colors ${
                        form.type === t
                          ? t === "in"
                            ? "bg-emerald-700 text-white"
                            : t === "out"
                              ? "bg-amber-600 text-white"
                              : "bg-stone-700 text-white"
                          : "border border-stone-300 text-stone-700 hover:bg-stone-50"
                      }`}
                    >
                      {t === "in" ? "Add" : t === "out" ? "Remove" : "Set"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="stock-quantity" className={label}>
                  {form.type === "adjustment" ? "Set stock to" : "Quantity"}
                  {form.type === "adjustment" && (
                    <span className="ml-1 font-normal text-stone-400">
                      (current {selectedLocationStock})
                    </span>
                  )}
                </label>
                <input
                  id="stock-quantity"
                  type="number"
                  inputMode="decimal"
                  min={form.type === "adjustment" ? "0" : "0.001"}
                  step="any"
                  className={input}
                  value={form.quantity}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, quantity: e.target.value }))
                  }
                  placeholder={form.type === "adjustment" ? "e.g. 18" : "e.g. 50"}
                />
              </div>

              {form.type === "in" && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="stock-batch-number" className={label}>
                        Batch no{" "}
                        <span className="font-normal text-stone-400">
                          (optional)
                        </span>
                      </label>
                      <input
                        id="stock-batch-number"
                        className={input}
                        value={form.batch_no}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, batch_no: e.target.value }))
                        }
                        placeholder="e.g. B2024-07"
                      />
                    </div>
                    <div>
                      <label htmlFor="stock-expiry" className={label}>Expiry</label>
                      <input
                        id="stock-expiry"
                        type="date"
                        className={input}
                        value={form.expiry_date}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, expiry_date: e.target.value }))
                        }
                        disabled={!form.batch_no.trim()}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="stock-supplier" className={label}>Supplier (optional)</label>
                    <select
                      id="stock-supplier"
                      className={input}
                      value={form.supplier_id}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, supplier_id: e.target.value }))
                      }
                    >
                      <option value="">— None —</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {form.type === "out" && batchOptions.length > 0 && (
                <div>
                  <label htmlFor="stock-batch" className={label}>
                    Batch{" "}
                    <span className="font-normal text-stone-400">
                      (optional — FEFO order)
                    </span>
                  </label>
                  <select
                    id="stock-batch"
                    className={input}
                    value={form.batch_id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, batch_id: e.target.value }))
                    }
                  >
                    <option value="">— Koi pan (unbatched) —</option>
                    {batchOptions.map((b) => (
                      <option key={b.batch_id} value={b.batch_id}>
                        {b.batch_no} · {b.stock} {b.unit}
                        {b.expiry_date
                          ? ` · exp ${new Date(b.expiry_date).toLocaleDateString("en-IN")}`
                          : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label htmlFor="stock-reason" className={label}>Reason (optional)</label>
                <input
                  id="stock-reason"
                  className={input}
                  value={form.reason}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, reason: e.target.value }))
                  }
                  placeholder={
                    form.type === "adjustment"
                      ? "e.g. Count correction"
                      : "e.g. New purchase, sale"
                  }
                />
              </div>

              {message && (
                <p
                  role={message.kind === "err" ? "alert" : "status"}
                  className={`rounded-lg px-3 py-2 text-sm ${
                    message.kind === "ok"
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-red-50 text-red-700"
                  }`}
                >
                  {message.text}
                </p>
              )}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={busy}
                className="w-full rounded-lg bg-emerald-700 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors"
              >
                {busy ? "Saving..." : "Save entry"}
              </button>
            </div>
          </section>

          {/* TRANSFER */}
          {locations.length > 1 && (
            <section className={`${activePanel === "transfer" ? "block" : "hidden"} max-w-2xl rounded-lg border border-stone-200 bg-white p-5`}>
              <h2 className="text-sm font-semibold text-stone-900">
                Transfer between locations
              </h2>
              <div className="mt-3 space-y-3">
                <div>
                  <label htmlFor="transfer-product" className={label}>Product</label>
                  <select
                    id="transfer-product"
                    className={input}
                    value={transfer.product_id}
                    onChange={(e) =>
                      setTransfer((t) => ({ ...t, product_id: e.target.value }))
                    }
                  >
                    <option value="">— Select product —</option>
                    {products.map((p) => (
                      <option key={p.product_id} value={p.product_id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="transfer-from" className={label}>From</label>
                    <select
                      id="transfer-from"
                      className={input}
                      value={transfer.from_location}
                      onChange={(e) =>
                        setTransfer((t) => ({
                          ...t,
                          from_location: e.target.value,
                        }))
                      }
                    >
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="transfer-to" className={label}>To</label>
                    <select
                      id="transfer-to"
                      className={input}
                      value={transfer.to_location}
                      onChange={(e) =>
                        setTransfer((t) => ({
                          ...t,
                          to_location: e.target.value,
                        }))
                      }
                    >
                      <option value="">— Select —</option>
                      {locations
                        .filter((l) => l.id !== transfer.from_location)
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="transfer-quantity" className={label}>Quantity</label>
                  <input
                    id="transfer-quantity"
                    type="number"
                    inputMode="decimal"
                    min="0.001"
                    step="any"
                    className={input}
                    value={transfer.quantity}
                    onChange={(e) =>
                      setTransfer((t) => ({ ...t, quantity: e.target.value }))
                    }
                  />
                </div>
                {transferMsg && (
                  <p
                    role={transferMsg.kind === "err" ? "alert" : "status"}
                    className={`rounded-lg px-3 py-2 text-sm ${
                      transferMsg.kind === "ok"
                        ? "bg-emerald-50 text-emerald-800"
                        : "bg-red-50 text-red-700"
                    }`}
                  >
                    {transferMsg.text}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleTransfer}
                  disabled={busy}
                  className="w-full rounded-lg border border-emerald-700 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                >
                  {busy ? "Processing..." : "Transfer"}
                </button>
              </div>
            </section>
          )}
        </div>

        {/* MOVEMENT HISTORY */}
        <section className={`${activePanel === "history" ? "block" : "hidden"} rounded-lg border border-stone-200 bg-white`}>
          <div className="border-b border-stone-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-stone-900">
              Recent movements (last 50)
            </h2>
          </div>
          {movements.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-stone-500">
              No entries yet
            </p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {movements.map((m) => {
                const badge =
                  m.type === "in"
                    ? "bg-emerald-50 text-emerald-700"
                    : m.type === "out"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-stone-100 text-stone-600";
                const label =
                  m.type === "in" ? "In" : m.type === "out" ? "Out" : "Adjust";
                return (
                  <li
                    key={m.id}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-stone-900">
                        {m.products?.name ?? "Unknown"}
                      </p>
                      <p className="truncate text-xs text-stone-500">
                        {new Date(m.created_at).toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                        {m.locations?.name ? ` · ${m.locations.name}` : ""}
                        {m.batches?.batch_no ? ` · ${m.batches.batch_no}` : ""}
                        {m.profiles?.full_name
                          ? ` · ${m.profiles.full_name}`
                          : ""}
                        {m.reason ? ` · ${m.reason}` : ""}
                      </p>
                    </div>
                    <span
                      className={`ml-3 shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${badge}`}
                    >
                      {label} {Math.abs(m.quantity)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
