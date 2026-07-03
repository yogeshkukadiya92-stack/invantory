import { cookies } from "next/headers";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { getDb, toObjectId } from "./mongodb";

export const AUTH_COOKIE = "inventory_session";

const secret =
  process.env.AUTH_SECRET ??
  process.env.NEXTAUTH_SECRET ??
  process.env.JWT_SECRET ??
  "local-dev-change-me";

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "staff";
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const actual = Buffer.from(scryptSync(password, salt, 64).toString("hex"));
  const expected = Buffer.from(hash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function sign(value: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createSessionToken(userId: string) {
  const payload = JSON.stringify({ userId, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 });
  const body = Buffer.from(payload).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readSessionToken(token?: string) {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature || sign(body) !== signature) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      userId: string;
      exp: number;
    };
    if (!parsed.userId || parsed.exp < Date.now()) return null;
    return parsed.userId;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(AUTH_COOKIE)?.value;
  const userId = readSessionToken(token);
  const _id = userId ? toObjectId(userId) : null;
  if (!_id) return null;

  const user = await (await getDb()).collection("users").findOne({ _id });
  if (!user) return null;

  return {
    id: String(user._id),
    email: user.email,
    full_name: user.full_name,
    role: user.role ?? "staff",
  };
}

