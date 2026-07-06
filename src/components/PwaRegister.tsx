"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // SW register fail thay to app normal chale — koi issue nahi
      });
    }
  }, []);
  return null;
}
