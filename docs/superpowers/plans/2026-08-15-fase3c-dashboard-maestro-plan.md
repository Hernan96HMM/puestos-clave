# Fase 3c — Dashboard MAESTRO (KPIs, gráficos, tabla consolidada) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/dashboard`, a consolidated panel (KPIs, torta, barras, tabla filtrable) visible to Dirección and to gerentes with acceso extendido (RRHH, SIG y Medio Ambiente), while closing the currently-open read access so gerentes comunes can no longer view other sectores.

**Architecture:** A new `perfil.acceso_extendido` boolean column, propagated through the session, backs a single `puedeVerTodo` helper used by every route guard (navbar filtering, sector-page guard, landing redirect, dashboard guard). The dashboard itself is a Server Component doing 4 aggregate queries against `vista_evaluacion_calculada`, handing the data to three Client Components: an animated header (Framer Motion + lucide-react KPI cards), a Recharts torta+barras pair colored from the existing SICA CSS tokens, and a client-side filterable/sortable table that reuses the already-existing `ValidacionSelect`.

**Tech Stack:** Next.js 16 (App Router) + TypeScript, Tailwind CSS v4, `pg`, Auth.js v5, plus 3 new dependencies for this phase only: `recharts`, `framer-motion`, `lucide-react`.

**Spec:** `docs/superpowers/specs/2026-08-15-fase3c-dashboard-maestro-design.md`

## Global Constraints

- Path alias `@/*` → `./src/*`.
- No test suite exists in this project — verification per task is `npx tsc --noEmit` (must be clean) and `npm run build` (must succeed), plus the existing static `verify:*` scripts where noted. These are the only automated checks an implementer can run in this environment.
- `db:migrate`, `db:seed-users`, `verify:acceso-extendido`, and `verify:rls` all require a live Postgres connection (`DATABASE_URL`/`DATABASE_URL_OWNER`) that is **not available in the agent sandbox** — no task's automated verification depends on running them. They are exercised once, by a human, in the manual verification runbook at the end of this plan.
- Both Postgres `numeric` columns (e.g. `puntaje_ponderado_pct`) and `count(*)` (`bigint`) come back from `pg` as **strings**, not JS numbers — every place that reads one of these from a query result must `Number(...)` it before doing arithmetic, comparison, or sorting on it, or JS will silently do string semantics instead of numeric ones.
- This phase explicitly breaks the "zero new dependencies" rule that held for Fase 3a/3b — `recharts`, `framer-motion`, `lucide-react` are the three approved additions. No other new dependency is in scope.
- `src/app/(app)/sector/[slug]/ValidacionSelect.tsx` and its Server Action `updateValidacionAction` (`src/app/(app)/sector/[slug]/actions.ts`) are reused **unmodified** — the dashboard table imports them as-is, never forks or edits them.
- `db/migrations/0007_enable_rls.sql` is not touched — the read restriction this plan adds is entirely an application-routing concern (`notFound()`/`redirect()`), not a database policy change. SELECT policies stay `using (true)`.
- Spanish UI copy throughout, matching the existing app.
- `perfil.acceso_extendido` is seeded to `true` only for `rrhh@test.local` and `sig@test.local` via `scripts/seed-users.mjs` — never via a manual one-off SQL `UPDATE`.

---

### Task 1: Migration 0008 — `perfil.acceso_extendido`

**Files:**
- Create: `db/migrations/0008_add_acceso_extendido.sql`

**Interfaces:**
- Produces: the column `perfil.acceso_extendido boolean not null default false`. Task 2 (`auth.ts`) selects and returns it; Task 6 (`seed-users.mjs`) writes it.

- [ ] **Step 1: Write `db/migrations/0008_add_acceso_extendido.sql`**

```sql
-- Decisión puntual de negocio (no una regla genérica por sector): habilita
-- que un gerente vea, además de su propio sector editable, el resto de los
-- sectores en solo lectura y el dashboard MAESTRO. Hoy solo RRHH y SIG y
-- Medio Ambiente lo tienen (ver scripts/seed-users.mjs). Un `direccion`
-- nunca necesita esta columna en true — ya tiene acceso total por `rol` —
-- por eso no hay un check cruzado con `rol` como el que sí tiene
-- `gerente_tiene_sector` (migración 0003).
alter table perfil add column acceso_extendido boolean not null default false;
```

- [ ] **Step 2: Lint SQL**

Run: `npm run lint:sql`
Expected: `OK: db/migrations/0008_add_acceso_extendido.sql` appears in the output, and the final line reads `All 9 SQL file(s) parse cleanly.`

- [ ] **Step 3: Commit**

```bash
git add db/migrations/0008_add_acceso_extendido.sql
git commit -m "feat: add perfil.acceso_extendido column"
```

---

### Task 2: Propagate `accesoExtendido` through auth/session

**Files:**
- Modify: `src/types/next-auth.d.ts`
- Modify: `src/auth.ts`

**Interfaces:**
- Consumes: the `perfil.acceso_extendido` column (Task 1).
- Produces: `session.user.accesoExtendido: boolean`, available on every authenticated Server Component/Server Action from here on. Task 3's `puedeVerTodo` helper takes an object shaped `{ rol, accesoExtendido }`; Task 5 (route guards) and Task 10 (dashboard page) call `puedeVerTodo(session.user)` directly, which requires `session.user` to carry this field.

- [ ] **Step 1: Modify `src/types/next-auth.d.ts`**

Replace the whole file:

