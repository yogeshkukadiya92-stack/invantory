import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/components/PwaRegister";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inventory",
  description: "Stock & inventory management app",
  appleWebApp: {
    capable: true,
    title: "Inventory",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#047857",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
