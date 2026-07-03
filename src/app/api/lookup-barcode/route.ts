import { NextResponse } from "next/server";
import { getStockRows } from "@/lib/inventory";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const barcode = searchParams.get("barcode") ?? "";
  const product = (await getStockRows(true)).find((row) => row.barcode === barcode);
  if (!product) return NextResponse.json({ found: false, barcode });
  return NextResponse.json({ found: true, product });
}

