import { readdirSync, readFileSync, existsSync } from "node:fs";
import pkg from "node-sql-parser";
const { Parser } = pkg;

const parser = new Parser();

const migrationFiles = existsSync("supabase/migrations")
  ? readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => `supabase/migrations/${f}`)
  : [];

const files = [...migrationFiles, "supabase/seed.sql"].filter(existsSync);

let ok = true;
for (const file of files) {
  const sql = readFileSync(file, "utf8");
  try {
    parser.astify(sql, { database: "postgresql" });
    console.log(`OK: ${file}`);
  } catch (e) {
    console.error(`FAIL: ${file}: ${e.message}`);
    ok = false;
  }
}

if (!ok) process.exit(1);
console.log(`All ${files.length} SQL file(s) parse cleanly.`);
