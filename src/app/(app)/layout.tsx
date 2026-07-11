import { redirect } from "next/navigation";
import { createClient, getMongoConfig } from "@/lib/mongodb/server";
import { AppShell } from "@/components/AppShell";
import { ToastProvider } from "@/components/DashboardUI";
import type { Profile } from "@/lib/types";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!getMongoConfig()) {
    redirect("/login?setup=missing");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  const resolvedProfile =
    (profile as Profile | null) ??
    ({
      created_at: "",
      full_name: user.user_metadata?.full_name ?? "",
      id: user.id,
      role: user.role ?? "staff",
    } satisfies Profile);

  return (
    <ToastProvider>
      <AppShell
        profile={resolvedProfile}
        userEmail={user.email ?? "Signed-in user"}
      >
        {children}
      </AppShell>
    </ToastProvider>
  );
}
