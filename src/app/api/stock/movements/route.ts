import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { getStockRows, recordMovement } from "@/lib/inventory";
import type { MovementType } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("product_id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const query: Record<string, unknown> = {};
  if (productId) query.product_id = productId;
  if (from || to) {
    query.created_at = {
      ...(from ? { $gte: from } : {}),
      ...(to ? { $lte: `${to}T23:59:59` } : {}),
    };
  }

  const db = await getDb();
  const movements = await db.collection("stock_movements").find(query).sort({ created_at: -1 }).limit(5000).toArray();
  const products = await getStockRows(false);
  const productById = new Map(products.map((p) => [p.product_id, p]));
  const users = await db.collection("users").find({}).project({ full_name: 1 }).toArray();
  const userById = new Map(users.map((u) => [String(u._id), u.full_name]));
  return NextResponse.json({
    data: movements.map((movement) => ({
      ...movement,
      id: String(movement._id),
      products: productById.get(movement.product_id)
        ? { name: productById.get(movement.product_id)!.name, unit: productById.get(movement.product_id)!.unit }
        : null,
      profiles: movement.created_by ? { full_name: userById.get(movement.created_by) ?? "" } : null,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  const result = await recordMovement({
    product_id: body.product_id,
    type: body.type as MovementType,
    quantity: Number(body.quantity),
    reason: body.reason ?? null,
    supplier_id: body.supplier_id ?? null,
    created_by: user.id,
  });
  return NextResponse.json({ movement_id: "", new_stock: result.new_stock });
}

