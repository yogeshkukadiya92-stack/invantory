import { createClient } from "@/lib/mongodb/server";
import { DashboardProductSearch } from "@/components/DashboardProductSearch";
import { ShareLowStockButton } from "@/components/ShareLowStockButton";
import type { BatchStockRow, StockRow } from "@/lib/types";
import Link from "next/link";
import { indiaStartOfDayIso } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();

  const today = indiaStartOfDayIso();
  const [
    stockResult,
    lowStockResult,
    movementResult,
    salesResult,
    returnsResult,
    expiringResult,
  ] = await Promise.all([
    supabase.from("current_stock").select("*").eq("is_active", true),
    supabase.from("low_stock").select("*", { count: "exact" }).limit(10),
    supabase
      .from("stock_movements")
      .select("id, type, quantity, created_at, products(name)")
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("sales").select("grand_total").gte("created_at", today),
    supabase.from("sale_returns").select("total").gte("created_at", today),
    supabase
      .from("expiring_stock")
      .select("*")
      .order("expiry_date")
      .limit(10),
  ]);
  const stockRows = stockResult.data;
  const lowStock = lowStockResult.data;
  const recentMovements = movementResult.data;
  const todaySales = salesResult.data;
  const todayReturns = returnsResult.data;
  const expiring = expiringResult.data;
  const loadError =
    stockResult.error ??
    lowStockResult.error ??
    movementResult.error ??
    salesResult.error ??
    returnsResult.error ??
    expiringResult.error;
  const expiringRows = (expiring ?? []) as BatchStockRow[];

  const rows = (stockRows ?? []) as StockRow[];
  const totalProducts = rows.length;
  const totalValue = rows.reduce((sum, r) => sum + Number(r.stock_value), 0);
  const lowCount = lowStockResult.count ?? lowStock?.length ?? 0;
  const todayTotal =
    ((todaySales ?? []) as { grand_total: number }[]).reduce(
      (sum, sale) => sum + Number(sale.grand_total),
      0
    ) -
    ((todayReturns ?? []) as { total: number }[]).reduce(
      (sum, saleReturn) => sum + Number(saleReturn.total),
      0
    );
  const recentMovementRows = (recentMovements ?? []) as {
    created_at: string;
    id: string;
    products: { name: string } | null;
    quantity: number;
    type: "in" | "out" | "adjustment";
  }[];

  const stats = [
    {
      label: "Today's sales",
      value:
        "₹" + todayTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 }),
    },
    { label: "Products", value: totalProducts.toLocaleString("en-IN") },
    {
      label: "Stock value",
      value: "₹" + totalValue.toLocaleString("en-IN", { maximumFractionDigits: 0 }),
    },
    { label: "Low stock items", value: String(lowCount), alert: lowCount > 0 },
  ];

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-950">Dashboard</h1>
          <p className="mt-1 text-sm text-stone-500">Today&apos;s sales, stock health, and recent movement</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/purchases/new" className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50">New purchase</Link>
          <Link href="/sales/new" className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800">New sale</Link>
        </div>
      </div>

      {loadError && (
        <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Dashboard data load nathi thayu: {loadError.message}
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className={`rounded-lg border bg-white p-4 ${
              s.alert ? "border-red-300" : "border-stone-200"
            }`}
          >
            <p className="text-sm text-stone-500">{s.label}</p>
            <p
              className={`mt-1 text-2xl font-semibold ${
                s.alert ? "text-red-600" : "text-stone-900"
              }`}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <DashboardProductSearch products={rows} />

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Low stock list */}
        <section className="rounded-lg border border-stone-200 bg-white">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-stone-900">
              Low stock alerts
            </h2>
            <ShareLowStockButton
              items={((lowStock ?? []) as StockRow[]).map((i) => ({
                name: i.name,
                stock: i.stock,
                unit: i.unit,
                min_stock_level: i.min_stock_level,
              }))}
            />
          </div>
          {lowCount === 0 ? (
            <p className="px-4 py-6 text-sm text-stone-500">
              All good — nothing below minimum level.
            </p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {(lowStock as StockRow[]).map((item) => (
                <li
                  key={item.product_id}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-stone-900">
                      {item.name}
                    </p>
                    <p className="text-xs text-stone-500">
                      Min level: {item.min_stock_level} {item.unit}
                    </p>
                  </div>
                  <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                    {item.stock} left
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Expiring soon */}
        {expiringRows.length > 0 && (
          <section className="rounded-lg border border-amber-300 bg-white">
            <div className="border-b border-stone-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-stone-900">
                Expiring soon (60 days)
              </h2>
            </div>
            <ul className="divide-y divide-stone-100">
              {expiringRows.map((item) => {
                const expired =
                  item.expiry_date !== null &&
                  new Date(item.expiry_date) < new Date();
                return (
                  <li
                    key={`${item.batch_id}-${item.location_id}`}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-stone-900">
                        {item.product_name}
                      </p>
                      <p className="text-xs text-stone-500">
                        Batch {item.batch_no} · {item.location_name} ·{" "}
                        {item.stock} {item.unit}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        expired
                          ? "bg-red-50 text-red-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {expired ? "EXPIRED · " : ""}
                      {item.expiry_date
                        ? new Date(item.expiry_date).toLocaleDateString(
                            "en-IN",
                            { day: "numeric", month: "short", year: "2-digit" }
                          )
                        : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Recent movements */}
        <section className="rounded-lg border border-stone-200 bg-white">
          <div className="border-b border-stone-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-stone-900">
              Recent activity
            </h2>
          </div>
          {recentMovementRows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-stone-500">
              No stock entries yet. Add a product and record your first
              stock-in.
            </p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {recentMovementRows.map((m) => {
                const productName =
                  (m.products as unknown as { name: string } | null)?.name ??
                  "Unknown product";
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
                    <div>
                      <p className="text-sm font-medium text-stone-900">
                        {productName}
                      </p>
                      <p className="text-xs text-stone-500">
                        {new Date(m.created_at).toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badge}`}
                    >
                      {label}{" "}
                      {Math.abs(m.quantity)}
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
