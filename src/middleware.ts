import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const config = {
  matcher: ["/chat/:path*"],
};

export function middleware(request: NextRequest) {
  const token = request.cookies.get("sb-access-token");
  const refreshToken = request.cookies.get("sb-refresh-token");

  if (!token && !refreshToken) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}
