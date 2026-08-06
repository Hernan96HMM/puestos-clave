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
    rol: "gerente",
    sectorSlug: "compras",
    passwordEnv: "SEED_PASSWORD_GERENTE_COMPRAS",
    passwordDefault: "Compras123!",
  },
  {
    email: "almacenes@test.local",
    nombre: "Gerente Almacenes (prueba)",
    rol: "gerente",
    sectorSlug: "almacenes",
    passwordEnv: "SEED_PASSWORD_GERENTE_ALMACENES",
    passwordDefault: "Almacenes123!",
  },
  {
    email: "direccion@test.local",
    nombre: "Dirección (prueba)",
    rol: "direccion",
    sectorSlug: null,
    passwordEnv: "SEED_PASSWORD_DIRECCION",
    passwordDefault: "Direccion123!",
  },
];

async function main() {
  const client = await pool.connect();
  try {
    for (const u of USERS) {
      const password = process.env[u.passwordEnv] ?? u.passwordDefault;
      const passwordHash = await bcrypt.hash(password, 10);
      let sectorId = null;
      if (u.sectorSlug) {
        const { rows } = await client.query("select id from sector where slug = $1", [u.sectorSlug]);
        if (rows.length === 0) {
          throw new Error(`Sector not found: ${u.sectorSlug}`);
        }
        sectorId = rows[0].id;
      }
      await client.query(
        `insert into perfil (email, password_hash, nombre, rol, sector_id)
         values ($1, $2, $3, $4, $5)
         on conflict (email) do update
           set password_hash = excluded.password_hash,
               nombre = excluded.nombre,
               rol = excluded.rol,
               sector_id = excluded.sector_id`,
        [u.email, passwordHash, u.nombre, u.rol, sectorId]
      );
      console.log(`OK: ${u.email} (${u.rol})`);
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