```ts
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    rol: "gerente" | "direccion";
    sectorId: string | null;
    accesoExtendido: boolean;
  }

  interface Session {
    user: {
      id: string;
      rol: "gerente" | "direccion";
      sectorId: string | null;
      accesoExtendido: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    rol: "gerente" | "direccion";
    sectorId: string | null;
    accesoExtendido: boolean;
  }
}

// `next-auth/jwt` re-exports `JWT` from `@auth/core/jwt` via `export *`, and the
// callbacks in `@auth/core` import `JWT` directly from `@auth/core/jwt`. TypeScript's
// declaration merging does not follow that re-export chain, so the augmentation above
// alone leaves `token.rol`/`token.sectorId` typed as `unknown` inside the `session`
// callback. Augmenting the underlying module directly closes that gap.
declare module "@auth/core/jwt" {
  interface JWT {
    rol: "gerente" | "direccion";
    sectorId: string | null;
    accesoExtendido: boolean;
  }
}
```

- [ ] **Step 2: Modify `src/auth.ts`**

Replace the whole file:

```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { authConfig } from "./auth.config";
import { query } from "./lib/db/query";

type PerfilRow = {
  id: string;
  password_hash: string;
  nombre: string;
  rol: "gerente" | "direccion";
  sector_id: string | null;
  acceso_extendido: boolean;
};

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
          "select id, password_hash, nombre, rol, sector_id, acceso_extendido from perfil where email = $1",
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
          accesoExtendido: row.acceso_extendido,
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
        token.accesoExtendido = user.accesoExtendido;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.rol = token.rol;
        session.user.sectorId = token.sectorId;
        session.user.accesoExtendido = token.accesoExtendido;
      }
      return session;
    },
  },
});
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds (this only confirms the changed auth module compiles — actually exercising a login requires a live database, covered in the manual verification runbook at the end of this plan).

- [ ] **Step 5: Commit**

```bash
git add src/types/next-auth.d.ts src/auth.ts
git commit -m "feat: propagate acceso_extendido through session"
```

---

### Task 3: `puedeVerTodo` permission helper

**Files:**
- Create: `src/lib/permisos.ts`

**Interfaces:**
- Produces: `PerfilAcceso` (interface: `{ rol: "gerente" | "direccion"; accesoExtendido: boolean }`) and `puedeVerTodo(user: PerfilAcceso): boolean`, both named exports from `@/lib/permisos`. `session.user` (Task 2) satisfies `PerfilAcceso` structurally, so every later task calls this as `puedeVerTodo(session.user)` directly. Task 5 (route guards) and Task 10 (dashboard page) both import and call it.

- [ ] **Step 1: Write `src/lib/permisos.ts`**

```ts
export interface PerfilAcceso {
  rol: "gerente" | "direccion";
  accesoExtendido: boolean;
}

// Decisión puntual de negocio, no una regla genérica: hoy solo RRHH y SIG y
// Medio Ambiente tienen accesoExtendido=true (ver scripts/seed-users.mjs).
// Dirección siempre puede ver todo por su rol, sin necesitar el flag.
export function puedeVerTodo(user: PerfilAcceso): boolean {
  return user.rol === "direccion" || user.accesoExtendido;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify the logic with a plain-JS equivalent**

```bash
node -e "
function puedeVerTodo(user) { return user.rol === 'direccion' || user.accesoExtendido; }
console.log(puedeVerTodo({ rol: 'gerente', accesoExtendido: false })); // false
console.log(puedeVerTodo({ rol: 'gerente', accesoExtendido: true }));  // true
console.log(puedeVerTodo({ rol: 'direccion', accesoExtendido: false })); // true
console.log(puedeVerTodo({ rol: 'direccion', accesoExtendido: true }));  // true
"
```
Expected output: `false`, `true`, `true`, `true`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/permisos.ts
git commit -m "feat: add puedeVerTodo permission helper"
```

---

### Task 4: Install visual dependencies + shared chart colors

**Files:**
- Modify: `package.json` (and `package-lock.json`, generated by `npm install`)
- Create: `src/lib/chartColors.ts`

**Interfaces:**
- Produces: `CHART_COLORS` (a `const` object: `{ riesgoAlto, riesgoMedio, riesgoBajo, secondary, textMuted }`, all hex strings), named export from `@/lib/chartColors`. Task 7 (`DashboardCharts.tsx`) imports this to color the pie/bar charts. Also produces the `recharts`, `framer-motion`, `lucide-react` dependencies that Tasks 5, 7, and 9 import from.

- [ ] **Step 1: Install the three dependencies**

```bash
npm install recharts framer-motion lucide-react
```

Expected: `package.json` gains 3 new entries under `"dependencies"`, `package-lock.json` updates, `node_modules` gains the packages. No error output.

- [ ] **Step 2: Write `src/lib/chartColors.ts`**

```ts
// Espeja los valores de :root en src/app/globals.css — mismos colores que ya
// usan los Badge de riesgo (bg-risk-high-bg text-risk-high, etc.), para que
// un gráfico de "PUESTO CLAVE" use el mismo rojo que ya significa "riesgo
// alto" en el resto de la app, en vez de una paleta nueva de Recharts.
// Si globals.css cambia estos hex, actualizar acá también — Recharts recibe
// colores como props (fill/stroke), no puede leer clases de Tailwind.
export const CHART_COLORS = {
  riesgoAlto: "#b91c1c",
  riesgoMedio: "#92400e",
  riesgoBajo: "#15803d",
  secondary: "#2ba5d6",
  textMuted: "#5a6472",
} as const;
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/lib/chartColors.ts
git commit -m "feat: add recharts/framer-motion/lucide-react and shared chart colors"
```

---

### Task 5: Route guards — close cross-sector read access, add dashboard tab

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/app/(app)/components/Navbar.tsx`
- Modify: `src/app/(app)/sector/[slug]/page.tsx`
- Modify: `src/app/(app)/page.tsx`

**Interfaces:**
- Consumes: `puedeVerTodo` (`@/lib/permisos`, Task 3), `session.user.accesoExtendido` (Task 2), `LayoutDashboard` icon (`lucide-react`, Task 4).
- Produces: `Navbar` gains a new required prop `mostrarDashboard: boolean`. No other task consumes `Navbar`'s props directly (it's only rendered from `layout.tsx`, modified in this same task).

