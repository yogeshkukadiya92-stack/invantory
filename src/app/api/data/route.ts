import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUserFromCookieStore } from "@/lib/mongodb/auth";
import { executeMongoQuery, type QueryRequest } from "@/lib/mongodb/data";

export async function POST(request: Request) {
  const user = await getCurrentUserFromCookieStore(await cookies());
  if (!user) {
    return NextResponse.json(
      { data: null, error: { message: "Not authenticated" } },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as QueryRequest).action !== "string" ||
    typeof (body as QueryRequest).table !== "string" ||
    !Array.isArray((body as QueryRequest).filters) ||
    !Array.isArray((body as QueryRequest).orders) ||
    !Array.isArray((body as QueryRequest).orFilters)
  ) {
    return NextResponse.json(
      { data: null, error: { message: "Invalid data request" } },
      { status: 400 }
    );
  }
  const query = body as QueryRequest;
  const result = await executeMongoQuery(query, user);
  return NextResponse.json(result);
}
