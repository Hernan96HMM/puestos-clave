import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

// email -> roles esperados (rol + sectorSlug, sectorSlug null para dirección).
const EXPECTED = {
  "compras@test.local": [{ rol: "gerente", sectorSlug: "compras" }],
  "almacenes@test.local": [{ rol: "gerente", sectorSlug: "almacenes" }],
  "direccion@test.local": [{ rol: "direccion", sectorSlug: null }],
  "rrhh@test.local": [
    { rol: "gerente", sectorSlug: "recursos-humanos" },
    { rol: "direccion", sectorSlug: null },
  ],
  "sig@test.local": [
    { rol: "gerente", sectorSlug: "sig-y-medio-ambiente" },
    { rol: "direccion", sectorSlug: null },
  ],
};

function clave(roles) {
  return roles
    .map((r) => `${r.rol}:${r.sectorSlug ?? ""}`)
    .sort()
    .join(",");
}

async function main() {
  const { rows } = await pool.query(
    `select p.email, pr.rol, s.slug as sector_slug
     from perfil p
     join perfil_rol pr on pr.perfil_id = p.id
     left join sector s on s.id = pr.sector_id
     where p.email = any($1::text[])`,
    [Object.keys(EXPECTED)]
  );
  await pool.end();

  const actualPorEmail = {};
  for (const row of rows) {
    (actualPorEmail[row.email] ??= []).push({ rol: row.rol, sectorSlug: row.sector_slug });
  }

  let ok = true;
  for (const [email, esperado] of Object.entries(EXPECTED)) {
    const actual = actualPorEmail[email] ?? [];
    if (clave(actual) !== clave(esperado)) {
      console.error(`MISMATCH ${email}: expected [${clave(esperado)}], got [${clave(actual)}]`);
      ok = false;
    }
  }

  if (!ok) process.exit(1);
  console.log(`OK: roles correctos para los ${Object.keys(EXPECTED).length} perfiles de prueba.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
