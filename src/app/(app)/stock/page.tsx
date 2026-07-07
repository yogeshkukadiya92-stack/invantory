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
    const { data } = await supabase
      .from("stock_movements")
      .select(
        "id, type, quantity, reason, created_at, products(name, unit), profiles:created_by(full_name), locations(name), batches(batch_no)"
      )
      .order("created_at", { ascending: false })
      .limit(50);
    setMovements((data ?? []) as unknown as MovementRow[]);
  }, [supabase]);

  const loadProducts = useCallback(async () => {
    const { data } = await supabase
      .from("current_stock")
      .select("*")
      .eq("is_active", true)
      .order("name");
    setProducts((data ?? []) as StockRow[]);
  }, [supabase]);

  useEffect(() => {
    async function load() {
      const [{ data: sups }, { data: locs }] = await Promise.all([
        supabase.from("suppliers").select("*").order("name"),
        supabase.from("locations").select("*").order("name"),
      ]);
      setSuppliers((sups ?? []) as Supplier[]);
      const locList = (locs ?? []) as Location[];
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
      const { data } = await supabase
        .from("location_stock")
        .select("*")
        .eq("product_id", form.product_id);
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
      const { data } = await supabase
        .from("batch_stock")
        .select("*")
        .eq("product_id", form.product_id)
        .eq("location_id", form.location_id)
        .gt("stock", 0)
        .order("expiry_date", { ascending: true, nullsFirst: false });
      setBatchOptions((data ?? []) as BatchStockRow[]);
    }
    loadBatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.product_id, form.location_id, form.type, movements]);

  const selectedProduct = products.find((p) => p.product_id === form.product_id);

  async function handleSubmit() {
    if (busy) return;
    if (!form.product_id) {
      setMessage({ kind: "err", text: "Product select karo" });
      return;
    }
    const qty = parseInt(form.quantity, 10);
    if (!qty || (form.type !== "adjustment" && qty <= 0)) {
      setMessage({ kind: "err", text: "Valid quantity nakho" });
      return;
    }
    setBusy(true);
    setMessage(null);

    const { data, error } = await supabase.rpc("record_movement", {
      p_product_id: form.product_id,
      p_type: form.type,
      p_quantity: qty,
      p_reason: form.reason.trim() || null,
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
    const qty = parseInt(transfer.quantity, 10);
    if (!qty || qty <= 0) {
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
    setTransferMsg({ kind: "ok", text: "Transfer thai gayu ✓" });
    setTransfer((t) => ({ ...t, quantity: "" }));
    loadProducts();
    loadMovements();
  }

  const input =
    "w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600";
  const label = "block text-sm font-medium text-stone-700 mb-1";

  return (
    <div>
      <h1 className="text-xl font-semibold text-stone-900">Stock</h1>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-2">
          {/* MANUAL ENTRY FORM */}
          <section className="rounded-2xl border border-stone-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-stone-900">
              Manual entry
            </h2>

            <div className="mt-3 space-y-3">
              <div>
                <label className={label}>Product</label>
                <select
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
                  <label className={label}>Location</label>
                  <select
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
                      key={t}
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
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={label}>
                  Quantity
                  {form.type === "adjustment" && (
                    <span className="ml-1 font-normal text-stone-400">
                      (negative = remove, e.g. -5)
                    </span>
                  )}
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  className={input}
                  value={form.quantity}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, quantity: e.target.value }))
                  }
                  placeholder={form.type === "adjustment" ? "e.g. -5 or 10" : "e.g. 50"}
                />
              </div>

              {form.type === "in" && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={label}>
                        Batch no{" "}
                        <span className="font-normal text-stone-400">
                          (optional)
                        </span>
                      </label>
                      <input
                        className={input}
                        value={form.batch_no}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, batch_no: e.target.value }))
                        }
                        placeholder="e.g. B2024-07"
                      />
                    </div>
                    <div>
                      <label className={label}>Expiry</label>
                      <input
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
                    <label className={label}>Supplier (optional)</label>
                    <select
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
                  <label className={label}>
                    Batch{" "}
                    <span className="font-normal text-stone-400">
                      (optional — FEFO order)
                    </span>
                  </label>
                  <select
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
                <label className={label}>Reason (optional)</label>
                <input
                  className={input}
                  value={form.reason}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, reason: e.target.value }))
                  }
                  placeholder={
                    form.type === "adjustment"
                      ? "e.g. Damaged, count correction"
                      : "e.g. New purchase, sale"
                  }
                />
              </div>

              {message && (
                <p
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
            <section className="rounded-2xl border border-stone-200 bg-white p-5">
              <h2 className="text-sm font-semibold text-stone-900">
                🔁 Transfer between locations
              </h2>
              <div className="mt-3 space-y-3">
                <select
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
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={label}>From</label>
                    <select
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
                    <label className={label}>To</label>
                    <select
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
                <input
                  type="number"
                  inputMode="numeric"
                  className={input}
                  value={transfer.quantity}
                  onChange={(e) =>
                    setTransfer((t) => ({ ...t, quantity: e.target.value }))
                  }
                  placeholder="Quantity"
                />
                {transferMsg && (
                  <p
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
        <section className="rounded-2xl border border-stone-200 bg-white lg:col-span-3">
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
                const sign =
                  m.type === "in" ? "+" : m.type === "out" ? "−" : m.quantity > 0 ? "+" : "";
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
                      {sign}
                      {m.type === "adjustment" ? m.quantity : Math.abs(m.quantity)}
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
