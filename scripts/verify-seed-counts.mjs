import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/seed.sql", "utf8");

const blockMatch = sql.match(
  /insert into puesto[\s\S]*?\) as v\(sector_slug, nombre, orden\)/
);
if (!blockMatch) {
  console.error("Could not find the puesto insert block in supabase/seed.sql");
  process.exit(1);
}
const block = blockMatch[0];

const rowRe = /\('([a-z0-9-]+)',\s*'([^']+)',\s*(\d+)\)/g;
const counts = {};
let total = 0;
let m;
while ((m = rowRe.exec(block))) {
  const slug = m[1];
  counts[slug] = (counts[slug] ?? 0) + 1;
  total++;
}

const expected = {
  "admin-y-finanzas": 6,
  compras: 2,
  comercial: 6,
  "control-de-calidad": 11,
  ingenieria: 10,
  mantenimiento: 7,
  obras: 3,
  "planificacion-operativa": 11,
  radiologia: 3,
  "recursos-humanos": 5,
  "sig-y-medio-ambiente": 8,
  almacenes: 4,
};
const expectedTotal = Object.values(expected).reduce((a, b) => a + b, 0);

let ok = true;
for (const [slug, count] of Object.entries(expected)) {
  if (counts[slug] !== count) {
    console.error(`MISMATCH ${slug}: expected ${count}, got ${counts[slug] ?? 0}`);
    ok = false;
  }
}
for (const slug of Object.keys(counts)) {
  if (!(slug in expected)) {
    console.error(`UNEXPECTED sector slug in seed: ${slug}`);
    ok = false;
  }
}
if (total !== expectedTotal) {
  console.error(`TOTAL MISMATCH: expected ${expectedTotal}, got ${total}`);
  ok = false;
}

if (!ok) process.exit(1);
console.log(`OK: ${total} puestos across ${Object.keys(expected).length} sectors match expected counts.`);
