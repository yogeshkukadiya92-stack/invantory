import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/SignOutButton";
import type { Profile } from "@/lib/types";

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/sales", label: "Sales" },
  { href: "/purchases", label: "Purchases" },
  { href: "/products", label: "Products" },
  { href: "/scan", label: "Scan" },
  { href: "/stock", label: "Stock" },
  { href: "/customers", label: "Customers" },
  { href: "/analytics", label: "Analytics" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  return (
    <div className="min-h-screen bg-stone-100">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-700 text-sm font-semibold text-white">
              IN
            </div>
            <span className="text-base font-semibold text-stone-900">
              Inventory
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-lg px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100 hover:text-stone-900 transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-sm text-stone-500">
              {profile?.full_name || user.email}
              {profile?.role === "admin" && (
                <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  admin
                </span>
              )}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* Mobile bottom nav — scanning motabhage phone thi thashe */}
      <nav className="fixed bottom-0 left-0 right-0 z-10 flex overflow-x-auto border-t border-stone-200 bg-white md:hidden">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="min-w-[72px] flex-1 py-3 text-center text-xs font-medium text-stone-600"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-6 pb-24 md:pb-6">
        {children}
      </main>
    </div>
  );
}
