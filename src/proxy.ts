import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const isLoginPage = request.nextUrl.pathname.startsWith("/login");

  if (!url || !anonKey) {
    if (!isLoginPage) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("setup", "missing");
      return NextResponse.redirect(url);
    }
    return response;
  }

  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Session refresh (aa line kadhi nakhsho to auth tuti jashe)
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Login nathi karyu ane protected page par che → /login par mokli do
  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Login thai gayu che ane /login par che → dashboard par mokli do
  if (user && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
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
