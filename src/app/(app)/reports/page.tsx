"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/mongodb/client";
import type {
  Category,
  MovementType,
  PurchaseOrder,
  PurchaseOrderItem,
  Sale,
  SaleItem,
  StockRow,
} from "@/lib/types";
import { indiaDateKey } from "@/lib/date";
import { PageHeader, useToast } from "@/components/DashboardUI";

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
  const { showToast } = useToast();

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
      const [stockResult, categoryResult] = await Promise.all([
        supabase.from("current_stock").select("*").order("name"),
        supabase.from("categories").select("*"),
      ]);
      const loadError = stockResult.error ?? categoryResult.error;
      if (loadError) showToast(loadError.message, "error");
      setProducts((stockResult.data ?? []) as StockRow[]);
      setCategories((categoryResult.data ?? []) as Category[]);
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
      const { data, error } = await supabase
        .from("stock_movements")
        .select("id, type, quantity, reason, created_at, profiles:created_by(full_name)")
        .eq("product_id", selectedProduct)
        .order("created_at", { ascending: true });

      if (error) {
        showToast(error.message, "error");
        setLoadingLedger(false);
        return;
      }
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

    const { data, error } = await query;
    if (error) {
      showToast(error.message, "error");
      setExporting(null);
      return;
    }
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

    const { data, error } = await query;
    if (error) {
      showToast(error.message, "error");
      setExporting(null);
      return;
    }
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
      id: string;
      customers: { name: string } | null;
    };
    const saleRows = (data ?? []) as unknown as SaleExportRow[];
    const returnResult =
      saleRows.length > 0
        ? await supabase
            .from("sale_returns")
            .select("sale_id, total")
            .in("sale_id", saleRows.map((sale) => sale.id))
        : { data: [], error: null };
    if (returnResult.error) {
      showToast(returnResult.error.message, "error");
      setExporting(null);
      return;
    }
    const returnsBySale = new Map<string, number>();
    for (const returnRow of returnResult.data ?? []) {
      const saleId = String(returnRow.sale_id);
      returnsBySale.set(
        saleId,
        (returnsBySale.get(saleId) ?? 0) + Number(returnRow.total)
      );
    }
    const rows = saleRows.map((s) => {
      const returned = returnsBySale.get(s.id) ?? 0;
      const netTotal = Math.max(0, Number(s.grand_total) - returned);
      return {
      "Invoice": s.invoice_no,
      "Date": new Date(s.created_at).toLocaleString("en-IN"),
      "Customer": s.customers?.name ?? "Walk-in",
      "Subtotal": Number(s.subtotal),
      "GST": Number(s.tax_total),
      "Discount": Number(s.discount),
      "Total": Number(s.grand_total),
      "Returns": returned,
      "Net total": netTotal,
      "Paid": Number(s.paid_amount),
      "Due": Math.max(0, netTotal - Number(s.paid_amount)),
      "Status": s.status,
      "Payment": s.payment_method,
      };
    });
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

  async function exportPurchases() {
    setExporting("purchases");
    let query = supabase
      .from("purchase_orders")
      .select("*, suppliers(name)")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (fromDate) query = query.gte("created_at", fromDate);
    if (toDate) query = query.lte("created_at", toDate + "T23:59:59");

    const { data, error } = await query;
    if (error) {
      showToast(error.message, "error");
      setExporting(null);
      return;
    }
    type PurchaseExportRow = PurchaseOrder & {
      suppliers: { name: string } | null;
    };
    const rows = ((data ?? []) as PurchaseExportRow[]).map((p) => ({
      "PO": p.po_no,
      "Date": new Date(p.created_at).toLocaleString("en-IN"),
      "Supplier": p.suppliers?.name ?? "",
      "Total": Number(p.total),
      "Status": p.status,
      "Received at": p.received_at
        ? new Date(p.received_at).toLocaleString("en-IN")
        : "",
      "Note": p.note ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 16 }, { wch: 20 }, { wch: 24 }, { wch: 11 },
      { wch: 10 }, { wch: 20 }, { wch: 28 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Purchases");
    XLSX.writeFile(wb, `purchase-report-${today()}.xlsx`);
    setExporting(null);
  }

  async function exportSaleItems() {
    setExporting("sale-items");
    let salesQuery = supabase
      .from("sales")
      .select("*, customers(name)")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (fromDate) salesQuery = salesQuery.gte("created_at", fromDate);
    if (toDate) salesQuery = salesQuery.lte("created_at", toDate + "T23:59:59");

    const { data: salesData, error: salesError } = await salesQuery;
    if (salesError) {
      showToast(salesError.message, "error");
      setExporting(null);
      return;
    }
    type SaleWithCustomer = Sale & { customers: { name: string } | null };
    const sales = (salesData ?? []) as SaleWithCustomer[];
    const saleIds = sales.map((s) => s.id);
    const { data: itemsData, error: itemsError } =
      saleIds.length > 0
        ? await supabase
            .from("sale_items")
            .select("*")
            .in("sale_id", saleIds)
            .limit(10000)
        : { data: [], error: null };
    if (itemsError) {
      showToast(itemsError.message, "error");
      setExporting(null);
      return;
    }
    const saleMap = new Map(sales.map((s) => [s.id, s]));
    type SaleItemRow = SaleItem & { cost?: number };
    const rows = ((itemsData ?? []) as SaleItemRow[]).map((it) => {
      const sale = saleMap.get(it.sale_id);
      const cost = Number(it.cost ?? 0);
      const quantity = Number(it.quantity);
      return {
        "Date": sale ? new Date(sale.created_at).toLocaleString("en-IN") : "",
        "Invoice": sale?.invoice_no ?? "",
        "Customer": sale?.customers?.name ?? "Walk-in",
        "Item": it.product_name,
        "Qty": quantity,
        "Unit": it.unit,
        "Rate": Number(it.price),
        "Line total": Number(it.line_total),
        "GST %": Number(it.gst_rate),
        "Cost": cost,
        "Gross margin": Number(it.line_total) - quantity * cost,
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 20 }, { wch: 16 }, { wch: 22 }, { wch: 28 }, { wch: 8 },
      { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 10 }, { wch: 10 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sale items");
    XLSX.writeFile(wb, `sale-items-${today()}.xlsx`);
    setExporting(null);
  }

  async function exportPurchaseItems() {
    setExporting("purchase-items");
    let purchasesQuery = supabase
      .from("purchase_orders")
      .select("*, suppliers(name)")
      .order("created_at", { ascending: false })
      .limit(5000);
    if (fromDate) purchasesQuery = purchasesQuery.gte("created_at", fromDate);
    if (toDate) purchasesQuery = purchasesQuery.lte("created_at", toDate + "T23:59:59");

    const { data: purchasesData, error: purchasesError } = await purchasesQuery;
    if (purchasesError) {
      showToast(purchasesError.message, "error");
      setExporting(null);
      return;
    }
    type PurchaseWithSupplier = PurchaseOrder & {
      suppliers: { name: string } | null;
    };
    const purchases = (purchasesData ?? []) as PurchaseWithSupplier[];
    const poIds = purchases.map((p) => p.id);
    const { data: itemsData, error: itemsError } =
      poIds.length > 0
        ? await supabase
            .from("purchase_order_items")
            .select("*")
            .in("po_id", poIds)
            .limit(10000)
        : { data: [], error: null };
    if (itemsError) {
      showToast(itemsError.message, "error");
      setExporting(null);
      return;
    }
    const purchaseMap = new Map(purchases.map((p) => [p.id, p]));
    const rows = ((itemsData ?? []) as PurchaseOrderItem[]).map((it) => {
      const purchase = purchaseMap.get(it.po_id);
      return {
        "Date": purchase
          ? new Date(purchase.created_at).toLocaleString("en-IN")
          : "",
        "PO": purchase?.po_no ?? "",
        "Supplier": purchase?.suppliers?.name ?? "",
        "Status": purchase?.status ?? "",
        "Item": it.product_name,
        "Qty": Number(it.quantity),
        "Unit": it.unit,
        "Cost": Number(it.cost),
        "Line total": Number(it.line_total),
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 20 }, { wch: 16 }, { wch: 24 }, { wch: 10 }, { wch: 28 },
      { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Purchase items");
    XLSX.writeFile(wb, `purchase-items-${today()}.xlsx`);
    setExporting(null);
  }

  function today() {
    return indiaDateKey();
  }

  const input =
    "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600";
  const selected = products.find((p) => p.product_id === selectedProduct);
  const exportOptions = [
    {
      id: "stock",
      title: "Current stock",
      description: "Quantity, value, and low/out status",
      action: exportStockReport,
    },
    {
      id: "movements",
      title: "All movements",
      description: "Stock entries within the optional date range",
      action: exportAllMovements,
    },
    {
      id: "sales",
      title: "Sales summary",
      description: "Invoices, GST, discounts, paid amounts, and dues",
      action: exportSales,
    },
    {
      id: "purchases",
      title: "Purchase summary",
      description: "Supplier totals, statuses, and received dates",
      action: exportPurchases,
    },
    {
      id: "sale-items",
      title: "Sales by item",
      description: "Invoice lines, quantities, rates, GST, and gross margin",
      action: exportSaleItems,
    },
    {
      id: "purchase-items",
      title: "Purchases by item",
      description: "PO lines, supplier, quantity, cost, and total",
      action: exportPurchaseItems,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Export operational records or inspect a product stock ledger"
      />

      {/* QUICK EXPORTS */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {exportOptions.map((option) => (
          <div key={option.id} className="flex min-h-32 flex-col rounded-lg border border-stone-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-stone-950">{option.title}</h2>
            <p className="mt-1 flex-1 text-xs leading-5 text-stone-500">{option.description}</p>
            <button
              type="button"
              onClick={option.action}
              disabled={exporting !== null}
              className="mt-3 self-start rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            >
              {exporting === option.id ? "Exporting..." : "Download Excel"}
            </button>
          </div>
        ))}
      </div>

      {/* PRODUCT LEDGER */}
      <section className="mt-4 rounded-lg border border-stone-200 bg-white">
        <div className="border-b border-stone-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-stone-900">
            Product ledger
          </h2>
        </div>

        <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row">
          <label className="flex-1">
            <span className="sr-only">Ledger product</span>
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
          </label>
          <label>
            <span className="sr-only">Ledger start date</span>
            <input
            type="date"
            className={input}
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            />
          </label>
          <label>
            <span className="sr-only">Ledger end date</span>
            <input
            type="date"
            className={input}
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            />
          </label>
          {selectedProduct && ledger.length > 0 && (
            <button
              type="button"
              onClick={exportLedger}
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              Download
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
