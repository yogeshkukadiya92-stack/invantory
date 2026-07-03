"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm8 0h8v-9h-8v9Zm0-11h8V4h-8v5Z" },
  { href: "/products", label: "Products", icon: "M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Zm8 4.5 8-4.5M12 12 4 7.5M12 12v9" },
  { href: "/scan", label: "Scan", icon: "M5 7V5h4M15 5h4v2M19 17v2h-4M9 19H5v-2M7 12h10" },
  { href: "/stock", label: "Stock", icon: "M5 17h14M7 17V8l5-3 5 3v9M9 11h6" },
  { href: "/reports", label: "Reports", icon: "M5 19V5h14v14H5Zm4-4v-4M12 15V8M15 15v-2" },
  { href: "/settings", label: "Settings", icon: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0-5v2M12 18.5v2M4.43 4.43l1.42 1.42M18.15 18.15l1.42 1.42M3.5 12h2M18.5 12h2M4.43 19.57l1.42-1.42M18.15 5.85l1.42-1.42" },
];

function NavIcon({ path }: { path: string }) {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} />
    </svg>
  );
}

export function AppNav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();

  if (mobile) {
    return (
      <nav className="fixed bottom-0 left-0 right-0 z-20 grid grid-cols-6 border-t border-slate-200 bg-white/95 px-1 py-2 shadow-[0_-18px_50px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-semibold transition ${
                active ? "bg-emerald-50 text-emerald-700" : "text-slate-500"
              }`}
            >
              <NavIcon path={item.icon} />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="mt-8 space-y-1.5">
      {navItems.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
              active
                ? "bg-slate-950 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
            }`}
          >
            <span
              className={`grid h-8 w-8 place-items-center rounded-lg transition ${
                active
                  ? "bg-emerald-400 text-slate-950"
                  : "bg-white text-slate-400 ring-1 ring-slate-200 group-hover:text-emerald-700"
              }`}
            >
              <NavIcon path={item.icon} />
            </span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
