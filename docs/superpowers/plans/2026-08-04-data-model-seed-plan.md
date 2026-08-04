# F-116 Puestos Clave — Phase 1: Data Model + Seed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Next.js project and build the Postgres schema + seed data (12 sectors, 76 puestos, 10-question bank, 5 real historical evaluations) for the F-116 Puestos Clave system, as plain SQL Supabase migrations.

**Architecture:** Next.js (TypeScript, App Router) project containing a `supabase/` directory with hand-written SQL migrations (no ORM) and a single `supabase/seed.sql`. Calculated fields (weighted score, clasificación, riesgo, semáforo) live in a Postgres view, never stored as columns.

**Tech Stack:** Next.js 14+ / TypeScript / Tailwind CSS (scaffold only, no UI built yet) / Supabase CLI / plain SQL / Node scripts for offline verification (`node-sql-parser`).

## Global Constraints

- 12 sectors, 76 puestos total (the source prompt says "11 sectores" but lists 12 — this is a documented typo; 12 is correct and matches the real `F116_MAESTRO_Consolidado.xlsx` totals).
- Question bank: 10 fixed questions, weights `12,12,12,10,8,8,10,10,10,8` (sum = 100), text/ref_iso taken verbatim from the source doc §2.2 (cross-checked against real Excel cells).
- Weighted score formula (reverse-engineered from `F-116_Admin_y_Finanzas.xlsx` cell `E59`): `ROUND(SUM(peso_pct * puntaje) / SUM(peso_pct) / 5 * 100, 1)`, both sums restricted to questions where `puntaje IS NOT NULL` (this is how N/A is excluded — both numerator and the weight denominator drop the N/A question, so remaining weights renormalize).
- Clasificación thresholds: `>=70` → `PUESTO CLAVE`, `50–69` → `PUESTO DE ATENCIÓN`, `<50` → `NO ES PUESTO CLAVE`. Same thresholds map to `nivel_riesgo` ALTO/MEDIO/BAJO and `semaforo` 🔴/🟡/🟢.
- `justificacion`, `evaluador`, `fecha_evaluacion` are nullable with **no DB-level constraint** tying justificación to puntaje — that rule is application-layer only (later phase). This is intentional: real historical data has puntaje ≥3 with blank justificación.
- IDs are `uuid default gen_random_uuid()`. No ORM — plain SQL migrations under `supabase/migrations/`.
- No Docker is available in this execution session. `supabase start` (which needs Docker) cannot be run here — see Task 7, which is a runbook for the user's own Docker host, not something the executing agent runs.
- No auth, RLS, or UI in this phase — those are separate later phases per the source prompt's own phase plan.

---

### Task 1: Scaffold the Next.js project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `app/` (via `create-next-app`)
- Modify: `.gitignore` (create-next-app writes its own; verify it covers `node_modules/`, `.next/`, `.env*.local`)

**Interfaces:**
- Produces: a working `npm run build` / `npm run dev` Next.js app that later tasks add `supabase/` alongside.

- [ ] **Step 1: Run create-next-app in the existing project directory**

```bash
cd "f:/Proyectos Sica/puestos-clave"
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

When prompted about the directory not being empty, proceed — the only existing entries are `PROMPT_Claude_Code_SICA_F116.md`, `docs/`, `.git/`, and the `OneDrive_2026-07-31/` folder with the source Excels, none of which conflict with the scaffold.

- [ ] **Step 2: Verify the scaffold builds**

Run: `npm run build`
Expected: build succeeds, prints a route summary (e.g. `○ /`) with no errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js project (TypeScript, Tailwind, App Router)"
```

---

### Task 2: Initialize Supabase CLI config + offline SQL verification tooling

**Files:**
- Create: `supabase/config.toml` (via `supabase init`)
- Create: `scripts/lint-sql.mjs`
- Modify: `package.json` (add `node-sql-parser` devDependency, add `lint:sql` script)

