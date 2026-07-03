import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb, toObjectId } from "@/lib/mongodb";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const _id = toObjectId(id);
  if (!_id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const product = await (await getDb()).collection("products").findOne({ _id });
  return NextResponse.json({ data: product ? { ...product, id: String(product._id) } : null });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const _id = toObjectId(id);
  if (!_id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json();
  await (await getDb()).collection("products").updateOne(
    { _id },
    {
      $set: {
        ...body,
        purchase_price: Number(body.purchase_price) || 0,
        selling_price: Number(body.selling_price) || 0,
        min_stock_level: Number(body.min_stock_level) || 0,
        updated_at: new Date().toISOString(),
      },
    }
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const _id = toObjectId(id);
  if (!_id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await (await getDb()).collection("products").updateOne(
    { _id },
    { $set: { is_active: false, updated_at: new Date().toISOString() } }
  );
  return NextResponse.json({ ok: true });
}

