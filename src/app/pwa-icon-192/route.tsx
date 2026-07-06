import { ImageResponse } from "next/og";

export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#047857",
          color: "#ffffff",
          fontSize: 88,
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        IN
      </div>
    ),
    { width: 192, height: 192 }
  );
}
