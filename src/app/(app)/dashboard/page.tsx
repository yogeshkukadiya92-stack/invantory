import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { StockRow } from "@/lib/types";

export const dynamic = "force-dynamic";

type RecentMovement = {
  id: string;
  type: "in" | "out" | "adjustment";
  quantity: number;
  created_at: string;
  products: { name: string } | { name: string }[] | null;
};

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const number = new Intl.NumberFormat("en-IN");

function productName(products: RecentMovement["products"]) {
  if (Array.isArray(products)) return products[0]?.name ?? "Unknown product";
  return products?.name ?? "Unknown product";
}

function movementTone(type: RecentMovement["type"]) {
  if (type === "in") {
    return {
      label: "Stock in",
      sign: "+",
      className: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    };
  }
  if (type === "out") {
    return {
      label: "Stock out",
      sign: "-",
      className: "bg-amber-50 text-amber-700 ring-amber-100",
    };
  }
  return {
    label: "Adjusted",
    sign: "",
    className: "bg-slate-100 text-slate-700 ring-slate-200",
  };
}

function MetricCard({
  label,
  value,
  detail,
  tone = "emerald",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "emerald" | "amber" | "rose" | "slate";
}) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    rose: "bg-rose-50 text-rose-700 ring-rose-100",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-slate-500">{label}</p>
        <span className={`h-2.5 w-2.5 rounded-full ring-4 ${tones[tone]}`} />
      </div>
      <p className="mt-4 text-3xl font-black tracking-tight text-slate-950">
        {value}
      </p>
      <p className="mt-2 text-xs font-medium text-slate-500">{detail}</p>
    </section>
  );
}

