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
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new Error(
                "Login request timed out. Check the MongoDB connection string in Railway."
              )
            ),
          15000
        );
      });

      if (mode === "signin") {
        const response = await Promise.race([
          fetch("/api/auth/signin", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          }),
          timeout,
        ]);
        const result = await response.json();
        if (!response.ok) {
          setError(result.error ?? "Sign in failed");
          return;
        }
        router.push("/dashboard");
        router.refresh();
      } else {
        const response = await Promise.race([
          fetch("/api/auth/signup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, full_name: fullName }),
          }),
          timeout,
        ]);
        const result = await response.json();
        if (!response.ok) {
          setError(result.error ?? "Create account failed");
          return;
        }
        router.push("/dashboard");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
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
              : "Create your account"}
          </p>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm border border-stone-200">
          {mode === "signup" && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Full name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                placeholder="Yogesh Kukadiya"
              />
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
              placeholder="you@example.com"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
              placeholder="••••••••"
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
