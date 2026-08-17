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
    accesoExtendido: false,
  },
  {
    email: "almacenes@test.local",
    nombre: "Gerente Almacenes (prueba)",
    rol: "gerente",
    sectorSlug: "almacenes",
    passwordEnv: "SEED_PASSWORD_GERENTE_ALMACENES",
    passwordDefault: "Almacenes123!",
    accesoExtendido: false,
  },
  {
    email: "direccion@test.local",
    nombre: "Dirección (prueba)",
    rol: "direccion",
    sectorSlug: null,
    passwordEnv: "SEED_PASSWORD_DIRECCION",
    passwordDefault: "Direccion123!",
    accesoExtendido: false,
  },
  {
    email: "rrhh@test.local",
    nombre: "Gerente RRHH (prueba)",
    rol: "gerente",
    sectorSlug: "recursos-humanos",
    passwordEnv: "SEED_PASSWORD_GERENTE_RRHH",
    passwordDefault: "RRHH123!",
    accesoExtendido: true,
  },
  {
    email: "sig@test.local",
    nombre: "Gerente SIG (prueba)",
    rol: "gerente",
    sectorSlug: "sig-y-medio-ambiente",
    passwordEnv: "SEED_PASSWORD_GERENTE_SIG",
    passwordDefault: "Sig123!",
    accesoExtendido: true,
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
        `insert into perfil (email, password_hash, nombre, rol, sector_id, acceso_extendido)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (email) do update
           set password_hash = excluded.password_hash,
               nombre = excluded.nombre,
               rol = excluded.rol,
               sector_id = excluded.sector_id,
               acceso_extendido = excluded.acceso_extendido`,
        [u.email, passwordHash, u.nombre, u.rol, sectorId, u.accesoExtendido]
      );
      console.log(`OK: ${u.email} (${u.rol}${u.accesoExtendido ? ", acceso extendido" : ""})`);
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
