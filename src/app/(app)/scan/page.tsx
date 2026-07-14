"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { PageHeader, useToast } from "@/components/DashboardUI";
import { createClient } from "@/lib/mongodb/client";
import type {
  BarcodeLookup,
  Location,
  MovementResult,
  StockRow,
} from "@/lib/types";

type Mode = "scanner" | "camera";

export default function ScanPage() {
  const router = useRouter();
  const supabase = createClient();
  const { showToast } = useToast();

  const [mode, setMode] = useState<Mode>("scanner");
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");
  const [scannerValue, setScannerValue] = useState("");
  const [product, setProduct] = useState<StockRow | null>(null);
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const lastScanRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  // Locations load + chhelli vaparayeli location yaad rakho
  useEffect(() => {
    async function loadLocations() {
      const { data, error } = await supabase
        .from("locations")
        .select("*")
        .order("name");
      if (error) {
        showToast(error.message, "error");
        return;
      }
      const locs = (data ?? []) as Location[];
      setLocations(locs);
      const saved = localStorage.getItem("scan_location");
      const def =
        locs.find((l) => l.id === saved) ??
        locs.find((l) => l.is_default) ??
        locs[0];
      if (def) setLocationId(def.id);
    }
    loadLocations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScan = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();
      if (!code) return;

      // Camera ej barcode ne varamvar detect kare — 2.5s debounce
      const now = Date.now();
      if (
        lastScanRef.current.code === code &&
        now - lastScanRef.current.at < 2500
      )
        return;
      lastScanRef.current = { code, at: now };

      const { data, error } = await supabase.rpc("lookup_barcode", {
        p_barcode: code,
        p_location_id: locationId || null,
      });
      if (error) {
        showToast(error.message, "error");
        return;
      }
      const result = data as BarcodeLookup;
      if (result.found) {
        setProduct(result.product);
        setNotFoundCode(null);
        setQuantity("1");
        if (navigator.vibrate) navigator.vibrate(80);
      } else {
        setProduct(null);
        setNotFoundCode(code);
      }
    },
    [locationId, showToast, supabase]
  );

  // ---------- USB SCANNER MODE ----------
  // Scanner keyboard ni jem type kare + chhelle Enter mokle.
  // Input hamesha focused rahe e mate blur par refocus.
  useEffect(() => {
    if (mode !== "scanner") return;
    inputRef.current?.focus();
    const interval = setInterval(() => {
      if (
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "SELECT" &&
        document.activeElement?.tagName !== "BUTTON"
      ) {
        inputRef.current?.focus();
      }
    }, 800);
    return () => clearInterval(interval);
  }, [mode, product, notFoundCode]);

  // ---------- CAMERA MODE ----------
  useEffect(() => {
    if (mode !== "camera") return;
    const reader = new BrowserMultiFormatReader();
    let active = true;

    async function start() {
      try {
        const controls = await reader.decodeFromVideoDevice(
          undefined, // default (back) camera
          videoRef.current!,
          (result) => {
            if (result && active) handleScan(result.getText());
          }
        );
        controlsRef.current = controls;
      } catch {
        showToast("Camera access denied. Check the browser permission.", "error");
      }
    }
    start();

    return () => {
      active = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [mode, handleScan, showToast]);

  // ---------- STOCK ENTRY ----------
  async function recordMovement(type: "in" | "out") {
    if (busy) return;
    if (!product) return;
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      showToast("Quantity must be at least 1.", "error");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("record_movement", {
      p_product_id: product.product_id,
      p_type: type,
      p_quantity: qty,
      p_location_id: locationId || null,
    });
    setBusy(false);

    if (error) {
      showToast(error.message, "error");
      return;
    }
    const result = data as MovementResult;
    showToast(
      `${product.name}: ${type === "in" ? "stock in" : "stock out"} ${qty}. Current stock: ${result.new_stock} ${product.unit}.`
    );
    // Next scan mate reset
    setProduct(null);
    setNotFoundCode(null);
    setScannerValue("");
    lastScanRef.current = { code: "", at: 0 };
    inputRef.current?.focus();
  }

  const modeBtn = (m: Mode, labelText: string) => (
    <button
      type="button"
      aria-pressed={mode === m}
      onClick={() => {
        setMode(m);
        setProduct(null);
        setNotFoundCode(null);
      }}
      className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors ${
        mode === m
          ? "bg-emerald-700 text-white"
          : "bg-white text-stone-700 border border-stone-300 hover:bg-stone-50"
      }`}
    >
      {labelText}
    </button>
  );

  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        title="Scan"
        description="Look up a barcode and record a stock movement."
      />

      <div className="mt-4 flex gap-2">
        {modeBtn("scanner", "USB scanner")}
        {modeBtn("camera", "Camera")}
      </div>

      {locations.length > 1 && (
        <div className="mt-3">
          <label htmlFor="scan-location" className="mb-1 block text-xs font-medium text-stone-600">
            Stock location
          </label>
          <select
            id="scan-location"
            className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
            value={locationId}
            onChange={(e) => {
              setLocationId(e.target.value);
              localStorage.setItem("scan_location", e.target.value);
              setProduct(null);
              setNotFoundCode(null);
            }}
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

      {/* SCANNER MODE */}
      {mode === "scanner" && (
        <div className="mt-4 rounded-lg border border-stone-200 bg-white p-5 text-center">
          <p className="text-sm text-stone-600">
            Scanner thi barcode scan karo — entry automatic aavshe
          </p>
          <input
            aria-label="Barcode"
            ref={inputRef}
            value={scannerValue}
            onChange={(e) => setScannerValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleScan(scannerValue);
                setScannerValue("");
              }
            }}
            placeholder="Barcode ahi aavshe..."
            className="mt-3 w-full rounded-lg border-2 border-dashed border-emerald-400 bg-emerald-50/40 px-3 py-3 text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-emerald-600"
            autoComplete="off"
          />
          <p className="mt-2 text-xs text-stone-400">
            Manually type karine Enter pan dabavi shakay
          </p>
        </div>
      )}

      {/* CAMERA MODE */}
      {mode === "camera" && (
        <div className="mt-4 overflow-hidden rounded-lg border border-stone-200 bg-black">
          <video
            ref={videoRef}
            className="aspect-[4/3] w-full object-cover"
            muted
            playsInline
          />
          <p className="bg-white px-4 py-2 text-center text-xs text-stone-500">
            Barcode ne frame ma steady rakho — auto-detect thashe
          </p>
        </div>
      )}

      {/* PRODUCT FOUND — QUICK ENTRY */}
      {product && (
        <div className="mt-4 rounded-lg border-2 border-emerald-600 bg-white p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              {product.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="h-12 w-12 shrink-0 rounded-lg border border-stone-200 object-cover"
                />
              )}
              <div>
                <p className="text-base font-semibold text-stone-900">
                  {product.name}
                </p>
                <p className="text-xs text-stone-500">
                  {product.barcode} · ₹
                  {Number(product.selling_price).toLocaleString("en-IN")}
                </p>
              </div>
            </div>
            <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
              Stock: {product.stock} {product.unit}
            </span>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() =>
                setQuantity((q) => String(Math.max(1, (Number(q) || 1) - 1)))
              }
              className="h-11 w-11 rounded-lg border border-stone-300 text-lg font-semibold text-stone-700"
            >
              −
            </button>
            <input
              aria-label="Movement quantity"
              type="number"
              inputMode="decimal"
              min="0.001"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="h-11 flex-1 rounded-lg border border-stone-300 text-center text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => setQuantity((q) => String((Number(q) || 0) + 1))}
              className="h-11 w-11 rounded-lg border border-stone-300 text-lg font-semibold text-stone-700"
            >
              +
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => recordMovement("in")}
              disabled={busy}
              className="rounded-lg bg-emerald-700 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
            >
              Stock in
            </button>
            <button
              type="button"
              onClick={() => recordMovement("out")}
              disabled={
                busy ||
                !Number.isFinite(Number(quantity)) ||
                Number(quantity) <= 0 ||
                Number(quantity) > product.stock
              }
              title={
                Number(quantity) > product.stock
                  ? `Only ${product.stock} ${product.unit} available at this location`
                  : "Remove stock"
              }
              className="rounded-lg bg-amber-600 py-3 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Stock out
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              setProduct(null);
              inputRef.current?.focus();
            }}
            className="mt-2 w-full py-2 text-sm text-stone-500 hover:text-stone-700"
          >
            Cancel
          </button>
        </div>
      )}

      {/* NOT FOUND */}
      {notFoundCode && (
        <div className="mt-4 rounded-lg border-2 border-amber-400 bg-amber-50 p-5 text-center">
          <p className="text-sm font-medium text-amber-900">
            Barcode <span className="font-mono">{notFoundCode}</span> koi
            product sathe match nathi thato
          </p>
          <button
            type="button"
            onClick={() =>
              router.push(
                `/products/new?barcode=${encodeURIComponent(notFoundCode)}`
              )
            }
            className="mt-3 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-800"
          >
            Add product with this barcode
          </button>
          <button
            type="button"
            onClick={() => {
              setNotFoundCode(null);
              inputRef.current?.focus();
            }}
            className="mt-2 block w-full py-1 text-sm text-stone-500"
          >
            Dismiss
          </button>
        </div>
      )}

    </div>
  );
}
