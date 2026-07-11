"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useCallback, useState } from "react";
import type { Profile } from "@/lib/types";
import { Drawer } from "@/components/DashboardUI";
import { SignOutButton } from "@/components/SignOutButton";

interface NavItem {
  href: string;
  label: string;
  shortLabel?: string;
}

const operations: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", shortLabel: "Home" },
  { href: "/sales", label: "Sales" },
  { href: "/purchases", label: "Purchases" },
  { href: "/products", label: "Products" },
  { href: "/scan", label: "Scan" },
  { href: "/stock", label: "Stock" },
  { href: "/customers", label: "Customers" },
];

const insights: NavItem[] = [
  { href: "/analytics", label: "Analytics" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
];

const mobilePrimary = operations.slice(0, 1).concat(operations.slice(1, 2), operations.slice(3, 5));

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

function NavLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate?: () => void }) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex h-10 items-center rounded-md px-3 text-sm font-medium transition-colors ${
        active
          ? "bg-emerald-50 text-emerald-800"
          : "text-stone-600 hover:bg-stone-100 hover:text-stone-950"
      }`}
    >
      {item.label}
    </Link>
  );
}

export function AppShell({
  children,
  profile,
  userEmail,
}: {
  children: ReactNode;
  profile: Profile | null;
  userEmail: string;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const closeMore = useCallback(() => setMoreOpen(false), []);

  return (
    <div className="min-h-dvh bg-stone-100">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-stone-200 bg-white lg:flex">
        <div className="flex h-16 items-center gap-3 border-b border-stone-200 px-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-emerald-700 text-sm font-bold text-white">
            IN
          </div>
          <div>
            <p className="text-sm font-semibold text-stone-950">Inventory</p>
            <p className="text-xs text-stone-500">Operations</p>
          </div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase text-stone-400">Manage</p>
          <div className="space-y-1">
            {operations.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
          <p className="mt-6 px-3 pb-2 text-[11px] font-semibold uppercase text-stone-400">Insights</p>
          <div className="space-y-1">
            {insights.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        </nav>

        <div className="border-t border-stone-200 p-3">
          <div className="mb-3 min-w-0 px-2">
            <p className="truncate text-sm font-medium text-stone-900">
              {profile?.full_name || userEmail}
            </p>
            <p className="mt-0.5 truncate text-xs text-stone-500">
              {profile?.role === "admin" ? "Administrator" : "Staff"}
            </p>
          </div>
          <SignOutButton fullWidth />
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-stone-200 bg-white/95 px-4 backdrop-blur lg:hidden">
          <Link href="/dashboard" className="flex items-center gap-2" aria-label="Inventory dashboard">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-700 text-xs font-bold text-white">
              IN
            </div>
            <span className="text-sm font-semibold text-stone-950">Inventory</span>
          </Link>
          <Link
            href="/sales/new"
            className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            New sale
          </Link>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-5 pb-24 sm:px-6 sm:py-6 lg:px-8 lg:pb-8">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="Mobile navigation">
        {mobilePrimary.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 items-center justify-center px-1 text-center text-xs font-medium ${
                active ? "text-emerald-800" : "text-stone-500"
              }`}
            >
              {item.shortLabel ?? item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={`min-h-14 px-1 text-xs font-medium ${
            [...operations.slice(2, 3), ...operations.slice(5), ...insights].some((item) =>
              isActive(pathname, item.href)
            )
              ? "text-emerald-800"
              : "text-stone-500"
          }`}
          aria-haspopup="dialog"
        >
          More
        </button>
      </nav>

      <Drawer
        open={moreOpen}
        onClose={closeMore}
        title="Navigation"
        description="Open another inventory workspace"
        size="sm"
      >
        <nav className="space-y-1" aria-label="More navigation">
          {[...operations.slice(2, 3), ...operations.slice(5), ...insights].map((item) => (
            <NavLink
              key={item.href}
              item={item}
              pathname={pathname}
              onNavigate={closeMore}
            />
          ))}
        </nav>
        <div className="mt-6 border-t border-stone-200 pt-5">
          <p className="text-sm font-medium text-stone-900">
            {profile?.full_name || userEmail}
          </p>
          <p className="mt-1 text-xs text-stone-500">
            {profile?.role === "admin" ? "Administrator" : "Staff"}
          </p>
          <div className="mt-4">
            <SignOutButton fullWidth />
          </div>
        </div>
      </Drawer>
    </div>
  );
}
