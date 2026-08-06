import { readdirSync, readFileSync } from "node:fs";
import pg from "pg";

const connectionString = process.env.DATABASE_URL_OWNER;
if (!connectionString) {
  console.error("DATABASE_URL_OWNER is not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

async function ensureMigrationsTable(client) {
  await client.query(`
    create table if not exists schema_migrations (
      id serial primary key,
      filename text not null unique,
      applied_at timestamptz not null default now()
    );
  `);
}

async function getAppliedMigrations(client) {
  const { rows } = await client.query("select filename from schema_migrations");
  return new Set(rows.map((r) => r.filename));
}

async function main() {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);
    const files = readdirSync("db/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`SKIP (already applied): ${file}`);
        continue;
      }
      const sql = readFileSync(`db/migrations/${file}`, "utf8");
      console.log(`APPLYING: ${file}`);
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("insert into schema_migrations (filename) values ($1)", [file]);
        await client.query("COMMIT");
        console.log(`OK: ${file}`);
      } catch (e) {
        await client.query("ROLLBACK");
        console.error(`FAILED: ${file}`);
        console.error(e.message);
        process.exit(1);
      }
    }
    console.log("All migrations applied.");
  } finally {
    client.release();
    await pool.end();
  }
}

main();
