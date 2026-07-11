"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/mongodb/client";
import { useToast } from "@/components/DashboardUI";

export function SignOutButton({ fullWidth = false }: { fullWidth?: boolean }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      setSigningOut(false);
      showToast(error.message, "error");
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={signingOut}
      className={`rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50 ${
        fullWidth ? "w-full" : ""
      }`}
    >
      {signingOut ? "Signing out..." : "Sign out"}
    </button>
  );
}
