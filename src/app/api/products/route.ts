import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { getStockRows } from "@/lib/inventory";

export async function GET() {
  return NextResponse.json({ data: await getStockRows(true) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const db = await getDb();
  const duplicate = await db.collection("products").findOne({
    $or: [
      ...(body.sku ? [{ sku: body.sku }] : []),
      ...(body.barcode ? [{ barcode: body.barcode }] : []),
    ],
  });
  if (duplicate) return NextResponse.json({ error: "This barcode or SKU already exists" }, { status: 409 });

  const now = new Date().toISOString();
  const result = await db.collection("products").insertOne({
    name: String(body.name || "").trim(),
    sku: body.sku || null,
    barcode: body.barcode || null,
    category_id: body.category_id || null,
    unit: body.unit || "pcs",
    purchase_price: Number(body.purchase_price) || 0,
    selling_price: Number(body.selling_price) || 0,
    min_stock_level: Number(body.min_stock_level) || 0,
    image_url: null,
    is_active: true,
    created_by: user.id,
    created_at: now,
    updated_at: now,
  });
  return NextResponse.json({ id: String(result.insertedId) });
}

