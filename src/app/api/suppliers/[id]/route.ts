import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb, toObjectId } from "@/lib/mongodb";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const _id = toObjectId(id);
  if (!_id) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await (await getDb()).collection("suppliers").deleteOne({ _id });
  return NextResponse.json({ ok: true });
}

