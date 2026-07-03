"use client";

import { use } from "react";
import { ProductForm } from "@/components/ProductForm";

export default function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Next.js 15 passes params as a Promise; use() handles both versions.
  const { id } = use(params);
  return <ProductForm productId={id} />;
}
