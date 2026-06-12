/**
 * Gate all non-public routes behind sign-in.
 */
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const PUBLIC = ["/", "/sign-in", "/api/auth"];

export default auth((req) => {
  const path = req.nextUrl.pathname;
  if (PUBLIC.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p))) {
    return NextResponse.next();
  }
  if (!req.auth) {
    const url = new URL("/sign-in", req.nextUrl);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
