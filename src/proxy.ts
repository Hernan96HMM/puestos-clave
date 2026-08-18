// Convención Next 16: el archivo se llama `proxy.ts` y la función se exporta
// como `proxy` (`middleware` está deprecado — ver
// node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md).
// El runtime de `proxy` es siempre nodejs y no es configurable.
export { auth as proxy } from "./auth";

export const config = {
  // `.*\..*` excluye cualquier archivo estático de `public/` (logo, íconos,
  // etc.) — sin esto, el middleware los interceptaba y redirigía a /login
  // antes de que el navegador pudiera cargarlos (repro: /sica-logo.png en
  // el login, donde el usuario todavía no tiene sesión, devolvía 307).
  matcher: ["/((?!api/health|login|_next/static|_next/image|favicon\\.ico|.*\\..*).*)"],
};
