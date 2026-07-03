import { NextResponse } from "next/server";
import { AUTH_COOKIE, createSessionToken, verifyPassword } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";

export async function POST(request: Request) {
  const { email, password } = await request.json();
  const db = await getDb();
  const user = await db
    .collection("users")
    .findOne({ email: String(email || "").trim().toLowerCase() });

  if (!user || !verifyPassword(String(password || ""), user.password_hash)) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, createSessionToken(String(user._id)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

