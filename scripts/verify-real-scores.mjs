import { readFileSync } from "node:fs";

const sql = readFileSync("db/seed.sql", "utf8");

const blockMatch = sql.match(
  /update respuesta_pregunta[\s\S]*?from \(values([\s\S]*?)\) as rs\(sector_slug, puesto_nombre, pregunta_numero, puntaje\)/
);
if (!blockMatch) {
  console.error("Could not find the real-scores values block in db/seed.sql");
  process.exit(1);
}
const block = blockMatch[1];

const rowRe = /\('([a-z0-9-]+)',\s*'([^']+)',\s*(\d+),\s*(\d+)\)/g;
const byPuesto = {};
let m;
while ((m = rowRe.exec(block))) {
  const [, sectorSlug, puestoNombre, numero, puntaje] = m;
  const key = `${sectorSlug}::${puestoNombre}`;
  (byPuesto[key] ??= []).push({ numero: Number(numero), puntaje: Number(puntaje) });
}

const pesos = { 1: 12, 2: 12, 3: 12, 4: 10, 5: 8, 6: 8, 7: 10, 8: 10, 9: 10, 10: 8 };

const expectedPct = {
  "admin-y-finanzas::Encargado de Tesorería": 71.7,
  "compras::Comprador Jr.": 64.0,
  "radiologia::Radiólogo (N1)": 82.8,
  "recursos-humanos::Responsable Administrativo de Recursos Humanos": 87.2,
  "sig-y-medio-ambiente::Asistente de Gestión de Calidad": 62.8,
};

let ok = true;
for (const [key, answers] of Object.entries(byPuesto)) {
  const num = answers.reduce((s, a) => s + pesos[a.numero] * a.puntaje, 0);
  const den = answers.reduce((s, a) => s + pesos[a.numero], 0);
  const pct = Math.round(((num / den / 5) * 100 + Number.EPSILON) * 10) / 10;
  const expected = expectedPct[key];
  if (expected === undefined) {
    console.error(`UNEXPECTED puesto in real-scores block: ${key}`);
    ok = false;
    continue;
  }
  if (pct !== expected) {
    console.error(`MISMATCH ${key}: computed ${pct}%, expected ${expected}%`);
    ok = false;
  }
}
for (const key of Object.keys(expectedPct)) {
  if (!byPuesto[key]) {
    console.error(`MISSING puesto in seed: ${key}`);
    ok = false;
  }
}

if (!ok) process.exit(1);
console.log("OK: all 5 real historical evaluations reproduce the expected weighted score.");
