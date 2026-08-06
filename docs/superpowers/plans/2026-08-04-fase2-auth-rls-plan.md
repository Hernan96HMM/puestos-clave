# F-116 Puestos Clave — Phase 2: Auth + Roles + RLS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Self-hosted login (Auth.js v5, Credentials) with real Postgres RLS (no Supabase), a containerized Next.js app, and enough frontend to prove a gerente can write to their own sector and gets rejected **in the database** writing to another.

**Architecture:** Plain SQL migrations (no ORM) evolve the Fase 1 schema to add `perfil` and `validacion_puesto`, move `validacion_direccion` out of `evaluacion`, create a restricted `puestos_clave_app` Postgres role, and enable RLS keyed on `set_config`/`current_setting` session variables set per-request by a `withUserContext` transaction helper. Auth.js issues JWT sessions; a Node-runtime `authorize()` checks `bcryptjs` hashes against `perfil`. The app runs in Docker (own Postgres, no shared network) behind the host's existing Nginx (documented, not edited live).

**Tech Stack:** Next.js 16 (App Router, `src/` dir) + TypeScript, `pg` (node-postgres) direct — no ORM, `next-auth@5` (Auth.js v5, Credentials provider, JWT strategy), `bcryptjs`, Docker multi-stage build, `postgres:17` image.

## Global Constraints

