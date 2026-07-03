"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { StockRow } from "@/lib/types";

export default function ReorderPage() {
  const [products, setProducts] = useState<StockRow[]>([]);

  useEffect(() => {
    fetch("/api/products")
      .then((response) => response.json())
      .then(({ data }) => setProducts((data ?? []) as StockRow[]));
  }, []);

  const rows = useMemo(
    () =>
      products
        .filter((product) => product.stock <= product.min_stock_level)
        .sort((a, b) => a.stock - b.stock),
    [products]
  );

  const totalNeed = rows.reduce((sum, product) => sum + Math.max(product.min_stock_level - product.stock, 0), 0);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:p-7">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-rose-600">Reorder planning</p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Low stock queue</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">
              Products at or below minimum stock level, ready for purchase planning.
            </p>
          </div>
          <Link href="/purchases" className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800">
            Receive purchase
          </Link>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">Items needing action</p>
          <p className="mt-3 text-3xl font-black text-slate-950">{rows.length}</p>
        </section>
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">Suggested minimum fill</p>
          <p className="mt-3 text-3xl font-black text-slate-950">{totalNeed}</p>
        </section>
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">Out of stock</p>
          <p className="mt-3 text-3xl font-black text-rose-700">{rows.filter((product) => product.stock <= 0).length}</p>
        </section>
      </div>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        {rows.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm font-semibold text-emerald-700">All products are above minimum stock.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-black uppercase tracking-[0.08em] text-slate-400">
                  <th className="px-5 py-3">Product</th>
                  <th className="px-5 py-3 text-right">Current</th>
                  <th className="px-5 py-3 text-right">Minimum</th>
                  <th className="px-5 py-3 text-right">Suggested</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((product) => (
                  <tr key={product.product_id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-950">{product.name}</p>
                      <p className="text-xs font-medium text-slate-500">{product.sku || product.barcode || "No SKU"}</p>
                    </td>
                    <td className="px-5 py-4 text-right font-black text-rose-700">{product.stock} {product.unit}</td>
                    <td className="px-5 py-4 text-right font-bold text-slate-700">{product.min_stock_level} {product.unit}</td>
                    <td className="px-5 py-4 text-right font-black text-slate-950">{Math.max(product.min_stock_level - product.stock, 0)} {product.unit}</td>
                    <td className="px-5 py-4 text-right">
                      <Link href="/purchases" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50">
                        Purchase
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
