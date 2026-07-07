"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/mongodb/client";

interface SaleLite {
  created_at: string;
  grand_total: number;
  tax_total: number;
  payment_method: string;
}

interface ItemLite {
  product_id: string | null;
  product_name: string;
  quantity: number;
  line_total: number;
  cost: number | null;
}

const DAYS = 30;

export default function AnalyticsPage() {
  const supabase = createClient();
  const [sales, setSales] = useState<SaleLite[]>([]);
  const [items, setItems] = useState<ItemLite[]>([]);
  const [returnsTotal, setReturnsTotal] = useState(0);
  const [costFallback, setCostFallback] = useState<Map<string, number>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const from = new Date();
      from.setDate(from.getDate() - (DAYS - 1));
      const fromIso = from.toISOString().slice(0, 10);

      const [
        { data: s },
        { data: it },
        { data: rets },
        { data: prods },
      ] = await Promise.all([
        supabase
          .from("sales")
          .select("created_at, grand_total, tax_total, payment_method")
          .gte("created_at", fromIso)
          .limit(5000),
        supabase
          .from("sale_items_dated")
          .select("product_id, product_name, quantity, line_total, cost")
          .gte("sold_at", fromIso)
          .limit(5000),
        supabase
          .from("sale_returns")
          .select("total")
          .gte("created_at", fromIso),
        supabase.from("products").select("id, purchase_price"),
      ]);

      setSales((s ?? []) as SaleLite[]);
      setItems((it ?? []) as ItemLite[]);
      setReturnsTotal(
        ((rets ?? []) as { total: number }[]).reduce(
          (sum, r) => sum + Number(r.total),
          0
        )
      );
      setCostFallback(
        new Map(
          ((prods ?? []) as { id: string; purchase_price: number }[]).map((p) => [
            p.id,
            Number(p.purchase_price),
          ])
        )
      );
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- COMPUTATIONS ----------
  const revenue = sales.reduce((s, r) => s + Number(r.grand_total), 0);
  const gst = sales.reduce((s, r) => s + Number(r.tax_total), 0);
  const invoiceCount = sales.length;
  const avgBill = invoiceCount > 0 ? revenue / invoiceCount : 0;

  // Profit: cost snapshot hoy to e, nahi to aajno purchase price
  const profit = items.reduce((s, it) => {
    const cost =
      it.cost !== null
        ? Number(it.cost)
        : it.product_id
          ? (costFallback.get(it.product_id) ?? 0)
          : 0;
    return s + Number(it.line_total) - Number(it.quantity) * cost;
  }, 0);

  // Daily revenue — chhella 30 divas
  const days: { label: string; total: number }[] = [];
  for (let i = DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({
      label: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
      total: 0,
    });
  }
  const dayIndex = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const diff = Math.floor(
      (new Date(today.toDateString()).getTime() -
        new Date(d.toDateString()).getTime()) /
        86400000
    );
    return DAYS - 1 - diff;
  };
  for (const s of sales) {
    const idx = dayIndex(s.created_at);
    if (idx >= 0 && idx < DAYS) days[idx].total += Number(s.grand_total);
  }
  const maxDay = Math.max(1, ...days.map((d) => d.total));

  // Payment split
  const paySplit = new Map<string, number>();
  for (const s of sales) {
    paySplit.set(
      s.payment_method,
      (paySplit.get(s.payment_method) ?? 0) + Number(s.grand_total)
    );
  }

  // Top products by revenue
  const prodAgg = new Map<string, { qty: number; revenue: number }>();
  for (const it of items) {
    const cur = prodAgg.get(it.product_name) ?? { qty: 0, revenue: 0 };
    cur.qty += Number(it.quantity);
    cur.revenue += Number(it.line_total);
    prodAgg.set(it.product_name, cur);
  }
  const topProducts = [...prodAgg.entries()]
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 10);
  const maxProdRevenue = Math.max(1, ...topProducts.map(([, v]) => v.revenue));

  const inr = (n: number) =>
    "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

  // ---------- CHART GEOMETRY ----------
  const W = 640;
  const H = 170;
  const PAD = 4;
  const barW = (W - PAD * 2) / DAYS;

  const stats = [
    { label: `Revenue (${DAYS}d)`, value: inr(revenue) },
    { label: "Profit (est.)", value: inr(profit), green: profit >= 0 },
    { label: "GST collected", value: inr(gst) },
    { label: "Returns", value: "−" + inr(returnsTotal), amber: returnsTotal > 0 },
    { label: "Invoices", value: String(invoiceCount) },
    { label: "Avg bill", value: inr(avgBill) },
  ];

  if (loading)
    return <p className="py-8 text-center text-sm text-stone-500">Loading...</p>;

  return (
    <div>
      <h1 className="text-xl font-semibold text-stone-900">
        Analytics — last {DAYS} days
      </h1>

      {/* STATS */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-stone-200 bg-white p-4"
          >
            <p className="text-xs text-stone-500">{s.label}</p>
            <p
              className={`mt-1 text-lg font-semibold ${
                s.green ? "text-emerald-700" : s.amber ? "text-amber-700" : "text-stone-900"
              }`}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* DAILY SALES CHART */}
      <section className="mt-4 rounded-2xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-stone-900">Daily sales</h2>
        {revenue === 0 ? (
          <p className="py-6 text-center text-sm text-stone-500">
            Aa period ma koi sales nathi
          </p>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="mt-3 w-full"
              role="img"
              aria-label="Daily sales bar chart"
            >
              {days.map((d, i) => {
                const h = Math.round((d.total / maxDay) * (H - 30));
                return (
                  <g key={i}>
                    <rect
                      x={PAD + i * barW + 1}
                      y={H - 20 - h}
                      width={Math.max(2, barW - 3)}
                      height={Math.max(d.total > 0 ? 2 : 0, h)}
                      rx={2}
                      fill={d.total > 0 ? "#047857" : "#e7e5e4"}
                    >
                      <title>
                        {d.label}: {inr(d.total)}
                      </title>
                    </rect>
                    {i % 5 === 0 && (
                      <text
                        x={PAD + i * barW + barW / 2}
                        y={H - 6}
                        textAnchor="middle"
                        fontSize={9}
                        fill="#a8a29e"
                      >
                        {d.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            <p className="mt-1 text-right text-xs text-stone-400">
              Best day: {inr(maxDay)}
            </p>
          </>
        )}
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* TOP PRODUCTS */}
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-stone-900">
            Top products (by revenue)
          </h2>
          {topProducts.length === 0 ? (
            <p className="py-6 text-center text-sm text-stone-500">
              No data yet
            </p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {topProducts.map(([name, v]) => (
                <li key={name}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate font-medium text-stone-800">
                      {name}
                    </span>
                    <span className="ml-2 shrink-0 text-stone-600">
                      {inr(v.revenue)}
                      <span className="ml-1 text-xs text-stone-400">
                        · {v.qty} sold
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-stone-100">
                    <div
                      className="h-1.5 rounded-full bg-emerald-600"
                      style={{
                        width: `${Math.max(2, (v.revenue / maxProdRevenue) * 100)}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* PAYMENT SPLIT */}
        <section className="rounded-2xl border border-stone-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-stone-900">
            Payment methods
          </h2>
          {paySplit.size === 0 ? (
            <p className="py-6 text-center text-sm text-stone-500">
              No data yet
            </p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {[...paySplit.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([method, total]) => (
                  <li key={method}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium capitalize text-stone-800">
                        {method}
                      </span>
                      <span className="text-stone-600">
                        {inr(total)}
                        <span className="ml-1 text-xs text-stone-400">
                          · {revenue > 0 ? Math.round((total / revenue) * 100) : 0}%
                        </span>
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-stone-100">
                      <div
                        className="h-1.5 rounded-full bg-stone-500"
                        style={{
                          width: `${revenue > 0 ? Math.max(2, (total / revenue) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </section>
      </div>

      <p className="mt-4 text-xs text-stone-400">
        Profit estimate = selling price − purchase cost. Juni sales mate aajno
        purchase price vaparay che; navi sales ma sale vakhat no cost save thay
        che.
      </p>
    </div>
  );
}
