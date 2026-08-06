import { readdirSync, readFileSync, existsSync } from "node:fs";
import { parse } from "libpg-query";

const migrationFiles = existsSync("db/migrations")
  ? readdirSync("db/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => `db/migrations/${f}`)
  : [];

const files = [...migrationFiles, "db/seed.sql"].filter(existsSync);

let ok = true;
for (const file of files) {
  const sql = readFileSync(file, "utf8");
  try {
    await parse(sql);
    console.log(`OK: ${file}`);
  } catch (e) {
    console.error(`FAIL: ${file}: ${e.message}`);
    ok = false;
  }
}

if (!ok) process.exit(1);
console.log(`All ${files.length} SQL file(s) parse cleanly.`);
