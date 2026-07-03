import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";

export async function GET() {
  const data = await (await getDb()).collection("categories").find({}).sort({ name: 1 }).toArray();
  return NextResponse.json({ data: data.map((item) => ({ ...item, id: String(item._id) })) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { name } = await request.json();
  const db = await getDb();
  const existing = await db.collection("categories").findOne({ name: String(name).trim() });
  if (existing) return NextResponse.json({ error: "This name already exists" }, { status: 409 });
  await db.collection("categories").insertOne({ name: String(name).trim(), created_at: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}

