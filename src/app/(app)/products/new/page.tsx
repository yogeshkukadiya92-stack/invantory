"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ProductForm } from "@/components/ProductForm";

function NewProductInner() {
  const params = useSearchParams();
  const barcode = params.get("barcode") ?? "";
  return <ProductForm initialBarcode={barcode} />;
}

export default function NewProductPage() {
  return (
    <Suspense
      fallback={
        <p className="py-8 text-center text-sm text-stone-500">Loading...</p>
      }
    >
      <NewProductInner />
    </Suspense>
  );
}
