"use client";

interface LowStockItem {
  name: string;
  stock: number;
  unit: string;
  min_stock_level: number;
}

export function ShareLowStockButton({ items }: { items: LowStockItem[] }) {
  if (items.length === 0) return null;

  function share() {
    const lines = [
      "*Low stock list* 📉",
      new Date().toLocaleDateString("en-IN"),
      "",
      ...items.map(
        (i) =>
          `• ${i.name} — ${i.stock} ${i.unit} baki (min ${i.min_stock_level})`
      ),
    ];
    window.open(
      `https://api.whatsapp.com/send?text=${encodeURIComponent(lines.join("\n"))}`,
      "_blank"
    );
  }

  return (
    <button
      onClick={share}
      className="rounded-lg border border-emerald-700 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
    >
      💬 Share
    </button>
  );
}
