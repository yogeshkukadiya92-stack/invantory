"use client";

import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm text-stone-700 transition-colors hover:bg-stone-50"
    >
      Sign out
    </button>
  );
}
