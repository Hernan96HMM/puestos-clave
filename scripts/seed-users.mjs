import pg from "pg";
import bcrypt from "bcryptjs";

const connectionString = process.env.DATABASE_URL_OWNER;
if (!connectionString) {
  console.error("DATABASE_URL_OWNER is not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

const USERS = [
  {
    email: "compras@test.local",
    nombre: "Gerente Compras (prueba)",
    passwordEnv: "SEED_PASSWORD_GERENTE_COMPRAS",
    passwordDefault: "Compras123!",
    roles: [{ rol: "gerente", sectorSlug: "compras" }],
  },
  {
    email: "almacenes@test.local",
    nombre: "Gerente Almacenes (prueba)",
    passwordEnv: "SEED_PASSWORD_GERENTE_ALMACENES",
    passwordDefault: "Almacenes123!",
    roles: [{ rol: "gerente", sectorSlug: "almacenes" }],
  },
  {
    email: "direccion@test.local",
    nombre: "Dirección (prueba)",
    passwordEnv: "SEED_PASSWORD_DIRECCION",
    passwordDefault: "Direccion123!",
    roles: [{ rol: "direccion" }],
  },
  {
    email: "rrhh@test.local",
    nombre: "Gerente RRHH (prueba)",
    passwordEnv: "SEED_PASSWORD_GERENTE_RRHH",
    passwordDefault: "RRHH123!",
    roles: [{ rol: "gerente", sectorSlug: "recursos-humanos" }, { rol: "direccion" }],
  },
  {
    email: "sig@test.local",
    nombre: "Gerente SIG (prueba)",
    passwordEnv: "SEED_PASSWORD_GERENTE_SIG",
    passwordDefault: "Sig123!",
    roles: [{ rol: "gerente", sectorSlug: "sig-y-medio-ambiente" }, { rol: "direccion" }],
  },
];

async function main() {
  const client = await pool.connect();
  try {
    for (const u of USERS) {
      const password = process.env[u.passwordEnv] ?? u.passwordDefault;
      const passwordHash = await bcrypt.hash(password, 10);

      const { rows } = await client.query(
        `insert into perfil (email, password_hash, nombre)
         values ($1, $2, $3)
         on conflict (email) do update
           set password_hash = excluded.password_hash,
               nombre = excluded.nombre
         returning id`,
        [u.email, passwordHash, u.nombre]
      );
      const perfilId = rows[0].id;

      // Reemplaza todas las filas de rol del perfil por las declaradas acá —
      // más simple que un upsert por fila con clave compuesta, y esta tabla
      // solo la escribe este script (nunca la UI).
      await client.query("delete from perfil_rol where perfil_id = $1", [perfilId]);
      for (const r of u.roles) {
        let sectorId = null;
        if (r.sectorSlug) {
          const sectorRows = await client.query("select id from sector where slug = $1", [r.sectorSlug]);
          if (sectorRows.rows.length === 0) {
            throw new Error(`Sector not found: ${r.sectorSlug}`);
          }
          sectorId = sectorRows.rows[0].id;
        }
        await client.query("insert into perfil_rol (perfil_id, rol, sector_id) values ($1, $2, $3)", [
          perfilId,
          r.rol,
          sectorId,
        ]);
      }

      const rolesDesc = u.roles.map((r) => (r.sectorSlug ? `${r.rol}:${r.sectorSlug}` : r.rol)).join(", ");
      console.log(`OK: ${u.email} (${rolesDesc})`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
