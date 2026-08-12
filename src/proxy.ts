export { auth as middleware } from "./auth";

export const config = {
  matcher: ["/((?!api/health|login|_next/static|_next/image|favicon.ico).*)"],
};
