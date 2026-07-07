import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  const isConfigured = Boolean(process.env.MONGODB_URI && process.env.SESSION_SECRET);
  const isLoginPage = request.nextUrl.pathname.startsWith("/login");
  const isApiRoute = request.nextUrl.pathname.startsWith("/api/");
  const hasSession = Boolean(request.cookies.get("inventory_session")?.value);

  if (isApiRoute) return response;

  if (!isConfigured) {
    if (!isLoginPage) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("setup", "missing");
      return NextResponse.redirect(url);
    }
    return response;
  }

  // Login nathi karyu ane protected page par che → /login par mokli do
  if (!hasSession && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    // Static files, images ane PWA assets sivay badhi requests par chale
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|pwa-icon-192|pwa-icon-512|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
