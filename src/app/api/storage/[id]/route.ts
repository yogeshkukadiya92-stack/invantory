import { notFound } from "next/navigation";
import { prepareDatabase } from "@/lib/mongodb/data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = await prepareDatabase();
  const file = await db.collection("files").findOne({
    bucket: "product-images",
    path: decodeURIComponent(id),
  });
  if (!file) notFound();

  return new Response(file.data.buffer, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": file.content_type || "application/octet-stream",
    },
  });
}
