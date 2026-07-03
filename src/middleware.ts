import { NextResponse, type NextRequest } from "next/server";

const AUTH_COOKIE = "inventory_session";

export function middleware(request: NextRequest) {
  const isLoginPage = request.nextUrl.pathname.startsWith("/login");
  const hasSession = Boolean(request.cookies.get(AUTH_COOKIE)?.value);

  if (!hasSession && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (hasSession && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
