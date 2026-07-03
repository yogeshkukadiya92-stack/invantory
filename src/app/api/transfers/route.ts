import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { getStockRows } from "@/lib/inventory";

export async function GET() {
  const db = await getDb();
  const [transfers, products, users] = await Promise.all([
    db.collection("stock_transfers").find({}).sort({ created_at: -1 }).limit(500).toArray(),
    getStockRows(false),
    db.collection("users").find({}).project({ full_name: 1 }).toArray(),
  ]);

  const productById = new Map(products.map((product) => [product.product_id, product]));
  const userById = new Map(users.map((user) => [String(user._id), user.full_name as string]));

  return NextResponse.json({
    data: transfers.map((transfer) => {
      const product = productById.get(transfer.product_id);
      return {
        id: String(transfer._id),
        product_id: transfer.product_id,
        quantity: transfer.quantity,
        from_location: transfer.from_location,
        to_location: transfer.to_location,
        note: transfer.note ?? null,
        created_by: transfer.created_by ?? null,
        created_at: transfer.created_at,
        products: product ? { name: product.name, unit: product.unit } : null,
        profiles: transfer.created_by ? { full_name: userById.get(transfer.created_by) ?? "" } : null,
      };
    }),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const productId = String(body.product_id || "");
  const quantity = Number(body.quantity);
  const fromLocation = String(body.from_location || "").trim();
  const toLocation = String(body.to_location || "").trim();

  if (!productId) return NextResponse.json({ error: "Select a product" }, { status: 400 });
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "Quantity must be greater than zero" }, { status: 400 });
  }
  if (!fromLocation || !toLocation) {
    return NextResponse.json({ error: "Enter both source and destination" }, { status: 400 });
  }

  const result = await (await getDb()).collection("stock_transfers").insertOne({
    product_id: productId,
    quantity,
    from_location: fromLocation,
    to_location: toLocation,
    note: body.note ? String(body.note).trim() : null,
    created_by: user.id,
    created_at: new Date().toISOString(),
  });

  return NextResponse.json({ id: String(result.insertedId) });
}
