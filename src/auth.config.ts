import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  // Detrás de Nginx sobre HTTP interno (red sicalab_default) — sin esto,
  // Auth.js rechaza el host del request y las cookies de sesión no salen
  // bien. También se setea AUTH_TRUST_HOST=true en el entorno del
  // contenedor (docker-compose.yml) como refuerzo explícito.
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname.startsWith("/login");
      if (isOnLogin) {
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl));
        return true;
      }
      return isLoggedIn;
    },
  },
  providers: [],
};
