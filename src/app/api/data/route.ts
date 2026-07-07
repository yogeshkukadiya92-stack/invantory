import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUserFromCookieStore } from "@/lib/mongodb/auth";
import { executeMongoQuery, type QueryRequest } from "@/lib/mongodb/data";

export async function POST(request: Request) {
  const user = await getCurrentUserFromCookieStore(await cookies());
  if (!user) {
    return NextResponse.json({
      data: null,
      error: { message: "Not authenticated" },
    });
  }

  const query = (await request.json()) as QueryRequest;
  const result = await executeMongoQuery(query, user);
  return NextResponse.json(result);
}
