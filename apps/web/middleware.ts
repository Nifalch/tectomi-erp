// Portal session cookie (cp_session) is set by the API on the API origin during
// /api/v1/client-portal/auth/verify. For this middleware to see it, the web
// and API must share a parent domain (production: portal.example.com +
// api.example.com with cookie domain .example.com; dev: use the nginx proxy
// at apps/web/nginx if you need a true same-origin flow).
import { NextRequest, NextResponse } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/portal")) {
    if (process.env.NEXT_PUBLIC_PORTAL_ENABLED !== "true") {
      return new NextResponse(null, { status: 404 });
    }
    if (pathname === "/portal/login" || pathname.startsWith("/portal/auth/verify")) {
      return NextResponse.next();
    }
    const cp = req.cookies.get("cp_session");
    if (!cp) {
      const url = req.nextUrl.clone();
      url.pathname = "/portal/login";
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/portal/:path*"],
};
