"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/mongodb/client";

export function LoginForm({
  isBackendConfigured,
}: {
  isBackendConfigured: boolean;
}) {
  const router = useRouter();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
        "MongoDB is not configured. Add the required environment variables before signing in."
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
      const friendly =
        error.message.includes("Database error saving new user") ||
        error.message.includes("signup_not_invited")
            ? "Aa email invited nathi. Admin ne Settings -> Invited emails ma add karva kaho."
            : error.message;
        setError(friendly);
        setLoading(false);
        return;
      }
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

        <form
          className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          {!isBackendConfigured && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              MongoDB is not configured on this deployment. Add MONGODB_URI
              and a SESSION_SECRET of at least 32 characters, then redeploy.
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
                required={mode === "signup"}
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
              required
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
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                placeholder="••••••••"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-stone-500 hover:text-stone-800"
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg
                    aria-hidden="true"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                    viewBox="0 0 24 24"
                  >
                    <path d="m3 3 18 18" />
                    <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                    <path d="M9.4 4.7A10.8 10.8 0 0 1 12 4c5 0 8.5 4.1 9.7 6.3a3.5 3.5 0 0 1 0 3.4 14.5 14.5 0 0 1-2.4 3.1" />
                    <path d="M6.6 6.7a14.6 14.6 0 0 0-4.3 3.6 3.5 3.5 0 0 0 0 3.4C3.5 15.9 7 20 12 20c1 0 1.9-.2 2.8-.5" />
                  </svg>
                ) : (
                  <svg
                    aria-hidden="true"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                    viewBox="0 0 24 24"
                  >
                    <path d="M2.3 10.3a3.5 3.5 0 0 0 0 3.4C3.5 15.9 7 20 12 20s8.5-4.1 9.7-6.3a3.5 3.5 0 0 0 0-3.4C20.5 8.1 17 4 12 4s-8.5 4.1-9.7 6.3Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
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
            type="submit"
            disabled={
              loading || !email || !password || (mode === "signup" && !fullName.trim())
            }
            className="w-full rounded-lg bg-emerald-700 py-2.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50 transition-colors"
          >
            {loading
              ? "Please wait..."
              : mode === "signin"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-stone-600">
          {mode === "signin" ? (
            <>
              New here?{" "}
              <button
                type="button"
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
                type="button"
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
