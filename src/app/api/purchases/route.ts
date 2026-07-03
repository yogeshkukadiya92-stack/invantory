import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";
import { getStockRows, recordMovement } from "@/lib/inventory";

export async function GET() {
  const db = await getDb();
  const [purchases, products, suppliers, users] = await Promise.all([
    db.collection("purchase_orders").find({}).sort({ created_at: -1 }).limit(500).toArray(),
    getStockRows(false),
    db.collection("suppliers").find({}).project({ name: 1 }).toArray(),
    db.collection("users").find({}).project({ full_name: 1 }).toArray(),
  ]);

  const productById = new Map(products.map((product) => [product.product_id, product]));
  const supplierById = new Map(suppliers.map((supplier) => [String(supplier._id), supplier.name as string]));
  const userById = new Map(users.map((user) => [String(user._id), user.full_name as string]));

  return NextResponse.json({
    data: purchases.map((purchase) => {
      const product = productById.get(purchase.product_id);
      return {
        id: String(purchase._id),
        product_id: purchase.product_id,
        supplier_id: purchase.supplier_id ?? null,
        quantity: purchase.quantity,
        unit_cost: purchase.unit_cost,
        reference: purchase.reference ?? null,
        note: purchase.note ?? null,
        created_by: purchase.created_by ?? null,
        created_at: purchase.created_at,
        products: product ? { name: product.name, unit: product.unit } : null,
        suppliers: purchase.supplier_id ? { name: supplierById.get(purchase.supplier_id) ?? "" } : null,
        profiles: purchase.created_by ? { full_name: userById.get(purchase.created_by) ?? "" } : null,
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
  const unitCost = Number(body.unit_cost) || 0;

  if (!productId) return NextResponse.json({ error: "Select a product" }, { status: 400 });
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "Quantity must be greater than zero" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const db = await getDb();
  const result = await db.collection("purchase_orders").insertOne({
    product_id: productId,
    supplier_id: body.supplier_id || null,
    quantity,
    unit_cost: unitCost,
    reference: body.reference ? String(body.reference).trim() : null,
    note: body.note ? String(body.note).trim() : null,
    created_by: user.id,
    created_at: now,
  });

  const movement = await recordMovement({
    product_id: productId,
    type: "in",
    quantity,
    reason: body.reference ? `Purchase ${String(body.reference).trim()}` : "Purchase received",
    supplier_id: body.supplier_id || null,
    created_by: user.id,
  });

  return NextResponse.json({
    id: String(result.insertedId),
    new_stock: movement.new_stock,
  });
}
