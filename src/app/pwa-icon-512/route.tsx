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
          fontSize: 224,
          fontWeight: 700,
          fontFamily: "sans-serif",
        }}
      >
        IN
      </div>
    ),
    { width: 512, height: 512 }
  );
}
