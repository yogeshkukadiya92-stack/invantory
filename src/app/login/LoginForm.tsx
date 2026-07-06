"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({
  isSupabaseConfigured,
}: {
  isSupabaseConfigured: boolean;
}) {
  const router = useRouter();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit() {
    if (loading) return;
    setLoading(true);
    setError(null);
    setNotice(null);

    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      setError(
        "Supabase is not configured. Add the required environment variables before signing in."
      );
      setLoading(false);
      return;
    }

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) {
        // Invite trigger no exception Supabase generic message tarike aave che
        const friendly =
          error.message.includes("Database error saving new user") ||
          error.message.includes("signup_not_invited")
            ? "Aa email invited nathi. Admin ne Settings -> Invited emails ma add karva kaho."
            : error.message;
        setError(friendly);
        setLoading(false);
        return;
      }
      // Email confirmation ON hoy to session nahi male
      if (!data.session) {
        setNotice("Account created. Check your email to confirm, then sign in.");
        setMode("signin");
        setLoading(false);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-stone-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-700 text-white text-xl font-semibold">
            IN
          </div>
          <h1 className="mt-4 text-2xl font-semibold text-stone-900">
            Inventory
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            {mode === "signin"
              ? "Sign in to manage your stock"
              : "Create your account (invited emails only)"}
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm border border-stone-200">
          {!isSupabaseConfigured && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Supabase is not configured on this deployment. Add
              NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, then
              redeploy.
            </div>
          )}

          {mode === "signup" && (
            <div className="mb-4">
              <label
                htmlFor="full-name"
                className="block text-sm font-medium text-stone-700 mb-1"
              >
                Full name
              </label>
              <input
                id="full-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                placeholder="Business owner name"
                autoComplete="name"
              />
            </div>
          )}

          <div className="mb-4">
            <label
              htmlFor="email"
              className="block text-sm font-medium text-stone-700 mb-1"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div className="mb-4">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-stone-700 mb-1"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
              placeholder="••••••••"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
          </div>

          {error && (
            <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {notice && (
            <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {notice}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading || !email || !password}
            className="w-full rounded-lg bg-emerald-700 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors"
          >
            {loading
              ? "Please wait..."
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </button>
        </div>

        <p className="mt-4 text-center text-sm text-stone-600">
          {mode === "signin" ? (
            <>
              New here?{" "}
              <button
                onClick={() => setMode("signup")}
                className="font-medium text-emerald-700 hover:underline"
              >
                Create account
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                onClick={() => setMode("signin")}
                className="font-medium text-emerald-700 hover:underline"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </main>
  );
}
