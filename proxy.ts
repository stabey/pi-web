import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthRequired, verifyAdminToken, ADMIN_AUTH_COOKIE } from "@/lib/admin-auth";

const PUBLIC_API_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/health",
]);

function isPublicPath(pathname: string): boolean {
  return pathname === "/login" || PUBLIC_API_PATHS.has(pathname);
}

function redirectToLogin(req: NextRequest): NextResponse {
  const loginUrl = new URL("/login", req.url);
  const next = req.nextUrl.pathname + req.nextUrl.search;
  if (next !== "/login") loginUrl.searchParams.set("next", next);
  return NextResponse.redirect(loginUrl);
}

export async function proxy(req: NextRequest) {
  if (!isAdminAuthRequired()) return NextResponse.next();

  const pathname = req.nextUrl.pathname;
  const token = req.cookies.get(ADMIN_AUTH_COOKIE)?.value;
  const session = await verifyAdminToken(token);

  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return redirectToLogin(req);
}

export const config = {
  matcher: [
    "/api/:path*",
    "/((?!_next/static|_next/image|favicon.ico|window.svg|globe.svg|next.svg|vercel.svg|file.svg).*)",
  ],
};