- [ ] **Step 1: Replace `src/app/(app)/layout.tsx`**

```tsx
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { query } from "@/lib/db/query";
import { puedeVerTodo } from "@/lib/permisos";
import { Button } from "@/components/ui/Button";
import { Navbar } from "./components/Navbar";

type SectorRow = {
  id: string;
  nombre: string;
  slug: string;
  orden: number;
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const extendido = puedeVerTodo(session.user);
  const sectores = extendido
    ? await query<SectorRow>("select id, nombre, slug, orden from sector order by orden")
    : await query<SectorRow>("select id, nombre, slug, orden from sector where id = $1", [
        session.user.sectorId,
      ]);

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-bg">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 pt-4">
          <h1 className="text-lg font-bold text-primary">F-116 · Puestos Clave</h1>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button type="submit" variant="ghost">
              Cerrar sesión
            </Button>
          </form>
        </div>
        <Navbar
          sectores={sectores}
          rol={session.user.rol}
          sectorId={session.user.sectorId}
          mostrarDashboard={extendido}
        />
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Replace `src/app/(app)/components/Navbar.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { Badge } from "@/components/ui/Badge";

interface Sector {
  id: string;
  nombre: string;
  slug: string;
}

export function Navbar({
  sectores,
  rol,
  sectorId,
  mostrarDashboard,
}: {
  sectores: Sector[];
  rol: "gerente" | "direccion";
  sectorId: string | null;
  mostrarDashboard: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-4 overflow-x-auto border-t border-border px-4 py-2">
      {mostrarDashboard && (
        <Link
          href="/dashboard"
          aria-current={pathname === "/dashboard" ? "page" : undefined}
          className={`flex shrink-0 items-center gap-1.5 border-b-2 px-1 py-2 text-sm font-medium transition-colors ${
            pathname === "/dashboard"
              ? "border-secondary text-primary"
              : "border-transparent text-text-muted hover:text-primary"
          }`}
        >
          <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
          MAESTRO
        </Link>
      )}
      {sectores.map((sector) => {
        const isEditable = rol === "gerente" && sectorId === sector.id;
        const isActive = pathname === `/sector/${sector.slug}`;
        return (
          <Link
            key={sector.id}
            href={`/sector/${sector.slug}`}
            aria-current={isActive ? "page" : undefined}
            className={`flex shrink-0 flex-col items-center gap-1 border-b-2 px-1 py-2 text-sm font-medium transition-colors ${
              isActive ? "border-secondary text-primary" : "border-transparent text-text-muted hover:text-primary"
            }`}
          >
            <span className="whitespace-nowrap">{sector.nombre}</span>
            <Badge variant={isEditable ? "editable" : "solo-lectura"}>
              {isEditable ? "Editable" : "Solo lectura"}
            </Badge>
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 3: Replace `src/app/(app)/sector/[slug]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db/query";
import { puedeVerTodo } from "@/lib/permisos";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { ValidacionSelect } from "./ValidacionSelect";
import { PuestoEvaluacionForm } from "./PuestoEvaluacionForm";

type PuestoRow = {
  evaluacion_id: string;
  puesto_nombre: string;
  puntaje_ponderado_pct: number;
  clasificacion: string;
  nivel_riesgo: string;
  semaforo: string;
  validacion_direccion: string;
  evaluador: string | null;
  fecha_evaluacion: string | null;
};

type PreguntaRow = {
  evaluacion_id: string;
  pregunta_id: string;
  numero: number;
  texto: string;
  ref_iso: string;
  peso_pct: string; // columna numeric — pg la devuelve como string, ver Global Constraints
  puntaje: number | null;
  justificacion: string | null;
};

const RIESGO_VARIANT: Record<string, BadgeVariant> = {
  ALTO: "riesgo-alto",
  MEDIO: "riesgo-medio",
  BAJO: "riesgo-bajo",
};

const VALIDACION_VARIANT: Record<string, BadgeVariant> = {
  pendiente: "validacion-pendiente",
  aprobado: "validacion-aprobado",
  observado: "validacion-observado",
};

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

  const isDireccion = session.user.rol === "direccion";
  const isOwnSector = session.user.rol === "gerente" && session.user.sectorId === sector.id;

  // Gerente sin acceso extendido intentando ver un sector ajeno por URL
  // directa (la navbar de layout.tsx ya no le muestra el link, pero eso no
  // basta como protección — hay que rechazarlo también acá, server-side).
  if (!isOwnSector && !puedeVerTodo(session.user)) {
    notFound();
  }

  const puestos = await query<PuestoRow>(
    `select evaluacion_id, puesto_nombre, puntaje_ponderado_pct, clasificacion, nivel_riesgo, semaforo,
            validacion_direccion, evaluador, to_char(fecha_evaluacion, 'YYYY-MM-DD') as fecha_evaluacion
     from vista_evaluacion_calculada
     where sector_id = $1
     order by puesto_nombre`,
    [sector.id]
  );

  const preguntasPorEvaluacion = new Map<string, PreguntaRow[]>();
  if (isOwnSector) {
    const evaluacionIds = puestos.map((p) => p.evaluacion_id);
    const preguntaRows = await query<PreguntaRow>(
      `select rp.evaluacion_id, pr.id as pregunta_id, pr.numero, pr.texto, pr.ref_iso, pr.peso_pct,
              rp.puntaje, rp.justificacion
       from respuesta_pregunta rp
       join pregunta pr on pr.id = rp.pregunta_id
       where rp.evaluacion_id = any($1::uuid[])
       order by rp.evaluacion_id, pr.numero`,
      [evaluacionIds]
    );
    for (const row of preguntaRows) {
      const existentes = preguntasPorEvaluacion.get(row.evaluacion_id) ?? [];
      existentes.push(row);
      preguntasPorEvaluacion.set(row.evaluacion_id, existentes);
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-primary">{sector.nombre}</h1>
      <div className="flex flex-col gap-3">
        {puestos.map((p) =>
          isOwnSector ? (
            <Card key={p.evaluacion_id}>
              <details open={puestos.length === 1}>
                <summary className="cursor-pointer">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-medium text-text">{p.puesto_nombre}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={RIESGO_VARIANT[p.nivel_riesgo] ?? "validacion-pendiente"}>
                        {p.clasificacion}
                      </Badge>
                      <span className="text-sm text-text-muted">{p.puntaje_ponderado_pct}%</span>
                    </div>
                    <Badge variant={VALIDACION_VARIANT[p.validacion_direccion] ?? "validacion-pendiente"}>
                      {p.validacion_direccion}
                    </Badge>
                  </div>
                </summary>
                <PuestoEvaluacionForm
                  evaluacionId={p.evaluacion_id}
                  slug={slug}
                  evaluador={p.evaluador}
                  fechaEvaluacion={p.fecha_evaluacion}
                  preguntas={(preguntasPorEvaluacion.get(p.evaluacion_id) ?? []).map((row) => ({
                    preguntaId: row.pregunta_id,
                    numero: row.numero,
                    texto: row.texto,
                    refIso: row.ref_iso,
                    pesoPct: Number(row.peso_pct),
                    puntaje: row.puntaje,
                    justificacion: row.justificacion,
                  }))}
                />
              </details>
            </Card>
          ) : (
            <Card
              key={p.evaluacion_id}
              className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="font-medium text-text">{p.puesto_nombre}</span>
              <div className="flex items-center gap-2">
                <Badge variant={RIESGO_VARIANT[p.nivel_riesgo] ?? "validacion-pendiente"}>
                  {p.clasificacion}
                </Badge>
                <span className="text-sm text-text-muted">{p.puntaje_ponderado_pct}%</span>
              </div>
              {isDireccion ? (
                <ValidacionSelect evaluacionId={p.evaluacion_id} estadoActual={p.validacion_direccion} slug={slug} />
              ) : (
                <Badge variant={VALIDACION_VARIANT[p.validacion_direccion] ?? "validacion-pendiente"}>
                  {p.validacion_direccion}
                </Badge>
              )}
            </Card>
          )
        )}
      </div>
    </div>
  );
}
```

(The only functional changes from the version this replaces: the `isDireccion`/`isOwnSector` computation moved above the `puestos` query, and the new `notFound()` guard was inserted right after it. Everything else — types, queries, JSX — is unchanged.)

- [ ] **Step 4: Replace `src/app/(app)/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db/query";
import { puedeVerTodo } from "@/lib/permisos";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) return null;

  // Gerente sin acceso extendido: directo a su propio sector, como hoy.
  if (session.user.rol === "gerente" && !puedeVerTodo(session.user)) {
    const rows = await query<{ slug: string }>("select slug from sector where id = $1", [
      session.user.sectorId,
    ]);
    const propio = rows[0];
    if (propio) redirect(`/sector/${propio.slug}`);
  }

  // Cualquiera con acceso extendido (RRHH, SIG, Dirección) aterriza en el
  // dashboard consolidado en vez de una lista plana de sectores.
  redirect("/dashboard");
}
```

- [ ] **Step 5: Type-check and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds. `/dashboard` will not yet exist as a route (Task 10 creates it) — that's fine, `redirect("/dashboard")` and `href="/dashboard"` don't require the route to exist at build time, only at request time.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/layout.tsx" "src/app/(app)/components/Navbar.tsx" "src/app/(app)/sector/[slug]/page.tsx" "src/app/(app)/page.tsx"
git commit -m "feat: close cross-sector read access, add dashboard tab and landing redirect"
```

---

### Task 6: Seed test users with acceso extendido + verification script

**Files:**
- Modify: `scripts/seed-users.mjs`
- Modify: `docs/superpowers/plans/2026-08-04-credenciales-prueba.md`
- Create: `scripts/verify-acceso-extendido.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `perfil.acceso_extendido` (Task 1).
- Produces: nothing consumed by later tasks — this is a leaf task (test data + a standalone verification script for the human-run manual runbook).

- [ ] **Step 1: Modify `scripts/seed-users.mjs`**

Replace the `USERS` array and the `main` function's insert call:

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
    accesoExtendido: false,
  },
  {
    email: "almacenes@test.local",
    nombre: "Gerente Almacenes (prueba)",
    rol: "gerente",
    sectorSlug: "almacenes",
    passwordEnv: "SEED_PASSWORD_GERENTE_ALMACENES",
    passwordDefault: "Almacenes123!",
    accesoExtendido: false,
  },
  {
    email: "direccion@test.local",
    nombre: "Dirección (prueba)",
    rol: "direccion",
    sectorSlug: null,
    passwordEnv: "SEED_PASSWORD_DIRECCION",
    passwordDefault: "Direccion123!",
    accesoExtendido: false,
  },
  {
    email: "rrhh@test.local",
    nombre: "Gerente RRHH (prueba)",
    rol: "gerente",
    sectorSlug: "recursos-humanos",
    passwordEnv: "SEED_PASSWORD_GERENTE_RRHH",
    passwordDefault: "RRHH123!",
    accesoExtendido: true,
  },
  {
    email: "sig@test.local",
    nombre: "Gerente SIG (prueba)",
    rol: "gerente",
    sectorSlug: "sig-y-medio-ambiente",
    passwordEnv: "SEED_PASSWORD_GERENTE_SIG",
    passwordDefault: "Sig123!",
    accesoExtendido: true,
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
        `insert into perfil (email, password_hash, nombre, rol, sector_id, acceso_extendido)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (email) do update
           set password_hash = excluded.password_hash,
               nombre = excluded.nombre,
               rol = excluded.rol,
               sector_id = excluded.sector_id,
               acceso_extendido = excluded.acceso_extendido`,
        [u.email, passwordHash, u.nombre, u.rol, sectorId, u.accesoExtendido]
      );
      console.log(`OK: ${u.email} (${u.rol}${u.accesoExtendido ? ", acceso extendido" : ""})`);
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

- [ ] **Step 2: Modify `docs/superpowers/plans/2026-08-04-credenciales-prueba.md`**

Replace the whole file:

```markdown
# Credenciales de prueba — Fase 2 / Fase 3c

Generadas por `scripts/seed-users.mjs`. Son credenciales de **prueba/desarrollo**,
no de producción — cambiá las env vars `SEED_PASSWORD_*` antes de correr este
script contra cualquier ambiente real.

| Usuario | Email | Rol | Sector | Acceso extendido | Contraseña (default de desarrollo) |
|---|---|---|---|---|---|
| Gerente Compras | `compras@test.local` | gerente | Compras | No | `Compras123!` |
| Gerente Almacenes | `almacenes@test.local` | gerente | Almacenes | No | `Almacenes123!` |
| Dirección | `direccion@test.local` | direccion | — | (no aplica, ya ve todo por rol) | `Direccion123!` |
| Gerente RRHH | `rrhh@test.local` | gerente | Recursos Humanos | Sí | `RRHH123!` |
| Gerente SIG | `sig@test.local` | gerente | SIG y Medio Ambiente | Sí | `Sig123!` |

Para usar contraseñas distintas, seteá `SEED_PASSWORD_GERENTE_COMPRAS`,
`SEED_PASSWORD_GERENTE_ALMACENES`, `SEED_PASSWORD_DIRECCION`,
`SEED_PASSWORD_GERENTE_RRHH`, `SEED_PASSWORD_GERENTE_SIG` antes de correr
`npm run db:seed-users` — si no están seteadas, usa los defaults de esta tabla.

Casos de uso:
- **Gerente Compras**: sector chico (2 puestos), rápido para probar el flujo
  de escritura editable.
- **Gerente Almacenes**: sector distinto, para el test cruzado de RLS (un
  gerente de un sector no puede escribir en otro).
- **Dirección**: sin sector, solo puede tocar `validacion_puesto`, ve todos
  los sectores y el dashboard MAESTRO.
- **Gerente RRHH / Gerente SIG**: acceso extendido (Fase 3c) — editan su
  propio sector, ven el resto en solo lectura, y ven el dashboard MAESTRO.
  Sirven para probar que un gerente con `acceso_extendido = true` ve más que
  uno sin él (ej. Compras), sin necesitar loguearse como Dirección.
```

- [ ] **Step 3: Write `scripts/verify-acceso-extendido.mjs`**

```js
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
```

- [ ] **Step 4: Add the script to `package.json`**

Add this line to the `"scripts"` object, next to the other `verify:*` entries:

```json
"verify:acceso-extendido": "node scripts/verify-acceso-extendido.mjs",
```

- [ ] **Step 5: Lint SQL and type-check (sanity — these files don't touch SQL/TS directly, but confirm nothing else broke)**

Run: `npm run lint:sql`
Expected: unchanged output from Task 1, `All 9 SQL file(s) parse cleanly.`

Run: `npx tsc --noEmit`
Expected: no errors (these are plain `.mjs` scripts, not part of the TypeScript project, so this just confirms nothing else regressed).

Note: `scripts/verify-acceso-extendido.mjs` itself is **not run** as part of this task's verification — it requires `DATABASE_URL` pointing at a live, already-seeded database, which is not available in this environment. It runs once, by a human, in the manual verification runbook at the end of this plan.

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-users.mjs scripts/verify-acceso-extendido.mjs docs/superpowers/plans/2026-08-04-credenciales-prueba.md package.json
git commit -m "feat: seed RRHH/SIG test users with acceso extendido, add verify script"
```

---

### Task 7: `DashboardCharts` — torta + barras (Recharts)

**Files:**
- Create: `src/app/(app)/dashboard/DashboardCharts.tsx`

**Interfaces:**
- Consumes: `CHART_COLORS` (`@/lib/chartColors`, Task 4), `recharts` (Task 4).
- Produces: `DistribucionClasificacion` (interface: `{ clasificacion: string; cantidad: number }`), `PuestosPorSector` (interface: `{ sector: string; cantidad: number }`), and `DashboardCharts` (component, props `{ distribucion: DistribucionClasificacion[]; porSector: PuestosPorSector[] }`), all named exports from `./DashboardCharts`. Task 10 (`dashboard/page.tsx`) imports all three, builds the two arrays from its own queries (converting `count(*)` strings to numbers first — see Global Constraints), and renders `<DashboardCharts distribucion={...} porSector={...} />`.

- [ ] **Step 1: Write `src/app/(app)/dashboard/DashboardCharts.tsx`**

```tsx
"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { CHART_COLORS } from "@/lib/chartColors";

export interface DistribucionClasificacion {
  clasificacion: string;
  cantidad: number;
}

export interface PuestosPorSector {
  sector: string;
  cantidad: number;
}

interface DashboardChartsProps {
  distribucion: DistribucionClasificacion[];
  porSector: PuestosPorSector[];
}

const COLOR_POR_CLASIFICACION: Record<string, string> = {
  "PUESTO CLAVE": CHART_COLORS.riesgoAlto,
  "PUESTO DE ATENCIÓN": CHART_COLORS.riesgoMedio,
  "NO ES PUESTO CLAVE": CHART_COLORS.riesgoBajo,
};

export function DashboardCharts({ distribucion, porSector }: DashboardChartsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="h-72 w-full rounded-lg border border-border bg-bg-subtle p-4">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={distribucion}
              dataKey="cantidad"
              nameKey="clasificacion"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
            >
              {distribucion.map((d) => (
                <Cell
                  key={d.clasificacion}
                  fill={COLOR_POR_CLASIFICACION[d.clasificacion] ?? CHART_COLORS.textMuted}
                />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="h-72 w-full rounded-lg border border-border bg-bg-subtle p-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={porSector}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="sector" tick={{ fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={70} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="cantidad" fill={CHART_COLORS.riesgoAlto} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds (component isn't rendered anywhere yet — this only confirms it compiles standalone; Task 10 wires it up for real).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/dashboard/DashboardCharts.tsx"
git commit -m "feat: add DashboardCharts component (torta + barras)"
```

---

### Task 8: `TablaConsolidada` — filterable/sortable table

**Files:**
- Create: `src/app/(app)/dashboard/TablaConsolidada.tsx`

**Interfaces:**
- Consumes: `Badge`/`BadgeVariant` (`@/components/ui/Badge`, already in the codebase), `ValidacionSelect` (`../sector/[slug]/ValidacionSelect`, already in the codebase — same component the sector page already uses, unmodified).
- Produces: `ConsolidadoRow` (interface, listed below) and `TablaConsolidada` (component, props `{ rows: ConsolidadoRow[]; esDireccion: boolean }`), both named exports from `./TablaConsolidada`. Task 10 (`dashboard/page.tsx`) imports both, builds the `rows` array from its own query (converting `puntaje_ponderado_pct` from string to number first — see Global Constraints), and renders `<TablaConsolidada rows={...} esDireccion={session.user.rol === "direccion"} />`.

- [ ] **Step 1: Write `src/app/(app)/dashboard/TablaConsolidada.tsx`**

```tsx
"use client";

import { useMemo, useState } from "react";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { ValidacionSelect } from "../sector/[slug]/ValidacionSelect";

export interface ConsolidadoRow {
  evaluacion_id: string;
  sector: string;
  sector_slug: string;
  puesto_nombre: string;
  evaluador: string | null;
  fecha_evaluacion: string | null;
  puntaje_ponderado_pct: number;
  clasificacion: string;
  nivel_riesgo: string;
  semaforo: string;
  validacion_direccion: string;
}

interface TablaConsolidadaProps {
  rows: ConsolidadoRow[];
  esDireccion: boolean;
}

const RIESGO_VARIANT: Record<string, BadgeVariant> = {
  ALTO: "riesgo-alto",
  MEDIO: "riesgo-medio",
  BAJO: "riesgo-bajo",
};

const VALIDACION_VARIANT: Record<string, BadgeVariant> = {
  pendiente: "validacion-pendiente",
  aprobado: "validacion-aprobado",
  observado: "validacion-observado",
};

type ColumnaOrdenable = "sector" | "puesto_nombre" | "evaluador" | "fecha_evaluacion" | "puntaje_ponderado_pct" | "clasificacion" | "nivel_riesgo";

const COLUMNAS: { key: ColumnaOrdenable; label: string }[] = [
  { key: "sector", label: "Sector" },
  { key: "puesto_nombre", label: "Puesto" },
  { key: "evaluador", label: "Evaluador" },
  { key: "fecha_evaluacion", label: "Fecha" },
  { key: "puntaje_ponderado_pct", label: "Puntaje" },
  { key: "clasificacion", label: "Clasificación" },
  { key: "nivel_riesgo", label: "Riesgo" },
];

export function TablaConsolidada({ rows, esDireccion }: TablaConsolidadaProps) {
  const [filtroSector, setFiltroSector] = useState("");
  const [filtroClasificacion, setFiltroClasificacion] = useState("");
  const [orden, setOrden] = useState<{ columna: ColumnaOrdenable; direccion: "asc" | "desc" }>({
    columna: "sector",
    direccion: "asc",
  });

  const sectores = useMemo(() => Array.from(new Set(rows.map((r) => r.sector))).sort(), [rows]);
  const clasificaciones = useMemo(() => Array.from(new Set(rows.map((r) => r.clasificacion))).sort(), [rows]);

  const filasVisibles = useMemo(() => {
    let resultado = rows;
    if (filtroSector) resultado = resultado.filter((r) => r.sector === filtroSector);
    if (filtroClasificacion) resultado = resultado.filter((r) => r.clasificacion === filtroClasificacion);
    const { columna, direccion } = orden;
    const factor = direccion === "asc" ? 1 : -1;
    return [...resultado].sort((a, b) => {
      const va = a[columna];
      const vb = b[columna];
      if (va === null) return 1;
      if (vb === null) return -1;
      if (va < vb) return -1 * factor;
      if (va > vb) return 1 * factor;
      return 0;
    });
  }, [rows, filtroSector, filtroClasificacion, orden]);

  function alternarOrden(columna: ColumnaOrdenable) {
    setOrden((prev) =>
      prev.columna === columna
        ? { columna, direccion: prev.direccion === "asc" ? "desc" : "asc" }
        : { columna, direccion: "asc" }
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <select
          value={filtroSector}
          onChange={(e) => setFiltroSector(e.target.value)}
          className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-secondary focus:border-secondary"
        >
          <option value="">Todos los sectores</option>
          {sectores.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={filtroClasificacion}
          onChange={(e) => setFiltroClasificacion(e.target.value)}
          className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-secondary focus:border-secondary"
        >
          <option value="">Todas las clasificaciones</option>
          {clasificaciones.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-subtle text-text-muted">
              <th className="px-2 py-2 font-medium">N°</th>
              {COLUMNAS.map((c) => (
                <th
                  key={c.key}
                  className="cursor-pointer select-none px-2 py-2 font-medium"
                  onClick={() => alternarOrden(c.key)}
                >
                  {c.label}
                  {orden.columna === c.key && (orden.direccion === "asc" ? " ▲" : " ▼")}
                </th>
              ))}
              <th className="px-2 py-2 font-medium">Semáforo</th>
              <th className="px-2 py-2 font-medium">Validación</th>
            </tr>
          </thead>
          <tbody>
            {filasVisibles.map((r, i) => (
              <tr key={r.evaluacion_id} className="border-b border-border last:border-0">
                <td className="px-2 py-2 text-text-muted">{i + 1}</td>
                <td className="px-2 py-2">{r.sector}</td>
                <td className="px-2 py-2">{r.puesto_nombre}</td>
                <td className="px-2 py-2">{r.evaluador ?? "—"}</td>
                <td className="px-2 py-2">{r.fecha_evaluacion ?? "—"}</td>
                <td className="px-2 py-2">{r.puntaje_ponderado_pct}%</td>
                <td className="px-2 py-2">
                  <Badge variant={RIESGO_VARIANT[r.nivel_riesgo] ?? "validacion-pendiente"}>{r.clasificacion}</Badge>
                </td>
                <td className="px-2 py-2">{r.nivel_riesgo}</td>
                <td className="px-2 py-2 text-base">{r.semaforo}</td>
                <td className="px-2 py-2">
                  {esDireccion ? (
                    <ValidacionSelect
                      evaluacionId={r.evaluacion_id}
                      estadoActual={r.validacion_direccion}
                      slug={r.sector_slug}
                    />
                  ) : (
                    <Badge variant={VALIDACION_VARIANT[r.validacion_direccion] ?? "validacion-pendiente"}>
                      {r.validacion_direccion}
                    </Badge>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds (component isn't rendered anywhere yet — Task 10 wires it up).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/dashboard/TablaConsolidada.tsx"
git commit -m "feat: add TablaConsolidada component"
```

---

### Task 9: `DashboardHeader` — animated title + KPI cards

**Files:**
- Create: `src/app/(app)/dashboard/DashboardHeader.tsx`

**Interfaces:**
- Consumes: `Card` (`@/components/ui/Card`, already in the codebase), `framer-motion` and `lucide-react` (Task 4).
- Produces: `KpiValores` (interface: `{ total: number; puestoClave: number; pctPuestoClave: number; puestoAtencion: number }`) and `DashboardHeader` (component, props `{ kpis: KpiValores }`), both named exports from `./DashboardHeader`. Task 10 (`dashboard/page.tsx`) computes `KpiValores` from its own KPI query (converting `count(*)` strings to numbers first, then computing `pctPuestoClave` in JS — see Global Constraints) and renders `<DashboardHeader kpis={...} />`.

- [ ] **Step 1: Write `src/app/(app)/dashboard/DashboardHeader.tsx`**

```tsx
"use client";

import { motion } from "framer-motion";
import { Users, KeySquare, TrendingUp, AlertTriangle, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";

export interface KpiValores {
  total: number;
  puestoClave: number;
  pctPuestoClave: number;
  puestoAtencion: number;
}

const PALABRAS_TITULO = ["Dashboard", "MAESTRO"];

export function DashboardHeader({ kpis }: { kpis: KpiValores }) {
  const cards: { label: string; value: string | number; Icon: LucideIcon }[] = [
    { label: "Puestos evaluados", value: kpis.total, Icon: Users },
    { label: "Puesto Clave", value: kpis.puestoClave, Icon: KeySquare },
    { label: "% Puesto Clave", value: `${kpis.pctPuestoClave}%`, Icon: TrendingUp },
    { label: "Puesto de Atención", value: kpis.puestoAtencion, Icon: AlertTriangle },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="flex flex-wrap gap-2 text-2xl font-bold text-primary">
        {PALABRAS_TITULO.map((palabra, i) => (
          <motion.span
            key={palabra}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.12, duration: 0.4 }}
          >
            {palabra}
          </motion.span>
        ))}
      </h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(({ label, value, Icon }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08, duration: 0.35 }}
          >
            <Card className="flex flex-col gap-1">
              <Icon className="h-5 w-5 text-secondary" aria-hidden="true" />
              <span className="text-2xl font-bold text-text">{value}</span>
              <span className="text-xs text-text-muted">{label}</span>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/dashboard/DashboardHeader.tsx"
git commit -m "feat: add DashboardHeader component (animated title + KPI cards)"
```

---

### Task 10: `/dashboard` page — wire queries and all three components together

**Files:**
- Create: `src/app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `puedeVerTodo` (`@/lib/permisos`, Task 3), `DashboardHeader`/`KpiValores` (Task 9), `DashboardCharts`/`DistribucionClasificacion`/`PuestosPorSector` (Task 7), `TablaConsolidada`/`ConsolidadoRow` (Task 8).

- [ ] **Step 1: Write `src/app/(app)/dashboard/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db/query";
import { puedeVerTodo } from "@/lib/permisos";
import { DashboardHeader, type KpiValores } from "./DashboardHeader";
import { DashboardCharts, type DistribucionClasificacion, type PuestosPorSector } from "./DashboardCharts";
import { TablaConsolidada, type ConsolidadoRow } from "./TablaConsolidada";

type KpiRow = { total: string; puesto_clave: string; puesto_atencion: string };
type DistribucionRow = { clasificacion: string; cantidad: string };
type PorSectorRow = { sector: string; cantidad: string };
type ConsolidadoDbRow = {
  evaluacion_id: string;
  sector: string;
  sector_slug: string;
  puesto_nombre: string;
  evaluador: string | null;
  fecha_evaluacion: string | null;
  puntaje_ponderado_pct: string;
  clasificacion: string;
  nivel_riesgo: string;
  semaforo: string;
  validacion_direccion: string;
};

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) return null;

  if (!puedeVerTodo(session.user)) {
    // Gerente sin acceso extendido forzando la URL directamente — la navbar
    // ya no le muestra este link, pero hay que rechazarlo también acá.
    const rows = await query<{ slug: string }>("select slug from sector where id = $1", [
      session.user.sectorId,
    ]);
    redirect(`/sector/${rows[0]?.slug ?? ""}`);
  }

  const [kpiRows, distribucionRows, porSectorRows, consolidadoRows] = await Promise.all([
    query<KpiRow>(
      `select count(*) as total,
              count(*) filter (where clasificacion = 'PUESTO CLAVE') as puesto_clave,
              count(*) filter (where clasificacion = 'PUESTO DE ATENCIÓN') as puesto_atencion
       from vista_evaluacion_calculada`
    ),
    query<DistribucionRow>(
      `select clasificacion, count(*) as cantidad from vista_evaluacion_calculada group by clasificacion`
    ),
    query<PorSectorRow>(
      `select s.nombre as sector, count(*) as cantidad
       from vista_evaluacion_calculada v
       join sector s on s.id = v.sector_id
       where v.clasificacion = 'PUESTO CLAVE'
       group by s.nombre, s.orden
       order by s.orden`
    ),
    query<ConsolidadoDbRow>(
      `select v.evaluacion_id, s.nombre as sector, s.slug as sector_slug, v.puesto_nombre, v.evaluador,
              to_char(v.fecha_evaluacion, 'YYYY-MM-DD') as fecha_evaluacion,
              v.puntaje_ponderado_pct, v.clasificacion, v.nivel_riesgo, v.semaforo, v.validacion_direccion
       from vista_evaluacion_calculada v
       join sector s on s.id = v.sector_id
       order by s.orden, v.puesto_nombre`
    ),
  ]);

  const total = Number(kpiRows[0]?.total ?? 0);
  const puestoClave = Number(kpiRows[0]?.puesto_clave ?? 0);
  const puestoAtencion = Number(kpiRows[0]?.puesto_atencion ?? 0);
  const kpis: KpiValores = {
    total,
    puestoClave,
    pctPuestoClave: total === 0 ? 0 : Math.round((puestoClave / total) * 1000) / 10,
    puestoAtencion,
  };

  const distribucion: DistribucionClasificacion[] = distribucionRows.map((r) => ({
    clasificacion: r.clasificacion,
    cantidad: Number(r.cantidad),
  }));
  const porSector: PuestosPorSector[] = porSectorRows.map((r) => ({
    sector: r.sector,
    cantidad: Number(r.cantidad),
  }));
  const consolidado: ConsolidadoRow[] = consolidadoRows.map((r) => ({
    ...r,
    puntaje_ponderado_pct: Number(r.puntaje_ponderado_pct),
  }));

  return (
    <div className="flex flex-col gap-6">
      <DashboardHeader kpis={kpis} />
      <DashboardCharts distribucion={distribucion} porSector={porSector} />
      <TablaConsolidada rows={consolidado} esDireccion={session.user.rol === "direccion"} />
    </div>
  );
}
```

- [ ] **Step 2: Type-check and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds, `/dashboard` now appears in the route list (as a dynamic `ƒ` route, same as `/sector/[slug]`).

- [ ] **Step 3: Run the existing static verification scripts (no schema/seed changes in this task, should still pass)**

Run: `npm run lint:sql && npm run verify:seed-counts && npm run verify:real-scores`
Expected: all three still `OK`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/dashboard/page.tsx"
git commit -m "feat: wire dashboard page (KPIs, charts, tabla consolidada)"
```

---

## Final check

Run once, after Task 10:

```bash
npx tsc --noEmit
npm run build
npm run lint:sql
npm run verify:seed-counts
npm run verify:real-scores
```

All five must be clean. This confirms every task's automated verification still holds together as a whole and that nothing under `db/` or `scripts/*.mjs` (other than the two files this plan intentionally added/modified in Task 6) regressed.

## Manual verification runbook (requires a live database — cannot run in the agent sandbox)

A human with `DATABASE_URL`/`DATABASE_URL_OWNER` pointing at a real (or local) Postgres needs to:

1. `npm run db:migrate` — applies migration 0008.
2. `npm run db:seed-users` — creates/updates all 5 test users, including the 2 new ones with `acceso_extendido = true`.
3. `npm run verify:acceso-extendido` — confirms exactly `rrhh@test.local` and `sig@test.local` have the flag set.
4. `npm run verify:rls` — confirms migration 0008 didn't disturb any RLS policy (it shouldn't have touched them at all, but this is cheap to re-confirm).
5. `npm run dev`, then in a browser, using the credentials from `docs/superpowers/plans/2026-08-04-credenciales-prueba.md`:
   - **Gerente Compras** (no acceso extendido): navbar shows only "Compras". Typing `/sector/almacenes` directly in the URL bar → 404. No "MAESTRO" tab. Typing `/dashboard` directly → redirected back to `/sector/compras`. Logging in lands on `/sector/compras` (unchanged from Fase 3b).
   - **Gerente RRHH** (acceso extendido): navbar shows all 12 sectores + "MAESTRO". The 11 sectores ajenos are read-only (no `<details>`, no form); "Recursos Humanos" (their own) is editable, same as Fase 3b behavior. Logging in lands on `/dashboard`.
   - **Dirección**: same total access as before Fase 3c, plus the "MAESTRO" tab. From the dashboard's tabla consolidada, can change "Validación de Dirección" for any row — confirm it saves (success message) and that navigating to that puesto's own `/sector/[slug]` page shows the same updated value.
   - On `/dashboard`: the pie chart's slice counts, the bar chart's per-sector counts, and the tabla's row count/filters should all agree with each other for the same 76 puestos (e.g. sum of the pie chart's 3 slices = total KPI = number of rows in the unfiltered table).
   - Filter the tabla by sector and by clasificación, click a couple of column headers to sort — all client-side, no page reload, no console errors.
