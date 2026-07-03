import { createClient } from "@/lib/supabase/server";
import type { StockRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();

  const [{ data: stockRows }, { data: lowStock }, { data: recentMovements }] =
    await Promise.all([
      supabase.from("current_stock").select("*").eq("is_active", true),
      supabase.from("low_stock").select("*").limit(10),
      supabase
        .from("stock_movements")
        .select("id, type, quantity, created_at, products(name)")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  const rows = (stockRows ?? []) as StockRow[];
  const totalProducts = rows.length;
  const totalUnits = rows.reduce((sum, r) => sum + r.stock, 0);
  const totalValue = rows.reduce((sum, r) => sum + Number(r.stock_value), 0);
  const lowCount = lowStock?.length ?? 0;

  const stats = [
    { label: "Products", value: totalProducts.toLocaleString("en-IN") },
    { label: "Units in stock", value: totalUnits.toLocaleString("en-IN") },
    {
      label: "Stock value",
      value: "₹" + totalValue.toLocaleString("en-IN", { maximumFractionDigits: 0 }),
    },
    { label: "Low stock items", value: String(lowCount), alert: lowCount > 0 },
  ];

  return (
    <div>
      <h1 className="text-xl font-semibold text-stone-900">Dashboard</h1>

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className={`rounded-2xl border bg-white p-4 ${
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

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {/* Low stock list */}
        <section className="rounded-2xl border border-stone-200 bg-white">
          <div className="border-b border-stone-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-stone-900">
              Low stock alerts
            </h2>
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

        {/* Recent movements */}
        <section className="rounded-2xl border border-stone-200 bg-white">
          <div className="border-b border-stone-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-stone-900">
              Recent activity
            </h2>
          </div>
          {!recentMovements || recentMovements.length === 0 ? (
            <p className="px-4 py-6 text-sm text-stone-500">
              No stock entries yet. Add a product and record your first
              stock-in.
            </p>
          ) : (
            <ul className="divide-y divide-stone-100">
              {recentMovements.map((m) => {
                const productName =
                  (m.products as unknown as { name: string } | null)?.name ??
                  "Unknown product";
                const badge =
                  m.type === "in"
                    ? "bg-emerald-50 text-emerald-700"
                    : m.type === "out"
                      ? "bg-amber-50 text-amber-700"
                      : "bg-stone-100 text-stone-600";
                const sign = m.type === "in" ? "+" : m.type === "out" ? "−" : "±";
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
                      {sign}
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
