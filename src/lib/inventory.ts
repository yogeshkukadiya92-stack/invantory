import { ObjectId } from "mongodb";
import { getDb } from "./mongodb";
import type { MovementType, StockRow } from "./types";

export interface MongoProduct {
  _id: ObjectId;
  name: string;
  sku: string | null;
  barcode: string | null;
  category_id: string | null;
  unit: string;
  purchase_price: number;
  selling_price: number;
  min_stock_level: number;
  image_url: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function getStockRows(activeOnly = true): Promise<StockRow[]> {
  const db = await getDb();
  const products = await db
    .collection<MongoProduct>("products")
    .find(activeOnly ? { is_active: true } : {})
    .sort({ name: 1 })
    .toArray();
  const movements = await db
    .collection("stock_movements")
    .find({})
    .project<{ product_id: string; type: MovementType; quantity: number }>({
      product_id: 1,
      type: 1,
      quantity: 1,
    })
    .toArray();

  const stockByProduct = new Map<string, number>();
  for (const movement of movements) {
    const change =
      movement.type === "in"
        ? movement.quantity
        : movement.type === "out"
          ? -movement.quantity
          : movement.quantity;
    stockByProduct.set(
      movement.product_id,
      (stockByProduct.get(movement.product_id) ?? 0) + change
    );
  }

  return products.map((product) => {
    const stock = stockByProduct.get(String(product._id)) ?? 0;
    return {
      product_id: String(product._id),
      name: product.name,
      sku: product.sku,
      barcode: product.barcode,
      unit: product.unit,
      min_stock_level: product.min_stock_level,
      selling_price: product.selling_price,
      purchase_price: product.purchase_price,
      category_id: product.category_id,
      is_active: product.is_active,
      stock,
      stock_value: stock * product.purchase_price,
    };
  });
}

export async function recordMovement(input: {
  product_id: string;
  type: MovementType;
  quantity: number;
  reason?: string | null;
  supplier_id?: string | null;
  created_by?: string | null;
}) {
  const db = await getDb();
  await db.collection("stock_movements").insertOne({
    product_id: input.product_id,
    type: input.type,
    quantity: input.quantity,
    reason: input.reason ?? null,
    supplier_id: input.supplier_id ?? null,
    created_by: input.created_by ?? null,
    created_at: new Date().toISOString(),
  });
  const stock = (await getStockRows(false)).find(
    (row) => row.product_id === input.product_id
  );
  return { new_stock: stock?.stock ?? 0 };
}

