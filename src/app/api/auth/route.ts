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
    const result = await signInWithPassword(
      String(body.email ?? ""),
      String(body.password ?? "")
    ).catch((err) => ({
      error: { message: err instanceof Error ? err.message : "Sign in failed" },
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

  return NextResponse.json({
    data: null,
    error: { message: "Unknown auth action" },
  });
}
