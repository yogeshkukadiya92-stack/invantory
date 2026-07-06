import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Inventory",
    short_name: "Inventory",
    description: "Stock & inventory management",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f5f5f4",
    theme_color: "#047857",
    icons: [
      {
        src: "/pwa-icon-192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-icon-512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-icon-512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
