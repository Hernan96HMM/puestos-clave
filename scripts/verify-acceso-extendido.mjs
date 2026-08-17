import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

const EXPECTED = ["rrhh@test.local", "sig@test.local"];

async function main() {
  const { rows } = await pool.query(
    "select email from perfil where acceso_extendido = true order by email"
  );
  await pool.end();

  const actual = rows.map((r) => r.email).sort();
  const expected = [...EXPECTED].sort();

  if (actual.length !== expected.length || !actual.every((e, i) => e === expected[i])) {
    console.error(`MISMATCH: expected acceso_extendido=true for [${expected.join(", ")}], got [${actual.join(", ")}]`);
    process.exit(1);
  }

  console.log(`OK: acceso_extendido=true for exactly [${actual.join(", ")}].`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
