"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import type { Category, MovementType, StockRow } from "@/lib/types";

interface LedgerMovement {
  id: string;
  type: MovementType;
  quantity: number;
  reason: string | null;
  created_at: string;
  profiles: { full_name: string } | null;
}

interface LedgerRow extends LedgerMovement {
  change: number;
  balance: number;
}

function signedQty(type: MovementType, quantity: number) {
  if (type === "in") return quantity;
  if (type === "out") return -quantity;
  return quantity; // adjustment (already signed)
}

export default function ReportsPage() {
  const supabase = createClient();

  const [products, setProducts] = useState<StockRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [{ data: stock }, { data: cats }] = await Promise.all([
        supabase.from("current_stock").select("*").order("name"),
        supabase.from("categories").select("*"),
      ]);
      setProducts((stock ?? []) as StockRow[]);
      setCategories((cats ?? []) as Category[]);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categoryName = useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (map.get(id) ?? "") : "");
  }, [categories]);

  // ---------- LEDGER ----------
  useEffect(() => {
    if (!selectedProduct) {
      setLedger([]);
      return;
    }
    async function loadLedger() {
      setLoadingLedger(true);
      const { data } = await supabase
        .from("stock_movements")
        .select("id, type, quantity, reason, created_at, profiles:created_by(full_name)")
        .eq("product_id", selectedProduct)
        .order("created_at", { ascending: true });

      const all = (data ?? []) as unknown as LedgerMovement[];
      const from = fromDate ? new Date(fromDate) : null;
      const to = toDate ? new Date(toDate + "T23:59:59") : null;

      let running = 0;
      let opening = 0;
      const rows: LedgerRow[] = [];

      for (const m of all) {
        const change = signedQty(m.type, m.quantity);
        const date = new Date(m.created_at);
        running += change;

        if (from && date < from) {
          opening = running;
          continue;
        }
        if (to && date > to) continue;
        rows.push({ ...m, change, balance: running });
      }

      setOpeningBalance(from ? opening : 0);
      setLedger(rows);
      setLoadingLedger(false);
    }
    loadLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProduct, fromDate, toDate]);

  // ---------- EXCEL EXPORTS ----------
  function exportStockReport() {
    setExporting("stock");
    const rows = products.map((p) => ({
      "Product": p.name,
      "SKU": p.sku ?? "",
      "Barcode": p.barcode ?? "",
      "Category": categoryName(p.category_id),
      "Stock": p.stock,
      "Unit": p.unit,
      "Min level": p.min_stock_level,
      "Purchase price": Number(p.purchase_price),
      "Selling price": Number(p.selling_price),
      "Stock value": Number(p.stock_value),
      "Status":
        p.stock <= 0 ? "OUT" : p.stock <= p.min_stock_level ? "LOW" : "OK",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 28 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 8 },
      { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 13 }, { wch: 12 }, { wch: 8 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock");
    XLSX.writeFile(wb, `stock-report-${today()}.xlsx`);
    setExporting(null);
  }

  async function exportAllMovements() {
    setExporting("movements");
    let query = supabase
      .from("stock_movements")
      .select(
        "type, quantity, reason, created_at, products(name, unit), profiles:created_by(full_name)"
      )
      .order("created_at", { ascending: false })
      .limit(5000);
    if (fromDate) query = query.gte("created_at", fromDate);
    if (toDate) query = query.lte("created_at", toDate + "T23:59:59");

    const { data } = await query;
    type Row = {
      type: MovementType;
      quantity: number;
      reason: string | null;
      created_at: string;
      products: { name: string; unit: string } | null;
      profiles: { full_name: string } | null;
    };
    const rows = ((data ?? []) as unknown as Row[]).map((m) => ({
      "Date": new Date(m.created_at).toLocaleString("en-IN"),
      "Product": m.products?.name ?? "",
      "Type": m.type,
      "Qty": m.type === "out" ? -m.quantity : m.quantity,
      "Unit": m.products?.unit ?? "",
      "Reason": m.reason ?? "",
      "By": m.profiles?.full_name ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 20 }, { wch: 28 }, { wch: 11 }, { wch: 7 },
      { wch: 7 }, { wch: 24 }, { wch: 18 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Movements");
    XLSX.writeFile(wb, `movements-${today()}.xlsx`);
    setExporting(null);
  }

  function exportLedger() {
    const product = products.find((p) => p.product_id === selectedProduct);
    if (!product) return;
    const rows = ledger.map((r) => ({
      "Date": new Date(r.created_at).toLocaleString("en-IN"),
      "Type": r.type,
      "Change": r.change,
      "Balance": r.balance,
      "Reason": r.reason ?? "",
      "By": r.profiles?.full_name ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 20 }, { wch: 11 }, { wch: 8 }, { wch: 8 }, { wch: 24 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      ws,
      product.name.slice(0, 28).replace(/[\\/?*[\]]/g, "")
    );
    XLSX.writeFile(wb, `ledger-${today()}.xlsx`);
  }

  async function exportSales() {
    setExporting("sales");
    let query = supabase
      .from("sales")
      .select("*, customers(name)")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (fromDate) query = query.gte("created_at", fromDate);
    if (toDate) query = query.lte("created_at", toDate + "T23:59:59");

    const { data } = await query;
    type SaleExportRow = {
      invoice_no: string;
      created_at: string;
      status: string;
      payment_method: string;
      subtotal: number;
      discount: number;
      tax_total: number;
      grand_total: number;
      paid_amount: number;
      customers: { name: string } | null;
    };
    const rows = ((data ?? []) as unknown as SaleExportRow[]).map((s) => ({
      "Invoice": s.invoice_no,
      "Date": new Date(s.created_at).toLocaleString("en-IN"),
      "Customer": s.customers?.name ?? "Walk-in",
      "Subtotal": Number(s.subtotal),
      "GST": Number(s.tax_total),
      "Discount": Number(s.discount),
      "Total": Number(s.grand_total),
      "Paid": Number(s.paid_amount),
      "Due": Number(s.grand_total) - Number(s.paid_amount),
      "Status": s.status,
      "Payment": s.payment_method,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 16 }, { wch: 20 }, { wch: 22 }, { wch: 10 }, { wch: 9 },
      { wch: 9 }, { wch: 10 }, { wch: 10 }, { wch: 9 }, { wch: 8 }, { wch: 8 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sales");
    XLSX.writeFile(wb, `sales-report-${today()}.xlsx`);
    setExporting(null);
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  const input =
    "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600";
  const selected = products.find((p) => p.product_id === selectedProduct);

  return (
    <div>
      <h1 className="text-xl font-semibold text-stone-900">Reports</h1>

      {/* QUICK EXPORTS */}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-stone-900">
            Current stock report
          </h2>
          <p className="mt-1 text-xs text-stone-500">
            Badha products no stock, value ane status (OK/LOW/OUT)
          </p>
          <button
            onClick={exportStockReport}
            disabled={exporting === "stock"}
            className="mt-3 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {exporting === "stock" ? "Exporting..." : "⬇ Download Excel"}
          </button>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-stone-900">
            All movements export
          </h2>
          <p className="mt-1 text-xs text-stone-500">
            Niche date range set karo (optional) ane badhi entries export karo
          </p>
          <button
            onClick={exportAllMovements}
            disabled={exporting === "movements"}
            className="mt-3 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {exporting === "movements" ? "Exporting..." : "⬇ Download Excel"}
          </button>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-stone-900">
            Sales report
          </h2>
          <p className="mt-1 text-xs text-stone-500">
            Badhi invoices — GST, discount, paid/due ane status sathe
          </p>
          <button
            onClick={exportSales}
            disabled={exporting === "sales"}
            className="mt-3 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {exporting === "sales" ? "Exporting..." : "⬇ Download Excel"}
          </button>
        </div>
      </div>

      {/* PRODUCT LEDGER */}
      <section className="mt-4 rounded-2xl border border-stone-200 bg-white">
        <div className="border-b border-stone-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-stone-900">
            Product ledger
          </h2>
        </div>

        <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row">
          <select
            className={`${input} flex-1`}
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
          >
            <option value="">— Select product —</option>
            {products.map((p) => (
              <option key={p.product_id} value={p.product_id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            className={input}
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
          <input
            type="date"
            className={input}
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
          {selectedProduct && ledger.length > 0 && (
            <button
              onClick={exportLedger}
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              ⬇ Excel
            </button>
          )}
        </div>

        {!selectedProduct ? (
          <p className="px-4 py-8 text-center text-sm text-stone-500">
            Ledger jova mate product select karo
          </p>
        ) : loadingLedger ? (
          <p className="px-4 py-8 text-center text-sm text-stone-500">
            Loading...
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-stone-100 bg-stone-50 text-left text-xs text-stone-500">
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 text-right font-medium">Change</th>
                  <th className="px-4 py-2 text-right font-medium">Balance</th>
                  <th className="hidden px-4 py-2 font-medium sm:table-cell">
                    Reason / By
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {fromDate && (
                  <tr className="bg-stone-50/60 text-xs text-stone-500">
                    <td className="px-4 py-2" colSpan={3}>
                      Opening balance ({fromDate})
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">
                      {openingBalance}
                    </td>
                    <td className="hidden sm:table-cell" />
                  </tr>
                )}
                {ledger.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-stone-700">
                      {new Date(r.created_at).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-4 py-2 capitalize text-stone-700">
                      {r.type}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-medium ${
                        r.change >= 0 ? "text-emerald-700" : "text-amber-700"
                      }`}
                    >
                      {r.change > 0 ? "+" : ""}
                      {r.change}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-stone-900">
                      {r.balance}
                    </td>
                    <td className="hidden px-4 py-2 text-xs text-stone-500 sm:table-cell">
                      {[r.reason, r.profiles?.full_name]
                        .filter(Boolean)
                        .join(" · ")}
                    </td>
                  </tr>
                ))}
                {ledger.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center text-sm text-stone-500"
                    >
                      Aa range ma koi entry nathi
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {selected && (
              <p className="border-t border-stone-100 px-4 py-2 text-right text-xs text-stone-500">
                Current stock: <b>{selected.stock} {selected.unit}</b>
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
