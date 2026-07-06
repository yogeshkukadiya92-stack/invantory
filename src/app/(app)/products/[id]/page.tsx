"use client";

import { use } from "react";
import { ProductForm } from "@/components/ProductForm";

export default function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Next.js 15 ma params Promise che; use() banne version handle kare
  const { id } = use(params);
  return <ProductForm productId={id} />;
}
