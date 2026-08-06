import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    rol: "gerente" | "direccion";
    sectorId: string | null;
  }

  interface Session {
    user: {
      id: string;
      rol: "gerente" | "direccion";
      sectorId: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    rol: "gerente" | "direccion";
    sectorId: string | null;
  }
}

// `next-auth/jwt` re-exports `JWT` from `@auth/core/jwt` via `export *`, and the
// callbacks in `@auth/core` import `JWT` directly from `@auth/core/jwt`. TypeScript's
// declaration merging does not follow that re-export chain, so the augmentation above
// alone leaves `token.rol`/`token.sectorId` typed as `unknown` inside the `session`
// callback. Augmenting the underlying module directly closes that gap.
declare module "@auth/core/jwt" {
  interface JWT {
    rol: "gerente" | "direccion";
    sectorId: string | null;
  }
}
