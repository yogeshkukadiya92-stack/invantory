import { LoginForm } from "./LoginForm";
import { getSupabaseConfig } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginForm isSupabaseConfigured={Boolean(getSupabaseConfig())} />;
}
