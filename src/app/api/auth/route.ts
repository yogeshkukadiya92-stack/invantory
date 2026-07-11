import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  createSessionToken,
  getCurrentUserFromCookieStore,
  sessionCookieOptions,
  signInWithPassword,
  signUpWithPassword,
  SESSION_COOKIE,
} from "@/lib/mongodb/auth";

interface AuthAttempt {
  count: number;
  resetAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __inventoryAuthAttempts: Map<string, AuthAttempt> | undefined;
}

const attempts = global.__inventoryAuthAttempts ?? new Map<string, AuthAttempt>();
global.__inventoryAuthAttempts = attempts;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function attemptKey(request: Request, email: unknown) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  return `${ip}:${String(email ?? "").trim().toLowerCase()}`;
}

function blocked(key: string) {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (entry.resetAt <= Date.now()) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(key: string) {
  if (attempts.size > 5000) {
    const now = Date.now();
    for (const [attemptKey, attempt] of attempts) {
      if (attempt.resetAt <= now) attempts.delete(attemptKey);
    }
    while (attempts.size > 5000) {
      const oldestKey = attempts.keys().next().value as string | undefined;
      if (!oldestKey) break;
      attempts.delete(oldestKey);
    }
  }
  const current = attempts.get(key);
  if (!current || current.resetAt <= Date.now()) {
    attempts.set(key, { count: 1, resetAt: Date.now() + ATTEMPT_WINDOW_MS });
    return;
  }
  attempts.set(key, { ...current, count: current.count + 1 });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const action = body.action as string | undefined;
  const cookieStore = await cookies();

  if (action === "getUser") {
    const user = await getCurrentUserFromCookieStore(cookieStore);
    return NextResponse.json({ data: { user }, error: null });
  }

  if (action === "signOut") {
    const response = NextResponse.json({ data: null, error: null });
    response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
    return response;
  }

  if (action === "signIn") {
    const key = attemptKey(request, body.email);
    if (blocked(key)) {
      return NextResponse.json(
        { data: null, error: { message: "Too many sign-in attempts. Try again in 15 minutes." } },
        { status: 429 }
      );
    }
    const result = await signInWithPassword(
      String(body.email ?? ""),
      String(body.password ?? "")
    ).catch((err) => ({
      error: { message: err instanceof Error ? err.message : "Sign in failed" },
      token: null,
      user: null,
    }));
    if (result.error || !result.user || !result.token) {
      recordFailure(key);
      return NextResponse.json({ data: null, error: result.error });
    }
    attempts.delete(key);
    const response = NextResponse.json({
      data: { session: { access_token: createSessionToken(result.user.id) }, user: result.user },
      error: null,
    });
    response.cookies.set(SESSION_COOKIE, result.token, sessionCookieOptions());
    return response;
  }

  if (action === "signUp") {
    const result = await signUpWithPassword({
      email: String(body.email ?? ""),
      fullName: String(body.fullName ?? ""),
      password: String(body.password ?? ""),
    }).catch((err) => ({
      error: { message: err instanceof Error ? err.message : "Sign up failed" },
      token: null,
      user: null,
    }));
    if (result.error || !result.user || !result.token) {
      return NextResponse.json({ data: null, error: result.error });
    }
    const response = NextResponse.json({
      data: { session: { access_token: createSessionToken(result.user.id) }, user: result.user },
      error: null,
    });
    response.cookies.set(SESSION_COOKIE, result.token, sessionCookieOptions());
    return response;
  }

  return NextResponse.json(
    { data: null, error: { message: "Unknown auth action" } },
    { status: 400 }
  );
}
