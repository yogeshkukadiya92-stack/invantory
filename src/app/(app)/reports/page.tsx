"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import type { Category, MovementType, PurchaseOrder, StockRow } from "@/lib/types";

interface MovementRow {
  id: string;
  product_id: string;
  type: MovementType;
  quantity: number;
  reason: string | null;
  created_at: string;
  products: { name: string; unit: string } | null;
  profiles: { full_name: string } | null;
}

interface ReportCardProps {
  label: string;
  value: string;
  detail: string;
  tone?: "emerald" | "amber" | "rose" | "slate" | "cyan";
}

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat("en-IN");

function today() {
  return new Date().toISOString().slice(0, 10);
}

function inRange(dateValue: string, fromDate: string, toDate: string) {
  const time = new Date(dateValue).getTime();
  if (fromDate && time < new Date(fromDate).getTime()) return false;
  if (toDate && time > new Date(`${toDate}T23:59:59`).getTime()) return false;
  return true;
}

function signedQty(type: MovementType, quantity: number) {
  if (type === "in") return quantity;
  if (type === "out") return -quantity;
  return quantity;
}

function ReportCard({ label, value, detail, tone = "slate" }: ReportCardProps) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    rose: "bg-rose-50 text-rose-700 ring-rose-100",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
    cyan: "bg-cyan-50 text-cyan-700 ring-cyan-100",
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-bold text-slate-500">{label}</p>
        <span className={`h-2.5 w-2.5 rounded-full ring-4 ${tones[tone]}`} />
      </div>
      <p className="mt-4 text-3xl font-black tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-xs font-semibold text-slate-500">{detail}</p>
    </section>
  );
}

function downloadSheet(fileName: string, sheetName: string, rows: Record<string, string | number>[]) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = Object.keys(rows[0] ?? { Report: "" }).map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, `${fileName}-${today()}.xlsx`);
}

