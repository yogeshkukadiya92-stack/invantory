import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/mongodb";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await (await getDb())
    .collection("users")
    .find({})
    .project({ password_hash: 0 })
    .sort({ created_at: -1 })
    .toArray();

  return NextResponse.json({
    data: users.map((item) => ({
      id: String(item._id),
      email: item.email,
      full_name: item.full_name,
      role: item.role ?? "staff",
      created_at: item.created_at,
    })),
  });
}
