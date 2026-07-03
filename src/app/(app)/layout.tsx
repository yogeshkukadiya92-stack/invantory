import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/SignOutButton";
import { AppNav } from "@/components/AppNav";
import { getCurrentUser } from "@/lib/auth";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-slate-900/10 bg-white/94 px-5 py-5 shadow-[18px_0_70px_rgba(15,23,42,0.06)] backdrop-blur md:block">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-950 text-sm font-black text-white shadow-[0_16px_30px_rgba(2,6,23,0.22)]">
            IN
          </div>
          <div>
            <p className="text-base font-black tracking-tight text-slate-950">
              Inventory
            </p>
            <p className="text-xs font-medium text-slate-500">
              Stock operations suite
            </p>
          </div>
        </div>

        <AppNav />

        <div className="absolute bottom-5 left-5 right-5 overflow-hidden rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-cyan-50 p-4 shadow-sm">
          <div className="absolute right-3 top-3 h-12 w-12 rounded-full bg-emerald-200/30 blur-xl" />
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
            Workspace
          </p>
          <p className="mt-2 truncate text-sm font-semibold text-slate-950">
            {user.full_name || user.email}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {user.role === "admin" ? "Admin access" : "Staff access"}
          </p>
          <div className="mt-4">
            <SignOutButton />
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-950 text-sm font-black text-white">
              IN
            </div>
            <span className="text-base font-black tracking-tight text-slate-950">
              Inventory
            </span>
          </div>
          <SignOutButton />
        </div>
      </header>

      <AppNav mobile />

      <main className="px-4 py-5 pb-24 md:ml-72 md:px-8 md:py-7 md:pb-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
