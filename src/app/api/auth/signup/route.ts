import { NextResponse } from "next/server";
import { AUTH_COOKIE, createSessionToken, hashPassword } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";

export async function POST(request: Request) {
  const { email, password, full_name } = await request.json();
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
  }

  const db = await getDb();
  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await db.collection("users").findOne({ email: normalizedEmail });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const usersCount = await db.collection("users").countDocuments();
  const result = await db.collection("users").insertOne({
    email: normalizedEmail,
    full_name: String(full_name || normalizedEmail).trim(),
    password_hash: hashPassword(password),
    role: usersCount === 0 ? "admin" : "staff",
    created_at: new Date().toISOString(),
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(AUTH_COOKIE, createSessionToken(String(result.insertedId)), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