export default function ReportsPage() {
  const [products, setProducts] = useState<StockRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [productsRes, categoriesRes, movementsRes, purchasesRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/categories"),
      fetch("/api/stock/movements"),
      fetch("/api/purchases"),
    ]);
    const [{ data: productData }, { data: categoryData }, { data: movementData }, { data: purchaseData }] =
      await Promise.all([
        productsRes.json(),
        categoriesRes.json(),
        movementsRes.json(),
        purchasesRes.json(),
      ]);
    setProducts((productData ?? []) as StockRow[]);
    setCategories((categoryData ?? []) as Category[]);
    setMovements((movementData ?? []) as MovementRow[]);
    setPurchases((purchaseData ?? []) as PurchaseOrder[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const productById = useMemo(
    () => new Map(products.map((product) => [product.product_id, product])),
    [products]
  );

  const categoryName = useMemo(() => {
    const map = new Map(categories.map((category) => [category.id, category.name]));
    return (id: string | null) => (id ? map.get(id) ?? "" : "");
  }, [categories]);

  const filteredMovements = useMemo(
    () =>
      movements.filter(
        (movement) =>
          inRange(movement.created_at, fromDate, toDate) &&
          (!selectedProduct || movement.product_id === selectedProduct)
      ),
    [fromDate, movements, selectedProduct, toDate]
  );

  const filteredPurchases = useMemo(
    () =>
      purchases.filter(
        (purchase) =>
          inRange(purchase.created_at, fromDate, toDate) &&
          (!selectedProduct || purchase.product_id === selectedProduct)
      ),
    [fromDate, purchases, selectedProduct, toDate]
  );

  const salesRows = useMemo(
    () => filteredMovements.filter((movement) => movement.type === "out"),
    [filteredMovements]
  );

  const saleByItem = useMemo(() => {
    const rows = new Map<
      string,
      {
        product: string;
        sku: string;
        unit: string;
        quantity: number;
        gross_sales: number;
        cost: number;
        profit: number;
      }
    >();

    for (const sale of salesRows) {
      const product = productById.get(sale.product_id);
      const current = rows.get(sale.product_id) ?? {
        product: sale.products?.name ?? product?.name ?? "Unknown product",
        sku: product?.sku ?? "",
        unit: sale.products?.unit ?? product?.unit ?? "",
        quantity: 0,
        gross_sales: 0,
        cost: 0,
        profit: 0,
      };
      const gross = sale.quantity * Number(product?.selling_price ?? 0);
      const cost = sale.quantity * Number(product?.purchase_price ?? 0);
      current.quantity += sale.quantity;
      current.gross_sales += gross;
      current.cost += cost;
      current.profit += gross - cost;
      rows.set(sale.product_id, current);
    }

    return [...rows.values()].sort((a, b) => b.gross_sales - a.gross_sales);
  }, [productById, salesRows]);

  const ledgerRows = useMemo(() => {
    if (!selectedProduct) return [];
    let balance = 0;
    return movements
      .filter((movement) => movement.product_id === selectedProduct)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((movement) => {
        const change = signedQty(movement.type, movement.quantity);
        balance += change;
        return { ...movement, change, balance };
      })
      .filter((movement) => inRange(movement.created_at, fromDate, toDate));
  }, [fromDate, movements, selectedProduct, toDate]);

  const lowStockRows = products.filter((product) => product.stock <= product.min_stock_level);
  const totalStockValue = products.reduce((sum, product) => sum + Number(product.stock_value), 0);
  const totalPurchaseValue = filteredPurchases.reduce(
    (sum, purchase) => sum + purchase.quantity * purchase.unit_cost,
    0
  );
  const totalSalesQty = salesRows.reduce((sum, sale) => sum + sale.quantity, 0);
  const totalSalesValue = saleByItem.reduce((sum, row) => sum + row.gross_sales, 0);
  const totalProfit = saleByItem.reduce((sum, row) => sum + row.profit, 0);

  const stockExportRows = products.map((product) => ({
    Product: product.name,
    SKU: product.sku ?? "",
    Barcode: product.barcode ?? "",
    Category: categoryName(product.category_id),
    Stock: product.stock,
    Unit: product.unit,
    "Min level": product.min_stock_level,
    "Purchase price": Number(product.purchase_price),
    "Selling price": Number(product.selling_price),
    "Stock value": Number(product.stock_value),
    Status: product.stock <= 0 ? "OUT" : product.stock <= product.min_stock_level ? "LOW" : "OK",
  }));

  const purchaseExportRows = filteredPurchases.map((purchase) => ({
    Date: new Date(purchase.created_at).toLocaleString("en-IN"),
    Product: purchase.products?.name ?? productById.get(purchase.product_id)?.name ?? "",
    Supplier: purchase.suppliers?.name ?? "Direct",
    Reference: purchase.reference ?? "",
    Quantity: purchase.quantity,
    Unit: purchase.products?.unit ?? productById.get(purchase.product_id)?.unit ?? "",
    "Unit cost": purchase.unit_cost,
    Total: purchase.quantity * purchase.unit_cost,
    Note: purchase.note ?? "",
  }));

  const salesExportRows = salesRows.map((sale) => {
    const product = productById.get(sale.product_id);
    const gross = sale.quantity * Number(product?.selling_price ?? 0);
    const cost = sale.quantity * Number(product?.purchase_price ?? 0);
    return {
      Date: new Date(sale.created_at).toLocaleString("en-IN"),
      Product: sale.products?.name ?? product?.name ?? "",
      SKU: product?.sku ?? "",
      Quantity: sale.quantity,
      Unit: sale.products?.unit ?? product?.unit ?? "",
      "Selling price": Number(product?.selling_price ?? 0),
      "Gross sales": gross,
      Cost: cost,
      Profit: gross - cost,
      Reason: sale.reason ?? "",
      By: sale.profiles?.full_name ?? "",
    };
  });

  const saleByItemExportRows = saleByItem.map((row) => ({
    Product: row.product,
    SKU: row.sku,
    Quantity: row.quantity,
    Unit: row.unit,
    "Gross sales": row.gross_sales,
    Cost: row.cost,
    Profit: row.profit,
  }));

  const movementExportRows = filteredMovements.map((movement) => ({
    Date: new Date(movement.created_at).toLocaleString("en-IN"),
    Product: movement.products?.name ?? productById.get(movement.product_id)?.name ?? "",
    Type: movement.type,
    Change: signedQty(movement.type, movement.quantity),
    Unit: movement.products?.unit ?? productById.get(movement.product_id)?.unit ?? "",
    Reason: movement.reason ?? "",
    By: movement.profiles?.full_name ?? "",
  }));

  function exportWorkbook() {
    setExporting("all");
    const workbook = XLSX.utils.book_new();
    const sheets: Array<[string, Record<string, string | number>[]]> = [
      ["Stock Valuation", stockExportRows],
      ["Purchases", purchaseExportRows],
      ["Sales", salesExportRows],
      ["Sales By Item", saleByItemExportRows],
      ["Low Stock", stockExportRows.filter((row) => row.Status !== "OK")],
      ["Movements", movementExportRows],
    ];

    for (const [name, rows] of sheets) {
      const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Report: "No data" }]);
      XLSX.utils.book_append_sheet(workbook, sheet, name);
    }
    XLSX.writeFile(workbook, `inventory-all-reports-${today()}.xlsx`);
    setExporting(null);
  }

  const selected = products.find((product) => product.product_id === selectedProduct);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:p-7">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-emerald-700">Business intelligence</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 lg:text-3xl">Reports</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Generate purchase, sales, sales by item, stock, low-stock, and movement reports.
            </p>
          </div>
          <button
            onClick={exportWorkbook}
            disabled={exporting === "all" || loading}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-50"
          >
            {exporting === "all" ? "Generating..." : "Download all reports"}
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_170px_170px]">
          <select
            className="w-full rounded-xl border px-3 py-2 text-sm"
            value={selectedProduct}
            onChange={(event) => setSelectedProduct(event.target.value)}
          >
            <option value="">All products</option>
            {products.map((product) => (
              <option key={product.product_id} value={product.product_id}>
                {product.name}
              </option>
            ))}
          </select>
          <input className="w-full rounded-xl border px-3 py-2 text-sm" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          <input className="w-full rounded-xl border px-3 py-2 text-sm" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ReportCard label="Purchase value" value={currency.format(totalPurchaseValue)} detail={`${number.format(filteredPurchases.length)} purchase entries`} tone="emerald" />
        <ReportCard label="Sales value" value={currency.format(totalSalesValue)} detail={`${number.format(totalSalesQty)} units sold / stock out`} tone="cyan" />
        <ReportCard label="Estimated profit" value={currency.format(totalProfit)} detail="Based on product selling and purchase price" tone={totalProfit >= 0 ? "emerald" : "rose"} />
        <ReportCard label="Stock value" value={currency.format(totalStockValue)} detail={`${number.format(lowStockRows.length)} low-stock products`} tone="slate" />
      </div>

      {loading ? (
        <p className="rounded-3xl border border-slate-200 bg-white px-5 py-12 text-center text-sm font-semibold text-slate-500 shadow-sm">
          Loading reports...
        </p>
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-2">
            <ReportTable
              title="Purchase report"
              subtitle="Supplier stock received in selected range."
              actionLabel="Export purchases"
              onExport={() => downloadSheet("purchase-report", "Purchases", purchaseExportRows)}
              emptyText="No purchases found."
              headers={["Date", "Product", "Supplier", "Qty", "Total"]}
              rows={filteredPurchases.slice(0, 10).map((purchase) => [
                new Date(purchase.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
                purchase.products?.name ?? productById.get(purchase.product_id)?.name ?? "Unknown",
                purchase.suppliers?.name ?? "Direct",
                `${purchase.quantity} ${purchase.products?.unit ?? ""}`,
                currency.format(purchase.quantity * purchase.unit_cost),
              ])}
            />

            <ReportTable
              title="Sales report"
              subtitle="Stock-out entries treated as sales movement."
              actionLabel="Export sales"
              onExport={() => downloadSheet("sales-report", "Sales", salesExportRows)}
              emptyText="No sales or stock-out entries found."
              headers={["Date", "Product", "Qty", "Sales", "Profit"]}
              rows={salesExportRows.slice(0, 10).map((sale) => [
                String(sale.Date).split(",")[0],
                String(sale.Product),
                `${sale.Quantity} ${sale.Unit}`,
                currency.format(Number(sale["Gross sales"])),
                currency.format(Number(sale.Profit)),
              ])}
            />
          </div>

          <ReportTable
            title="Sales by item"
            subtitle="Aggregated item performance for the selected date range."
            actionLabel="Export sales by item"
            onExport={() => downloadSheet("sales-by-item", "Sales By Item", saleByItemExportRows)}
            emptyText="No item sales found."
            headers={["Product", "SKU", "Qty", "Gross sales", "Profit"]}
            rows={saleByItem.slice(0, 12).map((item) => [
              item.product,
              item.sku || "-",
              `${item.quantity} ${item.unit}`,
              currency.format(item.gross_sales),
              currency.format(item.profit),
            ])}
          />

          <div className="grid gap-6 xl:grid-cols-2">
            <ReportTable
              title="Stock valuation"
              subtitle="Current inventory quantity and value."
              actionLabel="Export stock"
              onExport={() => downloadSheet("stock-valuation", "Stock Valuation", stockExportRows)}
              emptyText="No stock found."
              headers={["Product", "Category", "Stock", "Value", "Status"]}
              rows={stockExportRows.slice(0, 10).map((stock) => [
                String(stock.Product),
                String(stock.Category || "-"),
                `${stock.Stock} ${stock.Unit}`,
                currency.format(Number(stock["Stock value"])),
                String(stock.Status),
              ])}
            />

            <ReportTable
              title="Low stock report"
              subtitle="Products that need reorder or attention."
              actionLabel="Export low stock"
              onExport={() => downloadSheet("low-stock-report", "Low Stock", stockExportRows.filter((row) => row.Status !== "OK"))}
              emptyText="No low-stock products."
              headers={["Product", "Stock", "Min", "Status", "Value"]}
              rows={lowStockRows.slice(0, 10).map((product) => [
                product.name,
                `${product.stock} ${product.unit}`,
                String(product.min_stock_level),
                product.stock <= 0 ? "OUT" : "LOW",
                currency.format(product.stock_value),
              ])}
            />
          </div>

          <ReportTable
            title="All movement report"
            subtitle="Complete ledger of stock in, stock out, and adjustments."
            actionLabel="Export movements"
            onExport={() => downloadSheet("movement-report", "Movements", movementExportRows)}
            emptyText="No movements found."
            headers={["Date", "Product", "Type", "Change", "Reason"]}
            rows={movementExportRows.slice(0, 12).map((movement) => [
              String(movement.Date).split(",")[0],
              String(movement.Product),
              String(movement.Type),
              String(movement.Change),
              String(movement.Reason || "-"),
            ])}
          />

          <ReportTable
            title="Product ledger"
            subtitle={selected ? `Running balance for ${selected.name}` : "Select a product above to generate item ledger."}
            actionLabel="Export ledger"
            onExport={() =>
              downloadSheet(
                "product-ledger",
                "Product Ledger",
                ledgerRows.map((row) => ({
                  Date: new Date(row.created_at).toLocaleString("en-IN"),
                  Product: row.products?.name ?? selected?.name ?? "",
                  Type: row.type,
                  Change: row.change,
                  Balance: row.balance,
                  Reason: row.reason ?? "",
                  By: row.profiles?.full_name ?? "",
                }))
              )
            }
            emptyText={selectedProduct ? "No ledger entries found." : "Select a product to see ledger."}
            headers={["Date", "Type", "Change", "Balance", "Reason"]}
            rows={ledgerRows.slice(0, 12).map((row) => [
              new Date(row.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
              row.type,
              String(row.change),
              String(row.balance),
              row.reason ?? "-",
            ])}
          />
        </>
      )}
    </div>
  );
}

function ReportTable({
  title,
  subtitle,
  actionLabel,
  onExport,
  emptyText,
  headers,
  rows,
}: {
  title: string;
  subtitle: string;
  actionLabel: string;
  onExport: () => void;
  emptyText: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-black text-slate-950">{title}</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">{subtitle}</p>
        </div>
        <button
          onClick={onExport}
          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"
        >
          {actionLabel}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm font-semibold text-slate-500">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-black uppercase tracking-[0.08em] text-slate-400">
                {headers.map((header) => (
                  <th key={header} className="px-5 py-3">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, index) => (
                <tr key={`${title}-${index}`} className="hover:bg-slate-50/70">
                  {row.map((cell, cellIndex) => (
                    <td key={`${title}-${index}-${cellIndex}`} className="max-w-[260px] truncate px-5 py-4 font-semibold text-slate-700">
                      {String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
