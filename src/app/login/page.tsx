import { LoginForm } from "./LoginForm";
import { getMongoConfig } from "@/lib/mongodb/server";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginForm isBackendConfigured={Boolean(getMongoConfig())} />;
}
