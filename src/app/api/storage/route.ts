import { Binary } from "mongodb";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUserFromCookieStore } from "@/lib/mongodb/auth";
import { prepareDatabase } from "@/lib/mongodb/data";

const MAX_IMAGE_SIZE = 3 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/gif", "image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  const user = await getCurrentUserFromCookieStore(await cookies());
  if (!user) {
    return NextResponse.json(
      { data: null, error: { message: "Not authenticated" } },
      { status: 401 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const bucket = String(formData.get("bucket") ?? "product-images");
  const path = String(formData.get("path") ?? "");
  const upsert = formData.get("upsert") === "true";

  if (!(file instanceof File) || !path) {
    return NextResponse.json({
      data: null,
      error: { message: "Invalid upload" },
    });
  }
  if (bucket !== "product-images") {
    return NextResponse.json({
      data: null,
      error: { message: "Invalid storage bucket" },
    });
  }
  if (!IMAGE_TYPES.has(file.type)) {
    return NextResponse.json({
      data: null,
      error: { message: "Only JPG, PNG, WebP, or GIF images are allowed" },
    });
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_SIZE) {
    return NextResponse.json({
      data: null,
      error: { message: "Image must be smaller than 3 MB" },
    });
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(path) || path.length > 180) {
    return NextResponse.json({
      data: null,
      error: { message: "Invalid image path" },
    });
  }

  const db = await prepareDatabase();
  const existing = await db.collection("files").findOne({ bucket, path });
  if (existing && !upsert) {
    return NextResponse.json({
      data: null,
      error: { message: "File already exists" },
    });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  await db.collection("files").updateOne(
    { bucket, path },
    {
      $set: {
        bucket,
        content_type: file.type || "application/octet-stream",
        data: new Binary(bytes),
        path,
        size: file.size,
        updated_at: new Date().toISOString(),
        uploaded_by: user.id,
      },
      $setOnInsert: { created_at: new Date().toISOString() },
    },
    { upsert: true }
  );

  return NextResponse.json({ data: { path }, error: null });
}
