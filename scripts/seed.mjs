import { readFileSync } from "node:fs";
import pg from "pg";

const connectionString = process.env.DATABASE_URL_OWNER;
if (!connectionString) {
  console.error("DATABASE_URL_OWNER is not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

async function main() {
  const sql = readFileSync("db/seed.sql", "utf8");
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log("Seed applied.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
