import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";

export async function GET() {
  const data = await (await getDb()).collection("suppliers").find({}).sort({ name: 1 }).toArray();
  return NextResponse.json({ data: data.map((item) => ({ ...item, id: String(item._id) })) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  await (await getDb()).collection("suppliers").insertOne({
    name: String(body.name || "").trim(),
    phone: body.phone || null,
    address: body.address || null,
    created_at: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true });
}

