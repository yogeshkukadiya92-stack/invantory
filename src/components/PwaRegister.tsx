"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      });
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // The app remains usable when PWA registration is unavailable.
    });
  }, []);
  return null;
}
