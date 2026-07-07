import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";
import { getMongoConfig } from "@/lib/mongodb/server";
import { getCurrentUserFromCookieStore } from "@/lib/mongodb/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const isBackendConfigured = Boolean(getMongoConfig());

  if (isBackendConfigured) {
    const user = await getCurrentUserFromCookieStore(await cookies()).catch(() => null);
    if (user) redirect("/dashboard");
  }

  return <LoginForm isBackendConfigured={isBackendConfigured} />;
}
