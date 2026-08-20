import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { query } from "./lib/db/query";

type PerfilRow = {
  id: string;
  password_hash: string;
  nombre: string;
};

type PerfilRolRow = {
  rol: "gerente" | "direccion";
  sector_id: string | null;
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") return null;

        const rows = await query<PerfilRow>(
          "select id, password_hash, nombre from perfil where email = $1",
          [email]
        );
        const row = rows[0];
        if (!row) return null;

        const valid = await bcrypt.compare(password, row.password_hash);
        if (!valid) return null;

        // Join a sector para que sectoresGerente salga ya ordenado por
        // sector.orden — así (app)/page.tsx puede tomar el primero sin
        // ambigüedad si algún día un perfil tiene más de un sector gerente.
        const rolesRows = await query<PerfilRolRow>(
          `select pr.rol, pr.sector_id
           from perfil_rol pr
           left join sector s on s.id = pr.sector_id
           where pr.perfil_id = $1
           order by s.orden`,
          [row.id]
        );
        const esDireccion = rolesRows.some((r) => r.rol === "direccion");
        const sectoresGerente = rolesRows
          .filter((r) => r.rol === "gerente")
          .map((r) => r.sector_id as string);

        return {
          id: row.id,
          email,
          name: row.nombre,
          esDireccion,
          sectoresGerente,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.esDireccion = user.esDireccion;
        token.sectoresGerente = user.sectoresGerente;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        // `??` protege sesiones JWT emitidas antes de este deploy (sin estos
        // campos) — sin esto, un cookie viejo produce `undefined` en un campo
        // tipado boolean/string[], y cualquier página que lo lea (`.includes`,
        // `[0]`) tira un 500 en vez de degradar a "sin roles".
        session.user.esDireccion = token.esDireccion ?? false;
        session.user.sectoresGerente = token.sectoresGerente ?? [];
      }
      return session;
    },
  },
});