**Interfaces:**
- Produces: `npm run lint:sql` — astifies every `.sql` file under `supabase/migrations/` plus `supabase/seed.sql` with `node-sql-parser` (dialect `postgresql`) and fails on any syntax error. This is the offline substitute for a live DB round-trip, since Docker isn't available in this session.

- [ ] **Step 1: Initialize the Supabase project config (no Docker required for `init`)**

```bash
npx supabase@2.111.0 init
```

Expected: creates `supabase/config.toml` and `supabase/.gitignore`. Confirm `supabase/migrations/` directory exists (create it manually with a `.gitkeep` if `init` doesn't).

- [ ] **Step 2: Install the offline SQL parser**

```bash
npm install -D node-sql-parser@5.4.0
```

- [ ] **Step 3: Write the lint script**

Create `scripts/lint-sql.mjs`:

```js
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { Parser } from "node-sql-parser";

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
```

- [ ] **Step 4: Add the npm script**

In `package.json`, add to `"scripts"`:

```json
"lint:sql": "node scripts/lint-sql.mjs"
```

- [ ] **Step 5: Run it against the empty seed/migrations (expect failure — files don't exist yet)**

Run: `npm run lint:sql`
Expected: FAIL, because `supabase/seed.sql` doesn't exist yet (`existsSync` filter means this actually just prints "All 0 SQL file(s) parse cleanly." if seed.sql is absent — confirm behavior matches: since seed.sql doesn't exist it's filtered out too, so this should print `All 0 SQL file(s) parse cleanly.` and exit 0). This step is just to confirm the script runs without crashing before there's real SQL to check.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json supabase/config.toml supabase/.gitignore scripts/lint-sql.mjs
git commit -m "chore: add Supabase CLI config and offline SQL lint script"
```

---

### Task 3: Migration — core schema tables

**Files:**
- Create: `supabase/migrations/20260804120000_create_schema.sql`

**Interfaces:**
- Produces: tables `sector`, `puesto`, `pregunta`, `evaluacion`, `respuesta_pregunta` exactly as specified in the design spec's Schema section — later tasks (view, seed) depend on these exact table/column names.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260804120000_create_schema.sql`:

```sql
create extension if not exists pgcrypto with schema extensions;

create table sector (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text not null unique,
  orden int not null
);

create table puesto (
  id uuid primary key default gen_random_uuid(),
  sector_id uuid not null references sector (id) on delete cascade,
  nombre text not null,
  orden int not null
);

create table pregunta (
  id uuid primary key default gen_random_uuid(),
  numero int not null unique,
  texto text not null,
  ref_iso text not null,
  peso_pct numeric not null
);

create table evaluacion (
  id uuid primary key default gen_random_uuid(),
  puesto_id uuid not null unique references puesto (id) on delete cascade,
  evaluador text,
  fecha_evaluacion date,
  validacion_direccion text not null default 'pendiente'
    check (validacion_direccion in ('pendiente', 'aprobado', 'observado')),
  actualizado_en timestamptz not null default now()
);

create table respuesta_pregunta (
  id uuid primary key default gen_random_uuid(),
  evaluacion_id uuid not null references evaluacion (id) on delete cascade,
  pregunta_id uuid not null references pregunta (id) on delete cascade,
  puntaje int check (puntaje between 0 and 5),
  justificacion text,
  unique (evaluacion_id, pregunta_id)
);
```

- [ ] **Step 2: Verify it parses**

Run: `npm run lint:sql`
Expected: `OK: supabase/migrations/20260804120000_create_schema.sql` printed, exit code 0 (seed.sql still doesn't exist so it's skipped).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260804120000_create_schema.sql
git commit -m "feat: add core schema migration (sector, puesto, pregunta, evaluacion, respuesta_pregunta)"
```

---

### Task 4: Migration — calculated view

**Files:**
- Create: `supabase/migrations/20260804120100_create_vista_evaluacion_calculada.sql`

**Interfaces:**
- Consumes: tables from Task 3 (`evaluacion`, `puesto`, `respuesta_pregunta`, `pregunta`).
- Produces: view `vista_evaluacion_calculada` with columns `evaluacion_id, puesto_id, sector_id, puesto_nombre, evaluador, fecha_evaluacion, validacion_direccion, puntaje_ponderado_pct, clasificacion, nivel_riesgo, semaforo` — later phases (dashboard, sector views) query this view directly instead of recomputing scores.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260804120100_create_vista_evaluacion_calculada.sql`:

```sql
create view vista_evaluacion_calculada as
with base as (
  select
    e.id as evaluacion_id,
    e.puesto_id,
    p.sector_id,
    p.nombre as puesto_nombre,
    e.evaluador,
    e.fecha_evaluacion,
    e.validacion_direccion,
    round(
      coalesce(
        sum(pr.peso_pct * rp.puntaje) filter (where rp.puntaje is not null)
          / nullif(sum(pr.peso_pct) filter (where rp.puntaje is not null), 0)
          / 5 * 100,
        0
      ),
      1
    ) as puntaje_ponderado_pct
  from evaluacion e
  join puesto p on p.id = e.puesto_id
  left join respuesta_pregunta rp on rp.evaluacion_id = e.id
  left join pregunta pr on pr.id = rp.pregunta_id
  group by e.id, p.sector_id, p.nombre, e.evaluador, e.fecha_evaluacion, e.validacion_direccion
)
select
  *,
  case
    when puntaje_ponderado_pct >= 70 then 'PUESTO CLAVE'
    when puntaje_ponderado_pct >= 50 then 'PUESTO DE ATENCIÓN'
    else 'NO ES PUESTO CLAVE'
  end as clasificacion,
  case
    when puntaje_ponderado_pct >= 70 then 'ALTO'
    when puntaje_ponderado_pct >= 50 then 'MEDIO'
    else 'BAJO'
  end as nivel_riesgo,
  case
    when puntaje_ponderado_pct >= 70 then '🔴'
    when puntaje_ponderado_pct >= 50 then '🟡'
    else '🟢'
  end as semaforo
from base;
```

- [ ] **Step 2: Verify it parses**

Run: `npm run lint:sql`
Expected: both migration files print `OK:`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260804120100_create_vista_evaluacion_calculada.sql
git commit -m "feat: add vista_evaluacion_calculada view for weighted score/clasificacion/riesgo/semaforo"
```

---

### Task 5: Seed — sectors, puestos, question bank, blank evaluaciones

**Files:**
- Create: `supabase/seed.sql`
- Create: `scripts/verify-seed-counts.mjs`
- Modify: `package.json` (add `verify:seed-counts` script)

**Interfaces:**
- Consumes: tables from Task 3.
- Produces: 12 rows in `sector`, 76 rows in `puesto`, 10 rows in `pregunta`, 76 rows in `evaluacion` (all `validacion_direccion = 'pendiente'`), 760 rows in `respuesta_pregunta` (all `puntaje` null) — Task 6 updates a subset of these 760 rows in place.

- [ ] **Step 1: Write the seed file**

Create `supabase/seed.sql`:

```sql
-- 1. Sectores (12 total; the source doc's "11 sectores" is a typo — it lists 12).
insert into sector (nombre, slug, orden) values
('Admin. y Finanzas', 'admin-y-finanzas', 1),
('Compras', 'compras', 2),
('Comercial', 'comercial', 3),
('Control de Calidad', 'control-de-calidad', 4),
('Ingeniería', 'ingenieria', 5),
('Mantenimiento', 'mantenimiento', 6),
('Obras', 'obras', 7),
('Planificación Operativa', 'planificacion-operativa', 8),
('Radiología', 'radiologia', 9),
('Recursos Humanos', 'recursos-humanos', 10),
('SIG y Medio Ambiente', 'sig-y-medio-ambiente', 11),
('Almacenes', 'almacenes', 12);

-- 2. Puestos (76 total, exact names/order from the source doc).
insert into puesto (sector_id, nombre, orden)
select s.id, v.nombre, v.orden
from (values
  ('admin-y-finanzas', 'Responsable de Administración', 1),
  ('admin-y-finanzas', 'Contador Sr.', 2),
  ('admin-y-finanzas', 'Encargada de Facturación y Cobranza', 3),
  ('admin-y-finanzas', 'Encargado de Tesorería', 4),
  ('admin-y-finanzas', 'Auxiliar de Administración', 5),
  ('admin-y-finanzas', 'Auxiliar de Administración 2', 6),

  ('compras', 'Comprador Sr.', 1),
  ('compras', 'Comprador Jr.', 2),

  ('comercial', 'Responsable Comercial Unidad de Negocios Oil & Gas', 1),
  ('comercial', 'Responsable Comercial Unidad de Negocios GLP y Gases del Aire', 2),
  ('comercial', 'Ingeniero Comercial Unidad de Negocios Internacionales', 3),
  ('comercial', 'Ing. de Presupuesto', 4),
  ('comercial', 'Encargado de Presupuesto', 5),
  ('comercial', 'Analista de Comercial y Presupuesto', 6),

  ('control-de-calidad', 'Responsable Control de Calidad', 1),
  ('control-de-calidad', 'Asistente Administrativo Calidad', 2),
  ('control-de-calidad', 'Inspector de Soldadura', 3),
  ('control-de-calidad', 'Inspector Senior', 4),
  ('control-de-calidad', 'Inspector Semi Senior', 5),
  ('control-de-calidad', 'Inspector Junior', 6),
  ('control-de-calidad', 'Inspector Talleres externos', 7),
  ('control-de-calidad', 'Responsable de Radiología (N2)', 8),
  ('control-de-calidad', 'Radiólogo (N1)', 9),
  ('control-de-calidad', 'Operador autorizado', 10),
  ('control-de-calidad', 'Ayudante de Radiología', 11),

  ('ingenieria', 'Responsable de diseño mecánico y de equipos móviles', 1),
  ('ingenieria', 'Responsable de ingeniería de obras', 2),
  ('ingenieria', 'Responsable de Instrumentación y Electricidad', 3),
  ('ingenieria', 'Responsable de Ingeniería de Equipos Oil & Gas y Especiales', 4),
  ('ingenieria', 'Proyectista Senior', 5),
  ('ingenieria', 'Instrumentista industrial', 6),
  ('ingenieria', 'Ingeniero de Procesos', 7),
  ('ingenieria', 'Proyectista Sr.', 8),
  ('ingenieria', 'Asistente de Documentación', 9),
  ('ingenieria', 'Auxiliar de Instrumentación', 10),

  ('mantenimiento', 'Auxiliar Administrativo de Mantenimiento - Senior', 1),
  ('mantenimiento', 'Auxiliar Administrativo de Mantenimiento - Junior', 2),
  ('mantenimiento', 'Mantenimiento Eléctrico', 3),
  ('mantenimiento', 'Mantenimiento Mecánico de Vehículo', 4),
  ('mantenimiento', 'Mantenimiento Mecánico', 5),
  ('mantenimiento', 'Tornero', 6),
  ('mantenimiento', 'Operario de Mantenimiento electromecánico', 7),

  ('obras', 'Coordinador de Obras', 1),
  ('obras', 'Operario Calificado de Obras', 2),
  ('obras', 'Ayudante Calificado de Obras', 3),

  ('planificacion-operativa', 'Jefe Calderería', 1),
  ('planificacion-operativa', 'Jefe de Pintura y Montaje', 2),
  ('planificacion-operativa', 'Encargado de Producción de Equipos móviles', 3),
  ('planificacion-operativa', 'Encargado de Tanques en serie', 4),
  ('planificacion-operativa', 'Encargado de Obras', 5),
  ('planificacion-operativa', 'Encargado de Mantenimiento Mecánico y Eléctrico', 6),
  ('planificacion-operativa', 'Auxiliar Administrativo de Mantenimiento', 7),
  ('planificacion-operativa', 'Auxiliar Administrativo de Producción', 8),
  ('planificacion-operativa', 'Analista Programador Cortes', 9),
  ('planificacion-operativa', 'Encargado de Almacenes', 10),
  ('planificacion-operativa', 'Líder de Proyecto', 11),

  ('radiologia', 'Radiólogo (N1)', 1),
  ('radiologia', 'Operador autorizado', 2),
  ('radiologia', 'Ayudante de Radiología', 3),

  ('recursos-humanos', 'Responsable Administrativo de Recursos Humanos', 1),
  ('recursos-humanos', 'Generalista de Recursos Humanos', 2),
  ('recursos-humanos', 'Encargado de Guardia', 3),
  ('recursos-humanos', 'Personal de Guardia (Turnos rotativos)', 4),
  ('recursos-humanos', 'Personal de Maestranza', 5),

  ('sig-y-medio-ambiente', 'Asistente de Gestión de Calidad', 1),
  ('sig-y-medio-ambiente', 'Asistente de Higiene y Seguridad Ocupacional', 2),
  ('sig-y-medio-ambiente', 'Responsable externo de Higiene y seguridad ocupacional', 3),
  ('sig-y-medio-ambiente', 'Asistente de Sistema Informático', 4),
  ('sig-y-medio-ambiente', 'Analista Funcional de Sistema informático', 5),
  ('sig-y-medio-ambiente', 'Responsable de Medicina Laboral', 6),
  ('sig-y-medio-ambiente', 'Servicio Médico de la Empresa', 7),
  ('sig-y-medio-ambiente', 'Servicio Medio Ambiental', 8),

  ('almacenes', 'Responsable de Almacenes', 1),
  ('almacenes', 'Auxiliar de Recepción de Materiales', 2),
  ('almacenes', 'Auxiliar Operativo de Almacén', 3),
  ('almacenes', 'Servicio de Cadetería', 4)
) as v(sector_slug, nombre, orden)
join sector s on s.slug = v.sector_slug;

-- 3. Banco de preguntas (10 fijas, peso suma 100).
insert into pregunta (numero, texto, ref_iso, peso_pct) values
(1, 'Impacto del puesto en la toma de decisiones y en los resultados (financieros, de procesos o de clima laboral).', '5.1.1 / 9.1.3', 12),
(2, 'Nivel de criticidad del rol: dependencia de otras áreas y capacidad de destrabar procesos.', '4.4 / 8.1', 12),
(3, 'Complejidad y tiempo de aprendizaje del conocimiento requerido (escasez en el mercado, curva de aprendizaje).', '7.1.6', 12),
(4, 'Impacto estratégico en el negocio: incidencia directa en clientes, costos o resultados.', '5.1.1 / 6.1', 10),
(5, 'Valor agregado de las competencias específicas del puesto al proceso.', '7.2', 8),
(6, 'Alineación con el futuro del negocio (digitalización, profesionalización, expansión).', '6.3', 8),
(7, 'Disponibilidad de reemplazo interno o polivalencia para cubrir el puesto.', '7.1.2', 10),
(8, 'Riesgo de impacto operativo inmediato ante una ausencia o desvinculación inesperada.', '6.1', 10),
(9, 'Requiere una matrícula profesional, certificación técnica o habilitación específica que no cualquier persona del mercado posee.', '7.2 / 8.1', 10),
(10, 'Interactúa con partes interesadas externas críticas (clientes, proveedores estratégicos, organismos de control) cuya gestión inadecuada afecta el cumplimiento o la relación.', '4.2 / 9.2', 8);

-- 4. Evaluaciones: una por puesto, en blanco.
insert into evaluacion (puesto_id)
select id from puesto;

-- 5. Respuesta_pregunta: una por (evaluacion, pregunta), puntaje en blanco (null = N/A hasta que se responda).
insert into respuesta_pregunta (evaluacion_id, pregunta_id)
select e.id, pr.id
from evaluacion e
cross join pregunta pr;
```

- [ ] **Step 2: Verify it parses**

Run: `npm run lint:sql`
Expected: `OK: supabase/seed.sql` printed alongside the two migrations.

- [ ] **Step 3: Write the row-count verification script**

Create `scripts/verify-seed-counts.mjs`:

```js
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
```

- [ ] **Step 4: Add the npm script and run it**

In `package.json`, add to `"scripts"`:

```json
"verify:seed-counts": "node scripts/verify-seed-counts.mjs"
```

Run: `npm run verify:seed-counts`
Expected: `OK: 76 puestos across 12 sectors match expected counts.`

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql scripts/verify-seed-counts.mjs package.json
git commit -m "feat: seed sectors, puestos, question bank, and blank evaluaciones"
```

---

### Task 6: Seed — real historical evaluations

**Files:**
- Modify: `supabase/seed.sql` (append)
- Create: `scripts/verify-real-scores.mjs`
- Modify: `package.json` (add `verify:real-scores` script)

**Interfaces:**
- Consumes: the blank `respuesta_pregunta` rows from Task 5.
- Produces: 5 puestos with real `puntaje` values in place of nulls, reproducing the exact `puntaje_ponderado_pct` values found in the real Excel files.

- [ ] **Step 1: Append the historical data update to the seed file**

Append to `supabase/seed.sql`:

```sql
-- 6. Datos históricos reales (5 puestos ya evaluados en los Excel de origen).
-- evaluador, fecha_evaluacion y justificacion quedan en null: así están en el
-- Excel real para estos 5 puestos, y la regla "justificación obligatoria si
-- puntaje >= 3" es una validación de aplicación, no una restricción de la base.
update respuesta_pregunta rp
set puntaje = rs.puntaje
from (values
  ('admin-y-finanzas', 'Encargado de Tesorería', 1, 5),
  ('admin-y-finanzas', 'Encargado de Tesorería', 2, 3),
  ('admin-y-finanzas', 'Encargado de Tesorería', 3, 4),
  ('admin-y-finanzas', 'Encargado de Tesorería', 4, 3),
  ('admin-y-finanzas', 'Encargado de Tesorería', 5, 1),
  ('admin-y-finanzas', 'Encargado de Tesorería', 6, 4),
  ('admin-y-finanzas', 'Encargado de Tesorería', 7, 5),
  ('admin-y-finanzas', 'Encargado de Tesorería', 8, 3),

  ('compras', 'Comprador Jr.', 1, 4),
  ('compras', 'Comprador Jr.', 2, 3),
  ('compras', 'Comprador Jr.', 3, 3),
  ('compras', 'Comprador Jr.', 4, 3),
  ('compras', 'Comprador Jr.', 5, 4),
  ('compras', 'Comprador Jr.', 6, 3),
  ('compras', 'Comprador Jr.', 7, 3),
  ('compras', 'Comprador Jr.', 8, 3),
  ('compras', 'Comprador Jr.', 9, 3),
  ('compras', 'Comprador Jr.', 10, 3),

  ('radiologia', 'Radiólogo (N1)', 1, 5),
  ('radiologia', 'Radiólogo (N1)', 2, 4),
  ('radiologia', 'Radiólogo (N1)', 3, 4),
  ('radiologia', 'Radiólogo (N1)', 4, 4),
  ('radiologia', 'Radiólogo (N1)', 5, 5),
  ('radiologia', 'Radiólogo (N1)', 6, 5),
  ('radiologia', 'Radiólogo (N1)', 7, 5),
  ('radiologia', 'Radiólogo (N1)', 8, 5),
  ('radiologia', 'Radiólogo (N1)', 9, 3),
  ('radiologia', 'Radiólogo (N1)', 10, 1),

  ('recursos-humanos', 'Responsable Administrativo de Recursos Humanos', 1, 4),
  ('recursos-humanos', 'Responsable Administrativo de Recursos Humanos', 2, 4),
  ('recursos-humanos', 'Responsable Administrativo de Recursos Humanos', 3, 4),
  ('recursos-humanos', 'Responsable Administrativo de Recursos Humanos', 4, 4),
  ('recursos-humanos', 'Responsable Administrativo de Recursos Humanos', 5, 5),
  ('recursos-humanos', 'Responsable Administrativo de Recursos Humanos', 6, 5),
  ('recursos-humanos', 'Responsable Administrativo de Recursos Humanos', 7, 5),
  ('recursos-humanos', 'Responsable Administrativo de Recursos Humanos', 8, 5),
  ('recursos-humanos', 'Responsable Administrativo de Recursos Humanos', 9, 4),
  ('recursos-humanos', 'Responsable Administrativo de Recursos Humanos', 10, 4),

  ('sig-y-medio-ambiente', 'Asistente de Gestión de Calidad', 1, 3),
  ('sig-y-medio-ambiente', 'Asistente de Gestión de Calidad', 2, 4),
  ('sig-y-medio-ambiente', 'Asistente de Gestión de Calidad', 3, 3),
  ('sig-y-medio-ambiente', 'Asistente de Gestión de Calidad', 4, 3),
  ('sig-y-medio-ambiente', 'Asistente de Gestión de Calidad', 5, 4),
  ('sig-y-medio-ambiente', 'Asistente de Gestión de Calidad', 6, 2),
  ('sig-y-medio-ambiente', 'Asistente de Gestión de Calidad', 7, 3),
  ('sig-y-medio-ambiente', 'Asistente de Gestión de Calidad', 8, 3),
  ('sig-y-medio-ambiente', 'Asistente de Gestión de Calidad', 9, 4),
  ('sig-y-medio-ambiente', 'Asistente de Gestión de Calidad', 10, 2)
) as rs(sector_slug, puesto_nombre, pregunta_numero, puntaje)
join sector s on s.slug = rs.sector_slug
join puesto p on p.sector_id = s.id and p.nombre = rs.puesto_nombre
join evaluacion e on e.puesto_id = p.id
join pregunta pr on pr.numero = rs.pregunta_numero
where rp.evaluacion_id = e.id and rp.pregunta_id = pr.id;
```

Note: Encargado de Tesorería only has 8 rows (questions 9 and 10 stay null/N/A, matching the real Excel exactly).

- [ ] **Step 2: Verify it parses**

Run: `npm run lint:sql`
Expected: `OK: supabase/seed.sql` still prints (parser re-checks the whole file, including the appended `UPDATE`).

- [ ] **Step 3: Write the real-scores verification script**

Create `scripts/verify-real-scores.mjs`:

```js
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/seed.sql", "utf8");

const blockMatch = sql.match(
  /from \(values([\s\S]*?)\) as rs\(sector_slug, puesto_nombre, pregunta_numero, puntaje\)/
);
if (!blockMatch) {
  console.error("Could not find the real-scores values block in supabase/seed.sql");
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
```

- [ ] **Step 4: Add the npm script and run it**

In `package.json`, add to `"scripts"`:

```json
"verify:real-scores": "node scripts/verify-real-scores.mjs"
```

Run: `npm run verify:real-scores`
Expected: `OK: all 5 real historical evaluations reproduce the expected weighted score.`

- [ ] **Step 5: Commit**

```bash
git add supabase/seed.sql scripts/verify-real-scores.mjs package.json
git commit -m "feat: import 5 real historical evaluations from source Excels"
```

---

### Task 7: Docker verification runbook (manual — run on your Docker host, not in this session)

**Files:**
- Create: `docs/superpowers/plans/2026-08-04-docker-verification-runbook.md`

**Interfaces:**
- Consumes: everything from Tasks 1–6, once pulled onto a machine with Docker running.
- Produces: nothing new in the repo besides the runbook doc — this task is documentation, not code, because this session has no Docker to execute the commands itself.

- [ ] **Step 1: Write the runbook**

Create `docs/superpowers/plans/2026-08-04-docker-verification-runbook.md`:

```markdown
# Docker verification runbook — Phase 1 (data model + seed)

Run this on a machine with Docker running, after pulling the repo.

## 1. Apply migrations + seed to a local Supabase instance

    npx supabase start
    npx supabase db reset

`db reset` applies every file in `supabase/migrations/` in order, then runs
`supabase/seed.sql`.

## 2. Acceptance queries

Connect with `npx supabase db psql` (or any Postgres client on the printed
local connection string) and run:

    select count(*) from sector;              -- expect 12
    select count(*) from puesto;               -- expect 76
    select count(*) from pregunta;              -- expect 10
    select count(*) from evaluacion;            -- expect 76
    select count(*) from respuesta_pregunta;    -- expect 760

    select clasificacion, count(*)
    from vista_evaluacion_calculada
    group by clasificacion
    order by clasificacion;
    -- expect: NO ES PUESTO CLAVE = 71, PUESTO CLAVE = 3, PUESTO DE ATENCIÓN = 2

    select puesto_nombre, puntaje_ponderado_pct, clasificacion, nivel_riesgo, semaforo
    from vista_evaluacion_calculada
    where puntaje_ponderado_pct > 0
    order by puntaje_ponderado_pct desc;
    -- expect exactly these 5 rows:
    --   Responsable Administrativo de Recursos Humanos | 87.2 | PUESTO CLAVE        | ALTO  | 🔴
    --   Radiólogo (N1)                                  | 82.8 | PUESTO CLAVE        | ALTO  | 🔴
    --   Encargado de Tesorería                          | 71.7 | PUESTO CLAVE        | ALTO  | 🔴
    --   Comprador Jr.                                   | 64.0 | PUESTO DE ATENCIÓN  | MEDIO | 🟡
    --   Asistente de Gestión de Calidad                 | 62.8 | PUESTO DE ATENCIÓN  | MEDIO | 🟡

    select s.nombre as sector, count(*) as evaluados,
      count(*) filter (where v.clasificacion = 'PUESTO CLAVE') as clave,
      count(*) filter (where v.clasificacion = 'PUESTO DE ATENCIÓN') as atencion,
      count(*) filter (where v.clasificacion = 'NO ES PUESTO CLAVE') as no_clave
    from vista_evaluacion_calculada v
    join sector s on s.id = v.sector_id
    group by s.nombre
    order by s.nombre;
    -- must match F116_MAESTRO_Consolidado.xlsx "RESUMEN POR SECTOR" exactly:
    --   Admin. y Finanzas        | 6  | 1 | 0 | 5
    --   Almacenes                | 4  | 0 | 0 | 4
    --   Comercial                | 6  | 0 | 0 | 6
    --   Compras                  | 2  | 0 | 1 | 1
    --   Control de Calidad       | 11 | 0 | 0 | 11
    --   Ingeniería                | 10 | 0 | 0 | 10
    --   Mantenimiento            | 7  | 0 | 0 | 7
    --   Obras                    | 3  | 0 | 0 | 3
    --   Planificación Operativa  | 11 | 0 | 0 | 11
    --   Radiología                | 3  | 1 | 0 | 2
    --   Recursos Humanos         | 5  | 1 | 0 | 4
    --   SIG y Medio Ambiente     | 8  | 0 | 1 | 7

If any count or value differs from what's listed above, something in the
migrations or seed regressed — do not proceed to the auth/UI phases until
this matches exactly, since later phases build on this data.

## 3. Tear down

    npx supabase stop
```

- [ ] **Step 2: Commit**

```bash
git add "docs/superpowers/plans/2026-08-04-docker-verification-runbook.md"
git commit -m "docs: add Docker verification runbook for phase 1 acceptance queries"
```

---

### Task 8: Push to GitHub

**Files:**
- None (git remote configuration only)

**Interfaces:** none — this is the handoff point to the user's Docker host.

- [ ] **Step 1: Get the repo URL**

If not already provided in this conversation, ask the user for the empty GitHub repo URL they created (https or git@ form).

- [ ] **Step 2: Add the remote and push**

```bash
git remote add origin <URL_PROVIDED_BY_USER>
git branch -M main
git push -u origin main
```

- [ ] **Step 3: Confirm**

Run: `git remote -v` and `git log --oneline -1`
Expected: `origin` points at the provided URL, and the push output shows the branch is up to date with `origin/main`.

Tell the user: repo is pushed, now `git pull` on the Docker host and follow `docs/superpowers/plans/2026-08-04-docker-verification-runbook.md` (Task 7) to apply and verify.
