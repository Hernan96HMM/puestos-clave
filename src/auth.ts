import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { query } from "./lib/db/query";

type PerfilRow = {
  id: string;
  password_hash: string;
  nombre: string;
  rol: "gerente" | "direccion";
  sector_id: string | null;
  acceso_extendido: boolean;
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
          "select id, password_hash, nombre, rol, sector_id, acceso_extendido from perfil where email = $1",
          [email]
        );
        const row = rows[0];
        if (!row) return null;

        const valid = await bcrypt.compare(password, row.password_hash);
        if (!valid) return null;

        return {
          id: row.id,
          email,
          name: row.nombre,
          rol: row.rol,
          sectorId: row.sector_id,
          accesoExtendido: row.acceso_extendido,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.rol = user.rol;
        token.sectorId = user.sectorId;
        token.accesoExtendido = user.accesoExtendido;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.rol = token.rol;
        session.user.sectorId = token.sectorId;
        session.user.accesoExtendido = token.accesoExtendido;
      }
      return session;
    },
  },
});
