import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUserFromCookieStore } from "@/lib/mongodb/auth";
import { executeRpc } from "@/lib/mongodb/data";

export async function POST(request: Request) {
  const user = await getCurrentUserFromCookieStore(await cookies());
  if (!user) {
    return NextResponse.json(
      { data: null, error: { message: "Not authenticated" } },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  if (
    !body ||
    typeof body !== "object" ||
    typeof body.name !== "string" ||
    !body.args ||
    typeof body.args !== "object" ||
    Array.isArray(body.args)
  ) {
    return NextResponse.json(
      { data: null, error: { message: "Invalid action request" } },
      { status: 400 }
    );
  }
  const result = await executeRpc(
    String(body.name ?? ""),
    (body.args ?? {}) as Record<string, unknown>,
    user
  );
  return NextResponse.json(result);
}