- Two Postgres roles, never conflated: `puestos_clave_owner` (runs `migrate.mjs`, `seed.mjs`, `set-app-role-password.mjs`, `seed-users.mjs`, via `DATABASE_URL_OWNER`) and `puestos_clave_app` (Next.js runtime + `verify-rls.mjs`, via `DATABASE_URL`, created **without `BYPASSRLS`**).
- `puestos_clave_app`'s grants on `evaluacion`, `respuesta_pregunta`, `validacion_puesto` are **`select, update` only — no `insert`, no `delete`**. Fase 1's design is explicit that the form does `UPDATE` on pre-seeded rows, never `INSERT`. If you find a reason `INSERT` is needed, stop and ask — do not add it.
- RLS write policies are **`for update`, not `for all`** — `evaluacion_write`, `respuesta_pregunta_write`, `validacion_puesto_write` all follow this, matching the GRANT's minimum privilege.
- Migration order matters: `vista_evaluacion_calculada` (Fase 1) selects `e.validacion_direccion` directly — that column cannot be dropped until the view stops referencing it. Order is: 0003 (new tables, doesn't touch `evaluacion`/view) → 0004 (`create or replace view`, joins `validacion_puesto` instead, drops the view's dependency on the column) → 0005 (migrate data, then drop the column) → 0006 (app role + grants) → 0007 (enable RLS + policies).
- `create or replace view` does **not** inherit `with (security_invoker = true)` from the prior version — migration 0004 must specify it again explicitly in the same statement.
- Password hashing: **`bcryptjs`** (pure JS), cost factor `10`, in both `authorize()` and `scripts/seed-users.mjs` — same library, same cost, so hashes are comparable.
- No ORM — `pg` directly for all reads and writes (Fase 1 already established "no ORM, plain SQL" and no ORM is installed).
- `sector`, `puesto`, `pregunta`: no RLS — reference data, protected by the app role simply never being granted `insert`/`update`/`delete` on them.
- Docker: `postgres:17`, `node:22-alpine`. The `postgres` service does **not** join the `sicalab_default` network (this project doesn't call other projects' containers — see spec §Context). It publishes `127.0.0.1:55432:5432` to the host **on loopback only** so the host-run deploy scripts (`migrate.mjs`, `seed.mjs`, `set-app-role-password.mjs`, `seed-users.mjs`) can reach it — never bound to a public interface. The `app` service publishes `8097:3000` (next unused port in the sequence after `8095`/`8096`/`3002` used by sibling SICA projects).
- `next.config.ts` needs `output: 'standalone'` for the Docker multi-stage build's runtime stage to work.
- Project uses Next.js's `src/` directory convention (`create-next-app --src-dir`, import alias `@/*` → `./src/*`) — new app code goes under `src/`, matching what Fase 1 already scaffolded.
- No Docker is available in this execution environment (same constraint as Fase 1). Tasks 1–17 produce and statically verify code (SQL syntax via `npm run lint:sql`, TypeScript via `npx tsc --noEmit`, JS syntax via `node --check`, YAML syntax via Python's `yaml` module). `verify:rls` and the full runbook only get a real run against live Postgres on the user's Docker host, documented as the final manual step (Task 18's runbook).
- **Checkpoint after Task 6:** per the user's explicit instruction, stop and report results after the restructuring + all 5 new migrations (0003–0007) are done, before continuing to the DB client library, Auth.js, seed scripts, Docker/Nginx, and frontend tasks.

---

### Task 1: Restructure `supabase/` → `db/`, add `migrate.mjs`

**Files:**
- Create: `db/migrations/0001_create_schema.sql` (moved from `supabase/migrations/20260804120000_create_schema.sql`, content unchanged)
- Create: `db/migrations/0002_create_vista_evaluacion_calculada.sql` (moved from `supabase/migrations/20260804120100_create_vista_evaluacion_calculada.sql`, content unchanged)
- Create: `db/seed.sql` (moved from `supabase/seed.sql`, content unchanged)
- Create: `scripts/migrate.mjs`
- Delete: `supabase/` (entire directory — `config.toml`, `.gitignore`, `migrations/`, and the old `seed.sql` all go)
- Modify: `scripts/lint-sql.mjs` (paths `supabase/migrations` → `db/migrations`, `supabase/seed.sql` → `db/seed.sql`)
- Modify: `scripts/verify-seed-counts.mjs` (path `supabase/seed.sql` → `db/seed.sql`, in both the `readFileSync` call and the error message)
- Modify: `scripts/verify-real-scores.mjs` (path `supabase/seed.sql` → `db/seed.sql`, in both the `readFileSync` call and the error message)
- Modify: `package.json` (remove `"supabase": "2.111.0"` from `devDependencies`; add `"db:migrate": "node scripts/migrate.mjs"` to `scripts`)

**Interfaces:**
- Produces: `db/migrations/*.sql` (numbered `0001`–`0002` from this task; later tasks add `0003`–`0007`), `db/seed.sql`, and a `schema_migrations` tracking table (created by `migrate.mjs` itself on first run) — all later DB-touching tasks read from `db/migrations/`, not `supabase/migrations/`.

- [ ] **Step 1: Move the migration and seed files**

```bash
mkdir -p db/migrations
git mv supabase/migrations/20260804120000_create_schema.sql db/migrations/0001_create_schema.sql
git mv supabase/migrations/20260804120100_create_vista_evaluacion_calculada.sql db/migrations/0002_create_vista_evaluacion_calculada.sql
git mv supabase/seed.sql db/seed.sql
```

- [ ] **Step 2: Delete the rest of `supabase/`**

```bash
git rm -r supabase/config.toml supabase/.gitignore supabase/migrations/.gitkeep
```

(`git mv` in Step 1 already removed the two migration files and `seed.sql`; this step removes what's left so the directory is empty and gets cleaned up by git.)

- [ ] **Step 3: Update the three scripts' hardcoded paths**

In `scripts/lint-sql.mjs`, replace:
```js
const migrationFiles = existsSync("supabase/migrations")
  ? readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => `supabase/migrations/${f}`)
  : [];

const files = [...migrationFiles, "supabase/seed.sql"].filter(existsSync);
```
with:
```js
const migrationFiles = existsSync("db/migrations")
  ? readdirSync("db/migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => `db/migrations/${f}`)
  : [];

const files = [...migrationFiles, "db/seed.sql"].filter(existsSync);
```

In `scripts/verify-seed-counts.mjs`, replace:
```js
const sql = readFileSync("supabase/seed.sql", "utf8");
```
with:
```js
const sql = readFileSync("db/seed.sql", "utf8");
```
and replace:
```js
  console.error("Could not find the puesto insert block in supabase/seed.sql");
```
with:
```js
  console.error("Could not find the puesto insert block in db/seed.sql");
```

In `scripts/verify-real-scores.mjs`, replace:
```js
const sql = readFileSync("supabase/seed.sql", "utf8");
```
with:
```js
const sql = readFileSync("db/seed.sql", "utf8");
```
and replace:
```js
  console.error("Could not find the real-scores values block in supabase/seed.sql");
```
with:
```js
  console.error("Could not find the real-scores values block in db/seed.sql");
```

- [ ] **Step 4: Write `scripts/migrate.mjs`**

```js
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
```

- [ ] **Step 5: Add the npm script and `pg` dependency**

Run: `npm install pg@8.22.0`
Run: `npm install -D @types/pg@8.20.4`

In `package.json`, remove `"supabase": "2.111.0"` from `devDependencies`, and add to `"scripts"`:
```json
"db:migrate": "node scripts/migrate.mjs"
```

- [ ] **Step 6: Verify everything still parses/checks offline**

Run: `npm run lint:sql`
Expected: `OK: db/migrations/0001_create_schema.sql`, `OK: db/migrations/0002_create_vista_evaluacion_calculada.sql`, `OK: db/seed.sql`, then `All 3 SQL file(s) parse cleanly.`

Run: `npm run verify:seed-counts`
Expected: `OK: 76 puestos across 12 sectors match expected counts.`

Run: `npm run verify:real-scores`
Expected: `OK: all 5 real historical evaluations reproduce the expected weighted score.`

Run: `node --check scripts/migrate.mjs`
Expected: no output, exit code 0 (syntax is valid — this does not connect to any database).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: restructure supabase/ to db/, add migrate.mjs runner"
```

---

### Task 2: Migration 0003 — `perfil` and `validacion_puesto` tables

**Files:**
- Create: `db/migrations/0003_perfil_and_validacion_puesto.sql`

**Interfaces:**
- Produces: tables `perfil` (id, email, password_hash, nombre, rol, sector_id, created_at) and `validacion_puesto` (id, evaluacion_id, estado, actualizado_por, actualizado_en) — later tasks (0004's view, 0006's grants, 0007's RLS, `withUserContext` callers, Auth.js's `authorize()`, `seed-users.mjs`) all reference these exact table/column names.

- [ ] **Step 1: Write the migration**

Create `db/migrations/0003_perfil_and_validacion_puesto.sql`:

```sql
create table perfil (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  nombre text not null,
  rol text not null check (rol in ('gerente','direccion')),
  sector_id uuid references sector(id),
  created_at timestamptz not null default now(),
  constraint gerente_tiene_sector check (
    (rol = 'gerente' and sector_id is not null) or
    (rol = 'direccion' and sector_id is null)
  )
);

create table validacion_puesto (
  id uuid primary key default gen_random_uuid(),
  evaluacion_id uuid not null unique references evaluacion(id) on delete cascade,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','aprobado','observado')),
  actualizado_por uuid references perfil(id),
  actualizado_en timestamptz not null default now()
);
```

- [ ] **Step 2: Verify it parses**

Run: `npm run lint:sql`
Expected: `OK: db/migrations/0003_perfil_and_validacion_puesto.sql` printed alongside the others.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/0003_perfil_and_validacion_puesto.sql
git commit -m "feat: add perfil and validacion_puesto tables (migration 0003)"
```

---

### Task 3: Migration 0004 — update `vista_evaluacion_calculada`, join `validacion_puesto`

**Files:**
- Create: `db/migrations/0004_update_vista_calculada.sql`

**Interfaces:**
- Consumes: `validacion_puesto` (Task 2), the existing `vista_evaluacion_calculada` from Fase 1 (`db/migrations/0002_create_vista_evaluacion_calculada.sql`, moved in Task 1).
- Produces: `vista_evaluacion_calculada` no longer depends on `evaluacion.validacion_direccion` — Task 4 (which drops that column) depends on this running first.

- [ ] **Step 1: Write the migration**

Create `db/migrations/0004_update_vista_calculada.sql`:

```sql
create or replace view vista_evaluacion_calculada with (security_invoker = true) as
with base as (
  select
    e.id as evaluacion_id,
    e.puesto_id,
    p.sector_id,
    p.nombre as puesto_nombre,
    e.evaluador,
    e.fecha_evaluacion,
    coalesce(vp.estado, 'pendiente') as validacion_direccion,
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
  left join validacion_puesto vp on vp.evaluacion_id = e.id
  left join respuesta_pregunta rp on rp.evaluacion_id = e.id
  left join pregunta pr on pr.id = rp.pregunta_id
  group by e.id, p.sector_id, p.nombre, e.evaluador, e.fecha_evaluacion, vp.estado
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

Note: at the point this migration runs, `validacion_puesto` is still empty (Task 4 migrates the data) — `coalesce(vp.estado, 'pendiente')` is what keeps the view returning `'pendiente'` instead of `null` in that intermediate state, matching what Fase 1's dashboard already expects from this column.

- [ ] **Step 2: Verify it parses**

Run: `npm run lint:sql`
Expected: `OK: db/migrations/0004_update_vista_calculada.sql` printed.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/0004_update_vista_calculada.sql
git commit -m "feat: update vista_evaluacion_calculada to join validacion_puesto (migration 0004)"
```

---

### Task 4: Migration 0005 — migrate data, drop `evaluacion.validacion_direccion`

**Files:**
- Create: `db/migrations/0005_drop_validacion_direccion_column.sql`

**Interfaces:**
- Consumes: `validacion_puesto` (Task 2), the updated view (Task 3, which must run first — the view no longer references the column this migration drops).
- Produces: `evaluacion` no longer has a `validacion_direccion` column; every one of Fase 1's 76 seeded evaluaciones has a corresponding `validacion_puesto` row.

- [ ] **Step 1: Write the migration**

Create `db/migrations/0005_drop_validacion_direccion_column.sql`:

```sql
-- Fase 1 sembró 76 evaluaciones con validacion_direccion = 'pendiente'.
-- Migrar esos 76 valores a la tabla nueva antes de soltar la columna, para
-- no perder el estado ya seedeado.
insert into validacion_puesto (evaluacion_id, estado)
select id, validacion_direccion from evaluacion
where not exists (
  select 1 from validacion_puesto vp where vp.evaluacion_id = evaluacion.id
);

alter table evaluacion drop constraint evaluacion_validacion_direccion_check;
alter table evaluacion drop column validacion_direccion;
```

- [ ] **Step 2: Verify it parses**

Run: `npm run lint:sql`
Expected: `OK: db/migrations/0005_drop_validacion_direccion_column.sql` printed.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/0005_drop_validacion_direccion_column.sql
git commit -m "feat: migrate validacion_direccion data to validacion_puesto, drop column (migration 0005)"
```

---

### Task 5: Migration 0006 — `puestos_clave_app` role and grants (UPDATE only, no INSERT)

**Files:**
- Create: `db/migrations/0006_create_app_role_and_grants.sql`
- Create: `scripts/set-app-role-password.mjs`
- Modify: `package.json` (add `"db:set-app-password": "node scripts/set-app-role-password.mjs"`)

**Interfaces:**
- Produces: Postgres role `puestos_clave_app` (`LOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`, no password set yet) with `SELECT` on `sector`/`puesto`/`pregunta`/`perfil`/`vista_evaluacion_calculada`, `SELECT, UPDATE` (not `INSERT`) on `evaluacion`/`respuesta_pregunta`/`validacion_puesto` — Task 6's RLS policies and every later task's `DATABASE_URL` (this role) depend on exactly this grant set. `scripts/set-app-role-password.mjs` sets this role's password separately, outside any versioned migration.

- [ ] **Step 1: Write the migration**

Create `db/migrations/0006_create_app_role_and_grants.sql`:

```sql
do $$
begin
  if not exists (select from pg_roles where rolname = 'puestos_clave_app') then
    create role puestos_clave_app with login nosuperuser nobypassrls;
  end if;
end $$;

grant connect on database puestos_clave to puestos_clave_app;
grant usage on schema public to puestos_clave_app;

grant select on sector, puesto, pregunta to puestos_clave_app;
grant select on perfil to puestos_clave_app;
grant select, update on evaluacion, respuesta_pregunta, validacion_puesto to puestos_clave_app;
grant select on vista_evaluacion_calculada to puestos_clave_app;
```

- [ ] **Step 2: Verify it parses**

Run: `npm run lint:sql`
Expected: `OK: db/migrations/0006_create_app_role_and_grants.sql` printed.

- [ ] **Step 3: Write `scripts/set-app-role-password.mjs`**

Create `scripts/set-app-role-password.mjs`:

```js
import pg from "pg";

const connectionString = process.env.DATABASE_URL_OWNER;
const appPassword = process.env.POSTGRES_APP_PASSWORD;

if (!connectionString) {
  console.error("DATABASE_URL_OWNER is not set");
  process.exit(1);
}
if (!appPassword) {
  console.error("POSTGRES_APP_PASSWORD is not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

async function main() {
  const client = await pool.connect();
  try {
    // ALTER ROLE ... PASSWORD does not accept query parameters the way DML
    // does. The value comes from our own env var, never from request input,
    // so this is not an injection risk — client.escapeLiteral() still quotes
    // it correctly for the statement.
    const escaped = client.escapeLiteral(appPassword);
    await client.query(`alter role puestos_clave_app with password ${escaped}`);
    console.log("puestos_clave_app password set.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
```

- [ ] **Step 4: Add the npm script**

In `package.json`, add to `"scripts"`:
```json
"db:set-app-password": "node scripts/set-app-role-password.mjs"
```

- [ ] **Step 5: Verify offline**

Run: `node --check scripts/set-app-role-password.mjs`
Expected: no output, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/0006_create_app_role_and_grants.sql scripts/set-app-role-password.mjs package.json
git commit -m "feat: create puestos_clave_app role with UPDATE-only grants (migration 0006)"
```

---

### Task 6: Migration 0007 — enable RLS, `for update` policies

**Files:**
- Create: `db/migrations/0007_enable_rls.sql`

**Interfaces:**
- Consumes: `puestos_clave_app` role (Task 5).
- Produces: RLS enabled + policies on `evaluacion`, `respuesta_pregunta`, `validacion_puesto` — `verify-rls.mjs` (Task 8) and every write path (`withUserContext`, the direccion Server Action) depend on these exact policy names and semantics.

- [ ] **Step 1: Write the migration**

Create `db/migrations/0007_enable_rls.sql`:

```sql
alter table evaluacion enable row level security;
alter table respuesta_pregunta enable row level security;
alter table validacion_puesto enable row level security;

create policy evaluacion_select on evaluacion for select using (true);
create policy respuesta_pregunta_select on respuesta_pregunta for select using (true);
create policy validacion_puesto_select on validacion_puesto for select using (true);

create policy evaluacion_write on evaluacion for update using (
  current_setting('app.rol', true) = 'gerente'
  and exists (
    select 1 from puesto p
    where p.id = evaluacion.puesto_id
      and p.sector_id::text = current_setting('app.sector_id', true)
  )
);

create policy respuesta_pregunta_write on respuesta_pregunta for update using (
  current_setting('app.rol', true) = 'gerente'
  and exists (
    select 1 from evaluacion e
    join puesto p on p.id = e.puesto_id
    where e.id = respuesta_pregunta.evaluacion_id
      and p.sector_id::text = current_setting('app.sector_id', true)
  )
) with check (
  current_setting('app.rol', true) = 'gerente'
  and exists (
    select 1 from evaluacion e
    join puesto p on p.id = e.puesto_id
    where e.id = respuesta_pregunta.evaluacion_id
      and p.sector_id::text = current_setting('app.sector_id', true)
  )
);

create policy validacion_puesto_write on validacion_puesto for update using (
  current_setting('app.rol', true) = 'direccion'
) with check (
  current_setting('app.rol', true) = 'direccion'
);
```

- [ ] **Step 2: Verify it parses**

Run: `npm run lint:sql`
Expected: `OK: db/migrations/0007_enable_rls.sql` printed — all 7 files under `db/migrations/` plus `db/seed.sql` should now print `OK:`.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/0007_enable_rls.sql
git commit -m "feat: enable RLS with for-update policies (migration 0007)"
```

---

**⏸ Checkpoint: report results here before continuing.** Tasks 1–6 are the full restructuring + all 5 new migrations. Show the user `npm run lint:sql` output covering all 7 migrations + seed, and the migration file list, before starting Task 7.

---

### Task 7: DB client library — `pool.ts`, `query.ts`, `withUserContext.ts`

**Files:**
- Create: `src/lib/db/pool.ts`
- Create: `src/lib/db/query.ts`
- Create: `src/lib/db/withUserContext.ts`

**Interfaces:**
- Produces: `pool` (a module-level `pg.Pool`, from `pool.ts`), `query<T>(text: string, params?: unknown[]): Promise<T[]>` (from `query.ts`), `withUserContext<T>(user: AppUserContext, fn: (client: PoolClient) => Promise<T>): Promise<T>` and the `AppUserContext` type `{ id: string; rol: "gerente" | "direccion"; sectorId: string | null }` (from `withUserContext.ts`) — Auth.js's `authorize()` (Task 9), every Server Action that reads (Task 16, 17), and every Server Action that writes (Task 17) import these by these exact names.

- [ ] **Step 1: Write `src/lib/db/pool.ts`**

```ts
import { Pool } from "pg";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
```

- [ ] **Step 2: Write `src/lib/db/query.ts`**

```ts
import { pool } from "./pool";

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}
```

- [ ] **Step 3: Write `src/lib/db/withUserContext.ts`**

```ts
import type { PoolClient } from "pg";
import { pool } from "./pool";

export interface AppUserContext {
  id: string;
  rol: "gerente" | "direccion";
  sectorId: string | null;
}

export async function withUserContext<T>(
  user: AppUserContext,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("select set_config($1,$2,true)", ["app.user_id", user.id]);
    await client.query("select set_config($1,$2,true)", ["app.rol", user.rol]);
    await client.query("select set_config($1,$2,true)", ["app.sector_id", user.sectorId ?? ""]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors related to these three files (unrelated pre-existing errors, if any, are not this task's concern — but there should be none, since `@types/pg` was installed in Task 1).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/pool.ts src/lib/db/query.ts src/lib/db/withUserContext.ts
git commit -m "feat: add pg-based db client (pool, query, withUserContext)"
```

---

### Task 8: `scripts/verify-rls.mjs` — the 7 RLS test cases

**Files:**
- Create: `scripts/verify-rls.mjs`
- Modify: `package.json` (add `"verify:rls": "node scripts/verify-rls.mjs"`)

**Interfaces:**
- Consumes: the `evaluacion`/`respuesta_pregunta`/`validacion_puesto` schema and RLS policies (Tasks 2–6). Connects with `DATABASE_URL` (the `puestos_clave_app` role) — never the owner.
- Produces: nothing consumed by other tasks — this is a standalone verification script, listed in the Fase 2 runbook (Task 18) as the final acceptance gate.

- [ ] **Step 1: Write `scripts/verify-rls.mjs`**

```js
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

let passed = 0;
let failed = 0;

function report(name, ok, detail) {
  if (ok) {
    console.log(`PASS: ${name}`);
    passed++;
  } else {
    console.error(`FAIL: ${name}${detail ? " — " + detail : ""}`);
    failed++;
  }
}

async function withRollback(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    return await fn(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

async function setContext(client, { rol, sectorId }) {
  await client.query("select set_config($1,$2,true)", [
    "app.user_id",
    "00000000-0000-0000-0000-000000000000",
  ]);
  if (rol !== undefined) {
    await client.query("select set_config($1,$2,true)", ["app.rol", rol]);
  }
  if (sectorId !== undefined) {
    await client.query("select set_config($1,$2,true)", ["app.sector_id", sectorId ?? ""]);
  }
}

async function main() {
  const setupClient = await pool.connect();
  let comprasEvaluacionId, comprasSectorId, almacenesEvaluacionId;
  try {
    const compras = await setupClient.query(
      `select e.id as evaluacion_id, p.sector_id
       from evaluacion e join puesto p on p.id = e.puesto_id join sector s on s.id = p.sector_id
       where s.slug = 'compras' limit 1`
    );
    comprasEvaluacionId = compras.rows[0].evaluacion_id;
    comprasSectorId = compras.rows[0].sector_id;

    const almacenes = await setupClient.query(
      `select e.id as evaluacion_id
       from evaluacion e join puesto p on p.id = e.puesto_id join sector s on s.id = p.sector_id
       where s.slug = 'almacenes' limit 1`
    );
    almacenesEvaluacionId = almacenes.rows[0].evaluacion_id;
  } finally {
    setupClient.release();
  }

  // 1. Gerente de Compras escribe respuesta_pregunta de un puesto de Compras -> éxito
  await withRollback(async (client) => {
    await setContext(client, { rol: "gerente", sectorId: comprasSectorId });
    const { rows } = await client.query(
      `update respuesta_pregunta
       set puntaje = 3
       where evaluacion_id = $1 and pregunta_id = (select id from pregunta where numero = 1)
       returning id`,
      [comprasEvaluacionId]
    );
    report("1. gerente Compras escribe su propio sector", rows.length === 1);
  });

  // 2. Gerente de Compras escribe respuesta_pregunta de un puesto de Almacenes -> falla
  await withRollback(async (client) => {
    await setContext(client, { rol: "gerente", sectorId: comprasSectorId });
    const { rows } = await client.query(
      `update respuesta_pregunta
       set puntaje = 3
       where evaluacion_id = $1 and pregunta_id = (select id from pregunta where numero = 1)
       returning id`,
      [almacenesEvaluacionId]
    );
    report("2. gerente Compras NO puede escribir sector ajeno (Almacenes)", rows.length === 0);
  });

  // 3. Dirección intenta escribir respuesta_pregunta -> falla
  await withRollback(async (client) => {
    await setContext(client, { rol: "direccion", sectorId: null });
    const { rows } = await client.query(
      `update respuesta_pregunta
       set puntaje = 3
       where evaluacion_id = $1 and pregunta_id = (select id from pregunta where numero = 1)
       returning id`,
      [comprasEvaluacionId]
    );
    report("3. direccion NO puede escribir respuesta_pregunta", rows.length === 0);
  });

  // 4. Dirección escribe validacion_puesto -> éxito
  await withRollback(async (client) => {
    await setContext(client, { rol: "direccion", sectorId: null });
    const { rows } = await client.query(
      `update validacion_puesto set estado = 'aprobado' where evaluacion_id = $1 returning id`,
      [comprasEvaluacionId]
    );
    report("4. direccion puede escribir validacion_puesto", rows.length === 1);
  });

  // 5. Gerente intenta escribir validacion_puesto -> falla
  await withRollback(async (client) => {
    await setContext(client, { rol: "gerente", sectorId: comprasSectorId });
    const { rows } = await client.query(
      `update validacion_puesto set estado = 'aprobado' where evaluacion_id = $1 returning id`,
      [comprasEvaluacionId]
    );
    report("5. gerente NO puede escribir validacion_puesto", rows.length === 0);
  });

  // 6. Sin set_config (contexto vacío) -> cualquier escritura falla
  await withRollback(async (client) => {
    const { rows } = await client.query(
      `update respuesta_pregunta
       set puntaje = 3
       where evaluacion_id = $1 and pregunta_id = (select id from pregunta where numero = 1)
       returning id`,
      [comprasEvaluacionId]
    );
    report("6. sin contexto, escritura falla (default deny)", rows.length === 0);
  });

  // 7. SELECT funciona igual con o sin contexto
  await withRollback(async (client) => {
    const { rows } = await client.query("select count(*) from respuesta_pregunta");
    report("7. SELECT funciona sin contexto", Number(rows[0].count) > 0);
  });

  await pool.end();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Note on cases 2, 3, 5, 6: these are `for update ... using (...)` policy denials, not `insert`/`with check` violations — a row that fails the `USING` clause is simply excluded from the update (0 rows matched, no thrown exception), which is why every denial case here asserts `rows.length === 0` rather than expecting a caught error. That is correct RLS behavior for `UPDATE`, not a bug in the test.

- [ ] **Step 2: Add the npm script**

In `package.json`, add to `"scripts"`:
```json
"verify:rls": "node scripts/verify-rls.mjs"
```

- [ ] **Step 3: Verify offline**

Run: `node --check scripts/verify-rls.mjs`
Expected: no output, exit code 0. (This cannot connect to a real database in this environment — a live run happens later, per Task 18's runbook.)

- [ ] **Step 4: Commit**

```bash
git add scripts/verify-rls.mjs package.json
git commit -m "feat: add verify-rls.mjs with the 7 RLS acceptance cases"
```

---

### Task 9: Auth.js v5 — `auth.config.ts`, `auth.ts`, `middleware.ts`

**Files:**
- Create: `src/auth.config.ts`
- Create: `src/auth.ts`
- Create: `src/middleware.ts`
- Create: `src/types/next-auth.d.ts`
- Modify: `package.json` (add `next-auth@5.0.0-beta.32`, `bcryptjs@3.0.3`)

**Interfaces:**
- Consumes: `query` from `src/lib/db/query.ts` (Task 7), the `perfil` table (Task 2).
- Produces: `auth`, `signIn`, `signOut`, `handlers` exported from `src/auth.ts` — Task 10's login form, Task 16's layout, and Task 17's sector page all import `auth` from `@/auth`; `session.user.id`/`rol`/`sectorId` are typed via `src/types/next-auth.d.ts`.

- [ ] **Step 1: Install dependencies**

```bash
npm install next-auth@5.0.0-beta.32 bcryptjs@3.0.3
```

- [ ] **Step 2: Write `src/types/next-auth.d.ts`**

```ts
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    rol: "gerente" | "direccion";
    sectorId: string | null;
  }

  interface Session {
    user: {
      id: string;
      rol: "gerente" | "direccion";
      sectorId: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    rol: "gerente" | "direccion";
    sectorId: string | null;
  }
}
```

- [ ] **Step 3: Write `src/auth.config.ts`**

Edge-safe — no `bcryptjs`, no `pg`/database imports here, since the middleware that consumes this runs in the Edge runtime and neither library is Edge-compatible.

```ts
import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLogin = nextUrl.pathname.startsWith("/login");
      if (isOnLogin) {
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl));
        return true;
      }
      return isLoggedIn;
    },
  },
  providers: [],
};
```

- [ ] **Step 4: Write `src/auth.ts`**

Node runtime — this is where `bcryptjs` and the `perfil` query happen.

```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { query } from "./lib/db/query";

interface PerfilRow {
  id: string;
  password_hash: string;
  nombre: string;
  rol: "gerente" | "direccion";
  sector_id: string | null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") return null;

        const rows = await query<PerfilRow>(
          "select id, password_hash, nombre, rol, sector_id from perfil where email = $1",
          [email]
        );
        const row = rows[0];
        if (!row) return null;

        const valid = await bcrypt.compare(password, row.password_hash);
        if (!valid) return null;

        return {
          id: row.id,
          email,
          name: row.nombre,
          rol: row.rol,
          sectorId: row.sector_id,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.rol = user.rol;
        token.sectorId = user.sectorId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.rol = token.rol;
        session.user.sectorId = token.sectorId;
      }
      return session;
    },
  },
});
```

- [ ] **Step 5: Write `src/middleware.ts`**

```ts
export { auth as middleware } from "./auth";

export const config = {
  matcher: ["/((?!api/health|login|_next/static|_next/image|favicon.ico).*)"],
};
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in the 4 new files.

- [ ] **Step 7: Commit**

```bash
git add src/auth.config.ts src/auth.ts src/middleware.ts src/types/next-auth.d.ts package.json package-lock.json
git commit -m "feat: add Auth.js v5 credentials login (edge config, node provider, middleware)"
```

---

### Task 10: `scripts/seed.mjs`, `scripts/seed-users.mjs`, credenciales de prueba

**Files:**
- Create: `scripts/seed.mjs`
- Create: `scripts/seed-users.mjs`
- Create: `docs/superpowers/plans/2026-08-04-credenciales-prueba.md`
- Modify: `package.json` (add `"db:seed": "node scripts/seed.mjs"`, `"db:seed-users": "node scripts/seed-users.mjs"`)

**Interfaces:**
- Consumes: `perfil` and `sector` tables (Tasks 2, and Fase 1's `db/migrations/0001`). Connects with `DATABASE_URL_OWNER` — the app role only has `SELECT` on `perfil`, it cannot write there.
- Produces: 3 `perfil` rows (`compras@test.local`, `almacenes@test.local`, `direccion@test.local`) — the login flow (Task 9) and the Fase 2 runbook (Task 18) both depend on these existing with the documented passwords.

- [ ] **Step 1: Write `scripts/seed.mjs`**

```js
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
```

- [ ] **Step 2: Write `scripts/seed-users.mjs`**

```js
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
  },
  {
    email: "almacenes@test.local",
    nombre: "Gerente Almacenes (prueba)",
    rol: "gerente",
    sectorSlug: "almacenes",
    passwordEnv: "SEED_PASSWORD_GERENTE_ALMACENES",
    passwordDefault: "Almacenes123!",
  },
  {
    email: "direccion@test.local",
    nombre: "Dirección (prueba)",
    rol: "direccion",
    sectorSlug: null,
    passwordEnv: "SEED_PASSWORD_DIRECCION",
    passwordDefault: "Direccion123!",
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
        `insert into perfil (email, password_hash, nombre, rol, sector_id)
         values ($1, $2, $3, $4, $5)
         on conflict (email) do update
           set password_hash = excluded.password_hash,
               nombre = excluded.nombre,
               rol = excluded.rol,
               sector_id = excluded.sector_id`,
        [u.email, passwordHash, u.nombre, u.rol, sectorId]
      );
      console.log(`OK: ${u.email} (${u.rol})`);
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
```

- [ ] **Step 3: Write the credenciales-prueba doc**

Create `docs/superpowers/plans/2026-08-04-credenciales-prueba.md`:

```markdown
# Credenciales de prueba — Fase 2

Generadas por `scripts/seed-users.mjs`. Son credenciales de **prueba/desarrollo**,
no de producción — cambiá las env vars `SEED_PASSWORD_*` antes de correr este
script contra cualquier ambiente real.

| Usuario | Email | Rol | Sector | Contraseña (default de desarrollo) |
|---|---|---|---|---|
| Gerente Compras | `compras@test.local` | gerente | Compras | `Compras123!` |
| Gerente Almacenes | `almacenes@test.local` | gerente | Almacenes | `Almacenes123!` |
| Dirección | `direccion@test.local` | direccion | — | `Direccion123!` |

Para usar contraseñas distintas, seteá `SEED_PASSWORD_GERENTE_COMPRAS`,
`SEED_PASSWORD_GERENTE_ALMACENES`, `SEED_PASSWORD_DIRECCION` antes de correr
`npm run db:seed-users` — si no están seteadas, usa los defaults de esta tabla.

Casos de uso:
- **Gerente Compras**: sector chico (2 puestos), rápido para probar el flujo
  de escritura editable.
- **Gerente Almacenes**: sector distinto, para el test cruzado de RLS (un
  gerente de un sector no puede escribir en otro).
- **Dirección**: sin sector, solo puede tocar `validacion_puesto`.
```

- [ ] **Step 4: Add the npm scripts**

In `package.json`, add to `"scripts"`:
```json
"db:seed": "node scripts/seed.mjs",
"db:seed-users": "node scripts/seed-users.mjs"
```

- [ ] **Step 5: Verify offline**

Run: `node --check scripts/seed.mjs`
Run: `node --check scripts/seed-users.mjs`
Expected: no output, exit code 0 for both.

- [ ] **Step 6: Commit**

```bash
git add scripts/seed.mjs scripts/seed-users.mjs docs/superpowers/plans/2026-08-04-credenciales-prueba.md package.json
git commit -m "feat: add seed.mjs and seed-users.mjs, document test credentials"
```

---

### Task 11: Health route, `output: standalone`, Dockerfile

**Files:**
- Create: `src/app/api/health/route.ts`
- Modify: `next.config.ts` (add `output: 'standalone'`)
- Create: `Dockerfile`

**Interfaces:**
- Produces: `GET /api/health` returning `200 { status: "ok" }` — the Docker Compose healthcheck (Task 12) depends on this exact path and status code. `.next/standalone/server.js` — the Dockerfile's runtime stage depends on this existing after `next build`.

- [ ] **Step 1: Write the health route**

Create `src/app/api/health/route.ts`:

```ts
export async function GET() {
  return Response.json({ status: "ok" });
}
```

- [ ] **Step 2: Update `next.config.ts`**

Replace the contents of `next.config.ts` with:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

- [ ] **Step 3: Write the Dockerfile**

Create `Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
```

- [ ] **Step 4: Verify the build produces standalone output**

Run: `npm run build`
Expected: build succeeds; confirm `.next/standalone/server.js` exists afterward (`ls .next/standalone/server.js` on macOS/Linux, or equivalent — the file must exist, this is what the Dockerfile's runtime stage copies).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/health/route.ts next.config.ts Dockerfile
git commit -m "feat: add health check route, standalone output, Dockerfile"
```

---

### Task 12: `docker-compose.yml`

**Files:**
- Create: `docker-compose.yml`
- Create: `.gitignore` entry for `.env` (verify it's already covered — Fase 1's `create-next-app` scaffold already ignores `.env*.local`, but plain `.env` needs an explicit check)

**Interfaces:**
- Consumes: `Dockerfile` (Task 11), the health route (Task 11).
- Produces: services `postgres` (`puestos_clave_db`) and `app` (`puestos_clave_app`) — Task 18's runbook references these exact service/container names and the `127.0.0.1:55432` / `8097` ports.

- [ ] **Step 1: Confirm `.env` is git-ignored**

Run: `grep -n "^\.env$\|^\.env\*" .gitignore`
Expected: at least one line matching `.env` or `.env*` (create-next-app's default `.gitignore` includes `.env*.local` but not bare `.env` — if the grep finds nothing, add a line `.env` to `.gitignore` before continuing, since `docker-compose.yml` in Step 2 references an `.env` file that must never be committed).

- [ ] **Step 2: Write `docker-compose.yml`**

Create `docker-compose.yml` at the repo root:

```yaml
services:
  postgres:
    image: postgres:17
    container_name: puestos_clave_db
    restart: unless-stopped
    environment:
      POSTGRES_DB: puestos_clave
      POSTGRES_USER: puestos_clave_owner
      POSTGRES_PASSWORD: ${POSTGRES_OWNER_PASSWORD}
    ports:
      - "127.0.0.1:55432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U puestos_clave_owner -d puestos_clave"]
      interval: 5s
      timeout: 5s
      retries: 10
  app:
    build: .
    container_name: puestos_clave_app
    restart: unless-stopped
    ports:
      - "8097:3000"
    env_file:
      - .env
    environment:
      DATABASE_URL: postgresql://puestos_clave_app:${POSTGRES_APP_PASSWORD}@postgres:5432/puestos_clave
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 15s
volumes:
  postgres_data:
```

Note: `127.0.0.1:55432:5432` binds to loopback only — never reachable from outside the server itself. This is how `scripts/migrate.mjs`, `scripts/seed.mjs`, `scripts/set-app-role-password.mjs`, and `scripts/seed-users.mjs` (all run from the host, using `DATABASE_URL_OWNER=postgresql://puestos_clave_owner:...@localhost:55432/puestos_clave`) reach the database — port `55432` avoids colliding with any other project's Postgres already bound to the standard `5432` on the same host.

- [ ] **Step 3: Verify the YAML parses**

Run: `python3 -c "import yaml; yaml.safe_load(open('docker-compose.yml')); print('OK')"`
Expected: `OK` printed, exit code 0. (This only validates YAML syntax, not that Docker can actually run it — no Docker is available in this environment; that verification is part of Task 18's runbook.)

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .gitignore
git commit -m "feat: add docker-compose.yml (own Postgres, loopback-only deploy-script access)"
```

---

### Task 13: Nginx example block (documentation only)

**Files:**
- Create: `docs/superpowers/plans/2026-08-04-nginx-example.md`

**Interfaces:** none — pure documentation, no code depends on this.

- [ ] **Step 1: Write the doc**

Create `docs/superpowers/plans/2026-08-04-nginx-example.md`:

```markdown
# Nginx — bloque de ejemplo para puestos-clave

Esto es un **ejemplo documentado**, no una config real editada — no hay
acceso desde esta sesión al Nginx real del host (corre fuera de Docker, en
el server). Agregar un bloque como este a la config existente, siguiendo la
misma convención que ya usan los demás proyectos SICA (`server {}` por
proyecto, `proxy_pass` a `localhost:<puerto>`).

```nginx
server {
    listen 443 ssl;
    server_name REEMPLAZAR.example.com;

    # certificados TLS ya gestionados por la config existente del host

    location / {
        proxy_pass http://localhost:8097;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Con TLS terminado ahí, `AUTH_URL` en `.env` debe ser `https://` — si no,
Auth.js no emite la cookie de sesión con `Secure` y el login no persiste
detrás del proxy.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-08-04-nginx-example.md
git commit -m "docs: add Nginx example block for puestos-clave (not a live edit)"
```

---

### Task 14: `.env.example`

**Files:**
- Create: `.env.example`

**Interfaces:** none — documents every env var Tasks 1–13 introduced.

- [ ] **Step 1: Write `.env.example`**

Create `.env.example`:

```
# Next.js app runtime (rol puestos_clave_app, sin BYPASSRLS)
DATABASE_URL=postgresql://puestos_clave_app:REEMPLAZAR@postgres:5432/puestos_clave

# Solo para scripts de deploy (migrate.mjs, seed.mjs, set-app-role-password.mjs,
# seed-users.mjs) — rol dueño de las tablas, corren desde el host, nunca los
# usa la app en runtime. Puerto 55432 = el que docker-compose.yml publica en
# loopback para el servicio postgres.
DATABASE_URL_OWNER=postgresql://puestos_clave_owner:REEMPLAZAR@localhost:55432/puestos_clave

# docker-compose.yml
POSTGRES_OWNER_PASSWORD=REEMPLAZAR
POSTGRES_APP_PASSWORD=REEMPLAZAR

# Auth.js — generar con `npx auth secret`
AUTH_SECRET=REEMPLAZAR
AUTH_URL=https://REEMPLAZAR.example.com

# scripts/seed-users.mjs — credenciales de prueba, no de producción (ver
# docs/superpowers/plans/2026-08-04-credenciales-prueba.md). Opcionales: si
# no están seteadas, el script usa sus defaults de desarrollo documentados ahí.
SEED_PASSWORD_GERENTE_COMPRAS=
SEED_PASSWORD_GERENTE_ALMACENES=
SEED_PASSWORD_DIRECCION=
```

- [ ] **Step 2: Confirm every variable name matches what the code reads**

Run: `grep -rho "process\.env\.[A-Z_]*" scripts/ src/ | sort -u`
Expected output (order may vary): `process.env.DATABASE_URL`, `process.env.DATABASE_URL_OWNER`, `process.env.POSTGRES_APP_PASSWORD`, plus the `SEED_PASSWORD_*` ones read via `process.env[u.passwordEnv]` in `seed-users.mjs` (won't show up literally in this grep — confirm those 3 names by reading `scripts/seed-users.mjs`'s `USERS` array instead, cross-checking against `.env.example`). Every name found must have a matching line in `.env.example`; `AUTH_SECRET`/`AUTH_URL` are read implicitly by `next-auth` itself (not via explicit `process.env.AUTH_SECRET` in this codebase), so they won't appear in the grep either — confirm those 2 by inspection instead of the grep.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs: add .env.example with all Fase 2 variables"
```

---

### Task 15: Frontend — login page

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/app/login/LoginForm.tsx`
- Create: `src/app/login/actions.ts`

**Interfaces:**
- Consumes: `signIn` from `@/auth` (Task 9).
- Produces: `/login` route — `src/middleware.ts` (Task 9) already excludes this path from the auth redirect.

- [ ] **Step 1: Write `src/app/login/actions.ts`**

```ts
"use server";

import { signIn } from "@/auth";
import { AuthError } from "next-auth";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = formData.get("email");
  const password = formData.get("password");
  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/",
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Email o contraseña incorrectos" };
    }
    throw error;
  }
}
```

- [ ] **Step 2: Write `src/app/login/LoginForm.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction}>
      <label>
        Email
        <input type="email" name="email" required autoComplete="email" />
      </label>
      <label>
        Contraseña
        <input type="password" name="password" required autoComplete="current-password" />
      </label>
      {state.error && <p role="alert">{state.error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? "Ingresando..." : "Ingresar"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Write `src/app/login/page.tsx`**

```tsx
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main>
      <h1>F-116 · Puestos Clave</h1>
      <LoginForm />
    </main>
  );
}
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: build succeeds, `/login` appears in the route summary.

- [ ] **Step 5: Commit**

```bash
git add src/app/login/
git commit -m "feat: add login page (Credentials form via Auth.js)"
```

---

### Task 16: Frontend — authenticated layout, navbar

**Files:**
- Create: `src/app/(app)/layout.tsx`
- Create: `src/app/(app)/components/Navbar.tsx`

**Interfaces:**
- Consumes: `auth` from `@/auth` (Task 9), `query` from `@/lib/db/query` (Task 7).
- Produces: every route under `src/app/(app)/` (Task 17's sector page) is wrapped by this layout and receives the rendered `Navbar`.

- [ ] **Step 1: Write `src/app/(app)/components/Navbar.tsx`**

```tsx
import Link from "next/link";

interface Sector {
  id: string;
  nombre: string;
  slug: string;
}

export function Navbar({
  sectores,
  rol,
  sectorId,
}: {
  sectores: Sector[];
  rol: "gerente" | "direccion";
  sectorId: string | null;
}) {
  return (
    <nav>
      {sectores.map((sector) => {
        const isEditable = rol === "gerente" && sectorId === sector.id;
        return (
          <Link key={sector.id} href={`/sector/${sector.slug}`}>
            {sector.nombre}
            <span>{isEditable ? "Editable" : "Solo lectura"}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Write `src/app/(app)/layout.tsx`**

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db/query";
import { Navbar } from "./components/Navbar";

interface SectorRow {
  id: string;
  nombre: string;
  slug: string;
  orden: number;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const sectores = await query<SectorRow>(
    "select id, nombre, slug, orden from sector order by orden"
  );

  return (
    <div>
      <Navbar sectores={sectores} rol={session.user.rol} sectorId={session.user.sectorId} />
      <main>{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: build succeeds. (This route group has no `page.tsx` of its own yet — Task 17 adds `sector/[slug]/page.tsx` under it — so there's no new route in the summary from this task alone; the build must still succeed with no page for the group.)

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/layout.tsx" "src/app/(app)/components/Navbar.tsx"
git commit -m "feat: add authenticated layout with sector navbar"
```

---

### Task 17: Frontend — sector page, dirección's `validacion_puesto` control

**Files:**
- Create: `src/app/(app)/sector/[slug]/page.tsx`
- Create: `src/app/(app)/sector/[slug]/actions.ts`
- Create: `src/app/(app)/sector/[slug]/ValidacionSelect.tsx`

**Interfaces:**
- Consumes: `auth` (Task 9), `query` (Task 7), `withUserContext` (Task 7), `vista_evaluacion_calculada` (Tasks 3–4).
- Produces: `/sector/[slug]` route, linked from the Navbar (Task 16).

- [ ] **Step 1: Write `src/app/(app)/sector/[slug]/actions.ts`**

```ts
"use server";

import { auth } from "@/auth";
import { withUserContext } from "@/lib/db/withUserContext";

export interface ValidacionActionState {
  error?: string;
  ok?: boolean;
}

export async function updateValidacionAction(
  _prevState: ValidacionActionState,
  formData: FormData
): Promise<ValidacionActionState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "No hay sesión activa." };
  }
  if (session.user.rol !== "direccion") {
    return { error: "No tenés permiso para editar este campo." };
  }

  const evaluacionId = formData.get("evaluacionId");
  const estado = formData.get("estado");
  if (typeof evaluacionId !== "string" || typeof estado !== "string") {
    return { error: "Datos inválidos." };
  }

  try {
    const rows = await withUserContext(
      { id: session.user.id, rol: session.user.rol, sectorId: session.user.sectorId },
      async (client) => {
        const result = await client.query(
          "update validacion_puesto set estado = $1, actualizado_por = $2, actualizado_en = now() where evaluacion_id = $3 returning id",
          [estado, session.user.id, evaluacionId]
        );
        return result.rows;
      }
    );
    if (rows.length === 0) {
      return { error: "No tenés permiso para editar este sector." };
    }
    return { ok: true };
  } catch {
    return { error: "No tenés permiso para editar este sector." };
  }
}
```

- [ ] **Step 2: Write `src/app/(app)/sector/[slug]/ValidacionSelect.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { updateValidacionAction, type ValidacionActionState } from "./actions";

const initialState: ValidacionActionState = {};

export function ValidacionSelect({
  evaluacionId,
  estadoActual,
}: {
  evaluacionId: string;
  estadoActual: string;
}) {
  const [state, formAction, pending] = useActionState(updateValidacionAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="evaluacionId" value={evaluacionId} />
      <select name="estado" defaultValue={estadoActual} disabled={pending}>
        <option value="pendiente">Pendiente</option>
        <option value="aprobado">Aprobado</option>
        <option value="observado">Observado</option>
      </select>
      <button type="submit" disabled={pending}>
        Guardar
      </button>
      {state.error && <p role="alert">{state.error}</p>}
      {state.ok && <p>Guardado.</p>}
    </form>
  );
}
```

- [ ] **Step 3: Write `src/app/(app)/sector/[slug]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db/query";
import { ValidacionSelect } from "./ValidacionSelect";

interface PuestoRow {
  evaluacion_id: string;
  puesto_nombre: string;
  puntaje_ponderado_pct: number;
  clasificacion: string;
  nivel_riesgo: string;
  semaforo: string;
  validacion_direccion: string;
}

export default async function SectorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await auth();
  if (!session?.user) return null;

  const sectorRows = await query<{ id: string; nombre: string }>(
    "select id, nombre from sector where slug = $1",
    [slug]
  );
  const sector = sectorRows[0];
  if (!sector) notFound();

  const puestos = await query<PuestoRow>(
    `select evaluacion_id, puesto_nombre, puntaje_ponderado_pct, clasificacion, nivel_riesgo, semaforo, validacion_direccion
     from vista_evaluacion_calculada
     where sector_id = $1
     order by puesto_nombre`,
    [sector.id]
  );

  const isDireccion = session.user.rol === "direccion";

  return (
    <main>
      <h1>{sector.nombre}</h1>
      <ul>
        {puestos.map((p) => (
          <li key={p.evaluacion_id}>
            <span>{p.puesto_nombre}</span>
            <span>
              {p.semaforo} {p.clasificacion} ({p.puntaje_ponderado_pct}%)
            </span>
            {isDireccion ? (
              <ValidacionSelect evaluacionId={p.evaluacion_id} estadoActual={p.validacion_direccion} />
            ) : (
              <span>{p.validacion_direccion}</span>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 4: Verify the build**

Run: `npm run build`
Expected: build succeeds, `/sector/[slug]` appears in the route summary as a dynamic route.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/sector/"
git commit -m "feat: add sector page with puesto list and direccion validacion control"
```

---

### Task 18: Fase 2 verification runbook, mark Fase 1's runbook obsolete

**Files:**
- Create: `docs/superpowers/plans/2026-08-04-fase2-verification-runbook.md`
- Modify: `docs/superpowers/plans/2026-08-04-docker-verification-runbook.md` (add an obsolescence notice at the top)

**Interfaces:** none — documentation only, the final task of this plan.

- [ ] **Step 1: Add the obsolescence notice to the Fase 1 runbook**

At the very top of `docs/superpowers/plans/2026-08-04-docker-verification-runbook.md`, before the existing `# Docker verification runbook` heading, insert:

```markdown
> **OBSOLETO (Fase 2):** Este runbook asume Supabase CLI (`supabase start`,
> `supabase db reset`), que ya no se usa en el proyecto — Fase 2 lo reemplazó
> por Postgres + Docker self-hosted. Se conserva como referencia histórica de
> la decisión original de Fase 1. Usar
> `docs/superpowers/plans/2026-08-04-fase2-verification-runbook.md` en su lugar.

```

- [ ] **Step 2: Write the Fase 2 runbook**

Create `docs/superpowers/plans/2026-08-04-fase2-verification-runbook.md`:

```markdown
# Fase 2 verification runbook — self-hosted auth + RLS

Correr esto en un server con Docker (reemplaza al runbook de Fase 1, que
usaba Supabase CLI).

## 1. Levantar Postgres

    cp .env.example .env
    # completar .env con contraseñas reales antes de seguir

    docker compose up -d postgres

Esperar a que el healthcheck pase (`docker compose ps` debe mostrar
`puestos_clave_db` como `healthy`).

## 2. Migraciones, rol de app, seed

    npm ci
    npm run db:migrate
    npm run db:set-app-password
    npm run db:seed
    npm run db:seed-users

`db:migrate`, `db:set-app-password`, `db:seed` y `db:seed-users` usan
`DATABASE_URL_OWNER` (puerto `55432` en loopback, ver `.env.example`).

## 3. Queries de aceptación (heredadas de Fase 1, deben seguir dando lo mismo)

    psql "$DATABASE_URL_OWNER" -c "select count(*) from sector;"              -- 12
    psql "$DATABASE_URL_OWNER" -c "select count(*) from puesto;"              -- 76
    psql "$DATABASE_URL_OWNER" -c "select count(*) from pregunta;"            -- 10
    psql "$DATABASE_URL_OWNER" -c "select count(*) from evaluacion;"          -- 76
    psql "$DATABASE_URL_OWNER" -c "select count(*) from respuesta_pregunta;"  -- 760
    psql "$DATABASE_URL_OWNER" -c "select count(*) from validacion_puesto;"   -- 76

    psql "$DATABASE_URL_OWNER" -c "
      select clasificacion, count(*)
      from vista_evaluacion_calculada
      group by clasificacion
      order by clasificacion;
    "
    -- NO ES PUESTO CLAVE = 71, PUESTO CLAVE = 3, PUESTO DE ATENCIÓN = 2

## 4. Confirmar `security_invoker` en la vista

    psql "$DATABASE_URL_OWNER" -c "
      select relname, reloptions
      from pg_class
      where relname = 'vista_evaluacion_calculada';
    "
    -- reloptions debe incluir security_invoker=true

## 5. Confirmar que `puestos_clave_app` no tiene BYPASSRLS

    psql "$DATABASE_URL_OWNER" -c "
      select rolname, rolbypassrls, rolsuper
      from pg_roles
      where rolname = 'puestos_clave_app';
    "
    -- rolbypassrls debe ser 'f', rolsuper debe ser 'f'

## 6. Los 7 casos de RLS

    npm run verify:rls

Esperado: `7 passed, 0 failed`.

## 7. Levantar la app y probar el login real

    docker compose up -d app
    docker compose ps   -- puestos_clave_app debe quedar healthy

Desde el browser (una vez que Nginx del host apunte a `localhost:8097`, ver
`docs/superpowers/plans/2026-08-04-nginx-example.md`): loguearse como
`compras@test.local` (contraseña en
`docs/superpowers/plans/2026-08-04-credenciales-prueba.md`), confirmar que
Compras aparece como editable y el resto solo lectura, y que un intento de
`validacion_puesto` como gerente (en vez de dirección) es rechazado con el
mensaje humano, no un error crudo de Postgres.

Si cualquier paso da algo distinto a lo documentado acá, no se considera
cerrada la Fase 2 hasta resolverlo.
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-08-04-fase2-verification-runbook.md docs/superpowers/plans/2026-08-04-docker-verification-runbook.md
git commit -m "docs: add Fase 2 verification runbook, mark Fase 1's obsolete"
```
