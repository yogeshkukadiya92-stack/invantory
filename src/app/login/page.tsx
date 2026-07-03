"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(
                "Request timed out. Check the MongoDB connection string in Railway."
              )
            ),
          15000
        );
      });
      const response = await Promise.race([
        fetch(mode === "signin" ? "/api/auth/signin" : "/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, full_name: fullName }),
        }),
        timeout,
      ]);
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Authentication failed");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-slate-100 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_480px] lg:p-6">
      <section className="relative hidden overflow-hidden rounded-[2rem] bg-slate-950 p-10 text-white shadow-[0_30px_90px_rgba(2,6,23,0.28)] lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.28),transparent_30%),radial-gradient(circle_at_80%_10%,rgba(6,182,212,0.20),transparent_28%)]" />
        <div className="relative flex h-full flex-col justify-between">
          <div>
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-400 text-sm font-black text-slate-950">
              IN
            </div>
            <h1 className="mt-8 max-w-xl text-5xl font-black leading-[1.02] tracking-tight">
              Premium inventory control for fast-moving teams.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-300">
              Track products, barcode scans, stock movement, labels, reports,
              suppliers, and operational health in one focused workspace.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              ["Live", "Stock visibility"],
              ["Fast", "Barcode workflows"],
              ["Clean", "Export-ready reports"],
            ].map(([label, text]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-white/8 p-4 backdrop-blur">
                <p className="text-lg font-black text-emerald-300">{label}</p>
                <p className="mt-1 text-xs font-medium text-slate-300">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center lg:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center lg:text-left">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-950 text-lg font-black text-white shadow-[0_18px_38px_rgba(2,6,23,0.22)] lg:mx-0">
              IN
            </div>
            <h2 className="mt-5 text-3xl font-black tracking-tight text-slate-950">
              {mode === "signin" ? "Welcome back" : "Create your workspace"}
            </h2>
            <p className="mt-2 text-sm font-medium text-slate-500">
              {mode === "signin"
                ? "Sign in to continue managing your stock."
                : "The first registered account becomes the admin."}
            </p>
          </div>

          <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,0.10)] sm:p-6">
            {mode === "signup" && (
              <div className="mb-4">
                <label className="mb-1.5 block text-sm font-bold text-slate-700">
                  Full name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-xl border px-3 py-2.5 text-sm"
                  placeholder="Yogesh Kukadiya"
                />
              </div>
            )}

            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-bold text-slate-700">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border px-3 py-2.5 text-sm"
                placeholder="you@example.com"
              />
            </div>

            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-bold text-slate-700">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                className="w-full rounded-xl border px-3 py-2.5 text-sm"
                placeholder="Enter your password"
              />
            </div>

            {error && (
              <p className="mb-4 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700">
                {error}
              </p>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading || !email || !password}
              className="h-12 w-full rounded-xl bg-emerald-700 text-sm font-black text-white shadow-[0_16px_32px_rgba(5,135,102,0.22)] hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </div>

          <p className="mt-5 text-center text-sm font-medium text-slate-600">
            {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
            <button
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
              }}
              className="font-black text-emerald-700 hover:text-emerald-800"
            >
              {mode === "signin" ? "Create account" : "Sign in"}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