function MiniChart({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);

  return (
    <div className="flex h-52 items-end gap-3 rounded-2xl bg-slate-50 p-5">
      {values.map((value, index) => {
        const height = Math.max(16, Math.round((value / max) * 150));
        const active = index === values.length - 1;
        return (
          <div key={`${value}-${index}`} className="flex flex-1 flex-col items-center gap-3">
            <div
              className={`w-full rounded-t-xl transition-all ${
                active ? "bg-emerald-500" : "bg-slate-300"
              }`}
              style={{ height }}
            />
            <span className="text-[11px] font-semibold text-slate-400">
              D{index + 1}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ data: stockRows }, { data: lowStock }, { data: recentMovements }] =
    await Promise.all([
      supabase.from("current_stock").select("*").eq("is_active", true),
      supabase.from("low_stock").select("*").limit(8),
      supabase
        .from("stock_movements")
        .select("id, type, quantity, created_at, products(name)")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  const rows = (stockRows ?? []) as StockRow[];
  const movements = (recentMovements ?? []) as RecentMovement[];
  const lowRows = (lowStock ?? []) as StockRow[];
  const totalProducts = rows.length;
  const totalUnits = rows.reduce((sum, row) => sum + row.stock, 0);
  const totalValue = rows.reduce((sum, row) => sum + Number(row.stock_value), 0);
  const lowCount = lowRows.length;
  const outOfStock = rows.filter((row) => row.stock <= 0).length;
  const healthyItems = Math.max(totalProducts - lowCount - outOfStock, 0);
  const averageValue = totalProducts > 0 ? totalValue / totalProducts : 0;
  const topProducts = [...rows]
    .sort((a, b) => Number(b.stock_value) - Number(a.stock_value))
    .slice(0, 5);
  const recentQuantity = movements.reduce(
    (sum, movement) => sum + Math.abs(movement.quantity),
    0
  );
  const chartSeed = movements
    .slice(0, 7)
    .map((movement) => Math.abs(movement.quantity))
    .reverse();
  const chartValues =
    chartSeed.length > 0 ? chartSeed : [12, 18, 10, 22, 16, 26, 20];
  const today = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-5 lg:px-7">
          <div className="grid gap-4 xl:grid-cols-[minmax(220px,0.8fr)_minmax(320px,1fr)_auto] xl:items-center">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-950 lg:text-3xl">
                Dashboard
              </h1>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Live stock position, alerts, and movement intelligence.
              </p>
            </div>
            <div className="hidden h-11 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-400 shadow-inner xl:flex">
              <svg
                aria-hidden="true"
                className="h-4 w-4 text-slate-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m21 21-4.3-4.3" />
                <circle cx="11" cy="11" r="7" />
              </svg>
              Search products, SKUs, categories...
              <span className="ml-auto rounded-lg bg-white px-2 py-1 text-[11px] font-black text-slate-400 ring-1 ring-slate-200">
                Ctrl K
              </span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row xl:justify-end">
              <div className="flex h-11 min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-500">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {today}
              </div>
              <Link
                href="/products/new"
                className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
              >
                Add product
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4 lg:p-7">
          <MetricCard
            label="Total products"
            value={number.format(totalProducts)}
            detail={`${number.format(totalUnits)} units available`}
          />
          <MetricCard
            label="Low stock"
            value={number.format(lowCount)}
            detail={`${number.format(outOfStock)} out of stock`}
            tone={lowCount > 0 ? "rose" : "emerald"}
          />
          <MetricCard
            label="Inventory value"
            value={currency.format(totalValue)}
            detail={`${currency.format(averageValue)} avg per item`}
            tone="slate"
          />
          <MetricCard
            label="Recent movement"
            value={number.format(recentQuantity)}
            detail={`${number.format(movements.length)} latest entries tracked`}
            tone="amber"
          />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.75fr)]">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-base font-black text-slate-950">
                Inventory movement
              </h2>
              <p className="mt-1 text-sm font-medium text-slate-500">
                Last movements by quantity, from oldest to newest.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500">
              Last 7 entries
            </div>
          </div>
          <MiniChart values={chartValues} />
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                Healthy
              </p>
              <p className="mt-2 text-2xl font-black text-slate-950">
                {number.format(healthyItems)}
              </p>
            </div>
            <div className="rounded-2xl bg-rose-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-rose-500">
                Needs action
              </p>
              <p className="mt-2 text-2xl font-black text-rose-700">
                {number.format(lowCount + outOfStock)}
              </p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-600">
                Units
              </p>
              <p className="mt-2 text-2xl font-black text-emerald-800">
                {number.format(totalUnits)}
              </p>
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-black text-slate-950">
                Stock alerts
              </h2>
              <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700">
                {number.format(lowCount)}
              </span>
            </div>
            {lowRows.length === 0 ? (
              <p className="mt-5 rounded-2xl bg-emerald-50 px-4 py-5 text-sm font-semibold text-emerald-800">
                All stock levels are above minimum.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {lowRows.map((item) => (
                  <div
                    key={item.product_id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-rose-100 bg-rose-50/60 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-950">
                        {item.name}
                      </p>
                      <p className="mt-0.5 text-xs font-medium text-slate-500">
                        Min {item.min_stock_level} {item.unit}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-black text-rose-700 ring-1 ring-rose-100">
                      {number.format(item.stock)} left
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
            <h2 className="text-base font-black">Quick actions</h2>
            <div className="mt-4 grid gap-2">
              {[
                { href: "/scan", label: "Scan barcode" },
                { href: "/stock", label: "Record stock movement" },
                { href: "/reports", label: "Export reports" },
              ].map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="flex items-center justify-between rounded-2xl bg-white/8 px-4 py-3 text-sm font-bold text-white ring-1 ring-white/10 transition hover:bg-white/12"
                >
                  {action.label}
                  <span aria-hidden="true">-&gt;</span>
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-base font-black text-slate-950">
                Recent activity
              </h2>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Latest stock entries across your inventory.
              </p>
            </div>
            <Link
              href="/reports"
              className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
            >
              View all
            </Link>
          </div>
          {movements.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm font-medium text-slate-500">
              No stock entries yet. Add a product and record your first stock-in.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs font-black uppercase tracking-[0.08em] text-slate-400">
                    <th className="px-5 py-3">Product</th>
                    <th className="px-5 py-3">Movement</th>
                    <th className="px-5 py-3 text-right">Quantity</th>
                    <th className="px-5 py-3 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {movements.map((movement) => {
                    const tone = movementTone(movement.type);
                    return (
                      <tr key={movement.id} className="hover:bg-slate-50/70">
                        <td className="max-w-[240px] px-5 py-4">
                          <p className="truncate font-bold text-slate-900">
                            {productName(movement.products)}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-black ring-1 ${tone.className}`}
                          >
                            {tone.label}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right font-black text-slate-950">
                          {tone.sign}
                          {number.format(Math.abs(movement.quantity))}
                        </td>
                        <td className="whitespace-nowrap px-5 py-4 text-right text-xs font-semibold text-slate-500">
                          {new Date(movement.created_at).toLocaleString("en-IN", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-slate-950">
                Top stock value
              </h2>
              <p className="mt-1 text-xs font-medium text-slate-500">
                Highest value products in current inventory.
              </p>
            </div>
          </div>
          {topProducts.length === 0 ? (
            <p className="mt-6 rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm font-medium text-slate-500">
              Products will appear here once inventory is added.
            </p>
          ) : (
            <div className="mt-5 space-y-4">
              {topProducts.map((item) => {
                const percent =
                  totalValue > 0
                    ? Math.min(100, Math.round((Number(item.stock_value) / totalValue) * 100))
                    : 0;
                return (
                  <div key={item.product_id}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-950">
                          {item.name}
                        </p>
                        <p className="text-xs font-medium text-slate-500">
                          {number.format(item.stock)} {item.unit}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-black text-slate-950">
                        {currency.format(Number(item.stock_value))}
                      </p>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
