# Fase 3d — Múltiples roles por perfil Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a single `perfil` (login) hold multiple roles at once — specifically, let RRHH and SIG y Medio Ambiente be `gerente` of their own sector **and** `direccion` (full validation capability across every sector) with one login, replacing the read-only `acceso_extendido` flag from Fase 3c.

**Architecture:** A new `perfil_rol` junction table (N rows per perfil: each `gerente` row carries its `sector_id`, each `direccion` row doesn't) replaces the single `rol`/`sector_id` columns on `perfil`. The session collapses that to two derived fields — `esDireccion: boolean` and `sectoresGerente: string[]`. `db/migrations/0007_enable_rls.sql` and `withUserContext`'s signature are **not touched** — every Server Action still resolves and passes exactly one `{rol, sectorId}` pair per transaction, chosen by which action is being called (saving an evaluación always means acting as gerente of that evaluación's sector; validating a puesto always means acting as dirección), never by a "current role" the user picks in the UI.

**Tech Stack:** Next.js 16 (App Router) + TypeScript, `pg`, Auth.js v5. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-18-multi-rol-perfil-design.md`

## Global Constraints

- Path alias `@/*` → `./src/*`.
- No test suite exists in this project — verification per task is `npx tsc --noEmit` (must be clean) and `npm run build` (must succeed), plus the existing static `verify:*` scripts where noted.
- `db:migrate`, `db:seed-users`, `verify:roles`, and `verify:rls` all require a live Postgres connection not available in the agent sandbox — no task's automated verification depends on running them. They run once, by a human, in the manual runbook at the end of this plan.
- **`db/migrations/0007_enable_rls.sql` is not touched by any task in this plan.** Its policies keep comparing a single `current_setting('app.rol', true)`/`current_setting('app.sector_id', true)` per transaction, exactly as today.
- **`withUserContext`'s signature does not change**: `withUserContext(user: { id: string; rol: "gerente" | "direccion"; sectorId: string | null }, fn) => Promise<T>`. Callers resolve which single `{rol, sectorId}` pair applies to the specific action before calling it.
- After Task 1, `perfil.rol`, `perfil.sector_id`, and `perfil.acceso_extendido` no longer exist — every later task must fully stop reading them (no dual-read fallback period; this is a clean cut, not a migration window).
- No new npm dependencies.
- Spanish UI copy and error messages throughout, matching the existing app.

---

### Task 1: Migration 0009 — `perfil_rol`

**Files:**
- Create: `db/migrations/0009_perfil_multi_rol.sql`

**Interfaces:**
- Produces: table `perfil_rol(id, perfil_id, rol, sector_id)` with the same `rol`/`sector_id` semantics `perfil` had (`gerente` requires `sector_id`, `direccion` forbids it). Task 2 (`auth.ts`) selects from it. Task 6 (`seed-users.mjs`) writes to it.
- Drops `perfil.rol`, `perfil.sector_id`, `perfil.acceso_extendido` — no task after this one may read them from `perfil`.

- [ ] **Step 1: Write `db/migrations/0009_perfil_multi_rol.sql`**

```sql
create table perfil_rol (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfil(id) on delete cascade,
  rol text not null check (rol in ('gerente','direccion')),
  sector_id uuid references sector(id),
  constraint gerente_tiene_sector check (
    (rol = 'gerente' and sector_id is not null) or (rol = 'direccion' and sector_id is null)
  )
);

-- Un perfil no puede tener el mismo (rol, sector) dos veces, ni dos filas
-- 'direccion' (sector_id null rompe un unique común porque Postgres trata
-- cada NULL como distinto de los demás — de ahí los 2 índices parciales).
create unique index perfil_rol_gerente_unico on perfil_rol (perfil_id, sector_id) where rol = 'gerente';
create unique index perfil_rol_direccion_unico on perfil_rol (perfil_id) where rol = 'direccion';

-- Migra los 5 perfiles existentes: cada uno pasa a tener exactamente 1 fila
-- en perfil_rol con su rol/sector actual.
insert into perfil_rol (perfil_id, rol, sector_id)
select id, rol, sector_id from perfil;

-- RRHH y SIG suman la segunda fila (dirección), sin perder la de gerente —
-- ver docs/superpowers/specs/2026-08-18-multi-rol-perfil-design.md.
insert into perfil_rol (perfil_id, rol, sector_id)
select id, 'direccion', null from perfil where email in ('rrhh@test.local', 'sig@test.local');

alter table perfil drop constraint gerente_tiene_sector;
alter table perfil drop column rol;
alter table perfil drop column sector_id;
alter table perfil drop column acceso_extendido;

grant select on perfil_rol to puestos_clave_app;
```

- [ ] **Step 2: Lint SQL**

Run: `npm run lint:sql`
Expected: `OK: db/migrations/0009_perfil_multi_rol.sql` appears in the output, final line reads `All 10 SQL file(s) parse cleanly.`

- [ ] **Step 3: Commit**

```bash
git add db/migrations/0009_perfil_multi_rol.sql
git commit -m "feat: add perfil_rol table, retire perfil.rol/sector_id/acceso_extendido"
```

---

### Task 2: Auth/session — `esDireccion` + `sectoresGerente`

**Files:**
- Modify: `src/types/next-auth.d.ts`
- Modify: `src/auth.ts`

**Interfaces:**
- Consumes: `perfil_rol` (Task 1).
- Produces: `session.user.esDireccion: boolean` and `session.user.sectoresGerente: string[]` (sector ids, ordered by `sector.orden`), replacing `session.user.rol`/`sectorId`/`accesoExtendido` everywhere. Task 3 (`permisos.ts`), Task 4 (route guards), and Task 5 (Server Actions) all read these two fields from `session.user`.

- [ ] **Step 1: Replace `src/types/next-auth.d.ts`**

```ts
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    esDireccion: boolean;
    sectoresGerente: string[];
  }

  interface Session {
    user: {
      id: string;
      esDireccion: boolean;
      sectoresGerente: string[];
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    esDireccion: boolean;
    sectoresGerente: string[];
  }
}

// `next-auth/jwt` re-exports `JWT` from `@auth/core/jwt` via `export *`, and the
// callbacks in `@auth/core` import `JWT` directly from `@auth/core/jwt`. TypeScript's
// declaration merging does not follow that re-export chain, so the augmentation above
// alone leaves `token.esDireccion`/`token.sectoresGerente` typed as `unknown` inside the
// `session` callback. Augmenting the underlying module directly closes that gap.
declare module "@auth/core/jwt" {
  interface JWT {
    esDireccion: boolean;
    sectoresGerente: string[];
  }
}
```

- [ ] **Step 2: Replace `src/auth.ts`**

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
};

type PerfilRolRow = {
  rol: "gerente" | "direccion";
  sector_id: string | null;
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
          "select id, password_hash, nombre from perfil where email = $1",
          [email]
        );
        const row = rows[0];
        if (!row) return null;

        const valid = await bcrypt.compare(password, row.password_hash);
        if (!valid) return null;

        // Join a sector para que sectoresGerente salga ya ordenado por
        // sector.orden — así (app)/page.tsx puede tomar el primero sin
        // ambigüedad si algún día un perfil tiene más de un sector gerente.
        const rolesRows = await query<PerfilRolRow>(
          `select pr.rol, pr.sector_id
           from perfil_rol pr
           left join sector s on s.id = pr.sector_id
           where pr.perfil_id = $1
           order by s.orden`,
          [row.id]
        );
        const esDireccion = rolesRows.some((r) => r.rol === "direccion");
        const sectoresGerente = rolesRows
          .filter((r) => r.rol === "gerente")
          .map((r) => r.sector_id as string);

        return {
          id: row.id,
          email,
          name: row.nombre,
          esDireccion,
          sectoresGerente,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.esDireccion = user.esDireccion;
        token.sectoresGerente = user.sectoresGerente;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.esDireccion = token.esDireccion;
        session.user.sectoresGerente = token.sectoresGerente;
      }
      return session;
    },
  },
});
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: errors in every file that still reads `session.user.rol`/`sectorId`/`accesoExtendido` (Task 3-5 fix these) — this is expected at this point in the plan, not a failure of this task. Confirm the errors are ONLY in files this plan touches later (`src/lib/permisos.ts`, `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx`, `src/app/(app)/sector/[slug]/page.tsx`, `src/app/(app)/sector/[slug]/evaluacionActions.ts`, `src/app/(app)/sector/[slug]/actions.ts`, `src/app/(app)/components/Navbar.tsx`, `src/app/(app)/dashboard/page.tsx`) and not in `src/auth.ts` or `src/types/next-auth.d.ts` themselves.

- [ ] **Step 4: Commit**

```bash
git add src/types/next-auth.d.ts src/auth.ts
git commit -m "feat: propagate esDireccion/sectoresGerente through session"
```

---

### Task 3: `permisos.ts` — simplify `puedeVerTodo`

**Files:**
- Modify: `src/lib/permisos.ts`

**Interfaces:**
- Consumes: `session.user.esDireccion` (Task 2).
- Produces: `puedeVerTodo(user: { esDireccion: boolean }): boolean` — same exported name and call signature shape (still takes an object, still returns `boolean`), body simplified. Task 4 (route guards) keeps calling `puedeVerTodo(session.user)` exactly as before.

- [ ] **Step 1: Replace `src/lib/permisos.ts`**

```ts
export interface PerfilAcceso {
  esDireccion: boolean;
}

// Con roles múltiples (perfil_rol, Fase 3d), tener el rol dirección ya da
// acceso a todo — no hace falta un flag aparte como el acceso_extendido
// de Fase 3c (retirado en esta fase).
export function puedeVerTodo(user: PerfilAcceso): boolean {
  return user.esDireccion;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no NEW errors introduced by this file; errors in the not-yet-updated call sites persist (Task 4/5 fix them).

- [ ] **Step 3: Commit**

```bash
git add src/lib/permisos.ts
git commit -m "feat: simplify puedeVerTodo to use esDireccion"
```

---

### Task 4: Route guards & landing — `esDireccion`/`sectoresGerente`

**Files:**
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/app/(app)/components/Navbar.tsx`
- Modify: `src/app/(app)/page.tsx`
- Modify: `src/app/(app)/sector/[slug]/page.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `puedeVerTodo` (`@/lib/permisos`, Task 3), `session.user.esDireccion`/`sectoresGerente` (Task 2).
- Produces: `Navbar`'s prop shape changes from `{ sectores, rol, sectorId, mostrarDashboard }` to `{ sectores, sectoresGerente, mostrarDashboard }` — the only consumer is `layout.tsx`, modified in this same task.

- [ ] **Step 1: Replace `src/app/(app)/components/Navbar.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Building2 } from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/Badge";

interface Sector {
  id: string;
  nombre: string;
  slug: string;
}

export function Navbar({
  sectores,
  sectoresGerente,
  mostrarDashboard,
}: {
  sectores: Sector[];
  sectoresGerente: string[];
  mostrarDashboard: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav className="flex gap-4 overflow-x-auto border-t border-border px-4 py-2">
      {mostrarDashboard && (
        <Link
          href="/dashboard"
          aria-current={pathname === "/dashboard" ? "page" : undefined}
          className={`relative flex shrink-0 items-center gap-1.5 px-1 py-2 text-sm font-medium transition-colors ${
            pathname === "/dashboard" ? "text-primary" : "text-text-muted hover:text-primary"
          }`}
        >
          <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
          MAESTRO
          {pathname === "/dashboard" && (
            <motion.span
              layoutId="nav-indicator"
              className="absolute inset-x-0 -bottom-px h-0.5 bg-secondary"
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          )}
        </Link>
      )}
      {sectores.map((sector) => {
        const isEditable = sectoresGerente.includes(sector.id);
        const isActive = pathname === `/sector/${sector.slug}`;
        return (
          <Link
            key={sector.id}
            href={`/sector/${sector.slug}`}
            aria-current={isActive ? "page" : undefined}
            className={`relative flex shrink-0 flex-col items-center gap-1 px-1 py-2 text-sm font-medium transition-colors ${
              isActive ? "text-primary" : "text-text-muted hover:text-primary"
            }`}
          >
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
              {sector.nombre}
            </span>
            <Badge variant={isEditable ? "editable" : "solo-lectura"}>
              {isEditable ? "Editable" : "Solo lectura"}
            </Badge>
            {isActive && (
              <motion.span
                layoutId="nav-indicator"
                className="absolute inset-x-0 -bottom-px h-0.5 bg-secondary"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Replace `src/app/(app)/layout.tsx`**

```tsx
import Image from "next/image";
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
    : await query<SectorRow>(
        "select id, nombre, slug, orden from sector where id = any($1::uuid[]) order by orden",
        [session.user.sectoresGerente]
      );

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-border bg-bg">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 pt-4">
          <div className="flex items-center gap-2">
            <Image src="/sica-logo.png" alt="SICA" width={90} height={35} priority />
            <h1 className="text-lg font-bold text-primary">F-116 · Puestos Clave</h1>
          </div>
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
          sectoresGerente={session.user.sectoresGerente}
          mostrarDashboard={extendido}
        />
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Replace `src/app/(app)/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db/query";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user) return null;

  // Sin rol dirección: directo al primer sector gerente (sectoresGerente ya
  // viene ordenado por sector.orden desde auth.ts — hoy es siempre 0 o 1
  // elemento, el schema soporta más).
  if (!session.user.esDireccion) {
    const propio = session.user.sectoresGerente[0];
    if (propio) {
      const rows = await query<{ slug: string }>("select slug from sector where id = $1", [propio]);
      if (rows[0]) redirect(`/sector/${rows[0].slug}`);
    }
  }

  // Con rol dirección, aterriza en el dashboard consolidado en vez de una
  // lista plana de sectores.
  redirect("/dashboard");
}
```

- [ ] **Step 4: Modify `src/app/(app)/sector/[slug]/page.tsx`**

Replace this block:

```tsx
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db/query";
import { puedeVerTodo } from "@/lib/permisos";
import { Card } from "@/components/ui/Card";
```

with:

```tsx
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db/query";
import { Card } from "@/components/ui/Card";
```

(drops the now-unused `puedeVerTodo` import — this file uses `isDireccion` directly instead).

Replace this block:

```tsx
  const isDireccion = session.user.rol === "direccion";
  const isOwnSector = session.user.rol === "gerente" && session.user.sectorId === sector.id;

  // Gerente sin acceso extendido intentando ver un sector ajeno por URL
  // directa (la navbar de layout.tsx ya no le muestra el link, pero eso no
  // basta como protección — hay que rechazarlo también acá, server-side).
  if (!isOwnSector && !puedeVerTodo(session.user)) {
    notFound();
  }
```

with:

```tsx
  const isDireccion = session.user.esDireccion;
  const isOwnSector = session.user.sectoresGerente.includes(sector.id);

  // Sin rol gerente de ESTE sector ni rol dirección, forzando la URL
  // directa (la navbar de layout.tsx ya no le muestra el link, pero eso no
  // basta como protección — hay que rechazarlo también acá, server-side).
  if (!isOwnSector && !isDireccion) {
    notFound();
  }
```

- [ ] **Step 5: Modify `src/app/(app)/dashboard/page.tsx`**

Replace this block:

```tsx
  if (!puedeVerTodo(session.user)) {
    // Gerente sin acceso extendido forzando la URL directamente — la navbar
    // ya no le muestra este link, pero hay que rechazarlo también acá.
    const rows = await query<{ slug: string }>("select slug from sector where id = $1", [
      session.user.sectorId,
    ]);
    redirect(`/sector/${rows[0]?.slug ?? ""}`);
  }
```

with:

```tsx
  if (!puedeVerTodo(session.user)) {
    // Sin rol dirección forzando la URL directamente — la navbar ya no le
    // muestra este link, pero hay que rechazarlo también acá.
    const propio = session.user.sectoresGerente[0];
    const rows = propio
      ? await query<{ slug: string }>("select slug from sector where id = $1", [propio])
      : [];
    redirect(`/sector/${rows[0]?.slug ?? ""}`);
  }
```

Replace this line:

```tsx
      <TablaConsolidada rows={consolidado} esDireccion={session.user.rol === "direccion"} />
```

with:

```tsx
      <TablaConsolidada rows={consolidado} esDireccion={session.user.esDireccion} />
```

- [ ] **Step 6: Type-check and build**

Run: `npx tsc --noEmit`
Expected: no errors in the 5 files this task touches. Errors may remain in `src/app/(app)/sector/[slug]/evaluacionActions.ts` and `src/app/(app)/sector/[slug]/actions.ts` (Task 5 fixes those) — confirm the remaining errors are scoped to exactly those two files.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/layout.tsx" "src/app/(app)/components/Navbar.tsx" "src/app/(app)/page.tsx" "src/app/(app)/sector/[slug]/page.tsx" "src/app/(app)/dashboard/page.tsx"
git commit -m "feat: adapt route guards and landing redirect to esDireccion/sectoresGerente"
```

---

### Task 5: Server Actions — resolve capacity per action

**Files:**
- Modify: `src/app/(app)/sector/[slug]/evaluacionActions.ts`
- Modify: `src/app/(app)/sector/[slug]/actions.ts`

**Interfaces:**
- Consumes: `session.user.esDireccion`/`sectoresGerente` (Task 2), `withUserContext` (unchanged signature).

- [ ] **Step 1: Replace `src/app/(app)/sector/[slug]/evaluacionActions.ts`**

```tsx
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { query } from "@/lib/db/query";
import { withUserContext } from "@/lib/db/withUserContext";

export interface EvaluacionActionState {
  error?: string;
  ok?: boolean;
}

// Los 7 valores válidos del <select> por pregunta: "NA" (puntaje null) o "0"-"5".
const PUNTAJES_VALIDOS = ["NA", "0", "1", "2", "3", "4", "5"] as const;

// Marcador para distinguir, en el catch de abajo, "la policy de RLS filtró
// alguna fila" de un fallo real de la base: se lanza DENTRO del callback de
// withUserContext para que el COMMIT nunca llegue a ejecutarse (ver más abajo).
class PermisoError extends Error {}

export async function updateEvaluacionAction(
  _prevState: EvaluacionActionState,
  formData: FormData
): Promise<EvaluacionActionState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "No hay sesión activa." };
  }

  const evaluacionId = formData.get("evaluacionId");
  const slug = formData.get("slug");
  const preguntaIdsRaw = formData.get("preguntaIds");
  const evaluador = formData.get("evaluador");
  const fechaEvaluacion = formData.get("fechaEvaluacion");
  if (
    typeof evaluacionId !== "string" ||
    typeof slug !== "string" ||
    typeof preguntaIdsRaw !== "string" ||
    typeof evaluador !== "string" ||
    typeof fechaEvaluacion !== "string"
  ) {
    return { error: "Datos inválidos." };
  }

  // Con roles múltiples (Fase 3d), "sos gerente" ya no alcanza como chequeo —
  // hay que confirmar que el sector de ESTA evaluación esté entre los
  // sectoresGerente del perfil, y usar ESE sector (no un sectorId único de
  // sesión) al abrir la transacción de abajo.
  const sectorRows = await query<{ id: string }>("select id from sector where slug = $1", [slug]);
  const sector = sectorRows[0];
  if (!sector || !session.user.sectoresGerente.includes(sector.id)) {
    return { error: "No tenés permiso para editar esta evaluación." };
  }

  const preguntaIds = preguntaIdsRaw.split(",").filter(Boolean);
  if (preguntaIds.length === 0) {
    return { error: "Datos inválidos." };
  }

  // Validar TODO (whitelist de puntajes + regla de justificación obligatoria)
  // antes de tocar la base: si no, un dato inválido en la mitad del loop dejaría
  // la escritura a medio hacer, o el error de constraint se confundiría con un
  // problema de permisos (mismo criterio que updateValidacionAction).
  const respuestas: { preguntaId: string; puntaje: number | null; justificacion: string }[] = [];
  for (const preguntaId of preguntaIds) {
    const puntajeRaw = formData.get(`puntaje_${preguntaId}`);
    const justificacion = formData.get(`justificacion_${preguntaId}`);
    if (typeof puntajeRaw !== "string" || typeof justificacion !== "string") {
      return { error: "Datos inválidos." };
    }
    if (!(PUNTAJES_VALIDOS as readonly string[]).includes(puntajeRaw)) {
      return { error: "Puntaje inválido." };
    }
    const puntaje = puntajeRaw === "NA" ? null : Number(puntajeRaw);
    if (puntaje !== null && puntaje >= 3 && justificacion.trim() === "") {
      return { error: "Falta justificación en una o más preguntas con puntaje 3 o más." };
    }
    respuestas.push({ preguntaId, puntaje, justificacion });
  }

  try {
    await withUserContext(
      { id: session.user.id, rol: "gerente", sectorId: sector.id },
      async (client) => {
        let count = 0;
        const evalResult = await client.query(
          "update evaluacion set evaluador = $1, fecha_evaluacion = $2, actualizado_en = now() where id = $3 returning id",
          [evaluador || null, fechaEvaluacion || null, evaluacionId]
        );
        count += evalResult.rowCount ?? 0;

        for (const r of respuestas) {
          const result = await client.query(
            "update respuesta_pregunta set puntaje = $1, justificacion = $2 where evaluacion_id = $3 and pregunta_id = $4 returning id",
            [r.puntaje, r.justificacion || null, evaluacionId, r.preguntaId]
          );
          count += result.rowCount ?? 0;
        }

        // Menos filas afectadas que las esperadas (1 de evaluacion + N de
        // respuestas) = la policy de RLS filtró alguna fila (evaluacionId de
        // otro sector, tamperado a mano) sin lanzar error. Se chequea DENTRO
        // del callback y se lanza para que withUserContext haga ROLLBACK en
        // vez de COMMIT.
        const filasEsperadas = 1 + respuestas.length;
        if (count < filasEsperadas) {
          throw new PermisoError();
        }
      }
    );
  } catch (e) {
    if (e instanceof PermisoError) {
      return { error: "No tenés permiso para editar este puesto." };
    }
    // Cualquier fallo real de la base (conexión, constraint inesperado): no es
    // un problema de permisos, y mezclarlo con el caso de arriba confunde.
    return { error: "Ocurrió un error, intentá de nuevo." };
  }

  // La página se renderizó en el servidor con los valores viejos; sin esto
  // quedan desactualizados hasta un reload.
  revalidatePath(`/sector/${slug}`);
  return { ok: true };
}
```

- [ ] **Step 2: Replace `src/app/(app)/sector/[slug]/actions.ts`**

```tsx
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { withUserContext } from "@/lib/db/withUserContext";

export interface ValidacionActionState {
  error?: string;
  ok?: boolean;
}

// Los tres valores del CHECK de validacion_puesto.estado (migración 0003).
const ESTADOS_VALIDOS = ["pendiente", "aprobado", "observado"] as const;

export async function updateValidacionAction(
  _prevState: ValidacionActionState,
  formData: FormData
): Promise<ValidacionActionState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "No hay sesión activa." };
  }
  if (!session.user.esDireccion) {
    return { error: "No tenés permiso para editar este campo." };
  }

  const evaluacionId = formData.get("evaluacionId");
  const estado = formData.get("estado");
  const slug = formData.get("slug");
  if (typeof evaluacionId !== "string" || typeof estado !== "string" || typeof slug !== "string") {
    return { error: "Datos inválidos." };
  }
  // Validar contra la whitelist antes de tocar la base: si no, un POST armado a
  // mano choca contra el CHECK, lanza, y el catch de abajo lo etiquetaría como
  // un problema de permisos.
  if (!(ESTADOS_VALIDOS as readonly string[]).includes(estado)) {
    return { error: "Estado inválido." };
  }

  let rows: unknown[];
  try {
    rows = await withUserContext(
      { id: session.user.id, rol: "direccion", sectorId: null },
      async (client) => {
        const result = await client.query(
          "update validacion_puesto set estado = $1, actualizado_por = $2, actualizado_en = now() where evaluacion_id = $3 returning id",
          [estado, session.user.id, evaluacionId]
        );
        return result.rows;
      }
    );
  } catch {
    // Cualquier fallo real de la base (conexión, constraint inesperado): no es
    // un problema de permisos, y mezclarlo con el caso de abajo confunde.
    return { error: "Ocurrió un error, intentá de nuevo." };
  }

  // 0 filas con la sentencia ejecutada sin error = la política RLS filtró la fila.
  if (rows.length === 0) {
    return { error: "No tenés permiso para editar este sector." };
  }

  // La página se renderizó en el servidor con el valor viejo y el <select> es
  // no controlado, así que sin esto los datos quedan viejos hasta un reload.
  revalidatePath(`/sector/${slug}`);
  return { ok: true };
}
```

- [ ] **Step 3: Type-check and build**

Run: `npx tsc --noEmit`
Expected: no errors anywhere in the project — this is the last task touching TypeScript source.

Run: `npm run build`
Expected: build succeeds, same 6-route output as before (`/`, `/_not-found`, `/api/health`, `/dashboard`, `/login`, `/sector/[slug]`).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/sector/[slug]/evaluacionActions.ts" "src/app/(app)/sector/[slug]/actions.ts"
git commit -m "feat: resolve write capacity per Server Action instead of a single session role"
```

---

### Task 6: Seed script, verification script, docs

**Files:**
- Modify: `scripts/seed-users.mjs`
- Delete: `scripts/verify-acceso-extendido.mjs`
- Create: `scripts/verify-roles.mjs`
- Modify: `package.json`
- Modify: `docs/superpowers/plans/2026-08-04-credenciales-prueba.md`

**Interfaces:**
- Consumes: `perfil_rol` (Task 1).

- [ ] **Step 1: Replace `scripts/seed-users.mjs`**

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
    passwordEnv: "SEED_PASSWORD_GERENTE_COMPRAS",
    passwordDefault: "Compras123!",
    roles: [{ rol: "gerente", sectorSlug: "compras" }],
  },
  {
    email: "almacenes@test.local",
    nombre: "Gerente Almacenes (prueba)",
    passwordEnv: "SEED_PASSWORD_GERENTE_ALMACENES",
    passwordDefault: "Almacenes123!",
    roles: [{ rol: "gerente", sectorSlug: "almacenes" }],
  },
  {
    email: "direccion@test.local",
    nombre: "Dirección (prueba)",
    passwordEnv: "SEED_PASSWORD_DIRECCION",
    passwordDefault: "Direccion123!",
    roles: [{ rol: "direccion" }],
  },
  {
    email: "rrhh@test.local",
    nombre: "Gerente RRHH (prueba)",
    passwordEnv: "SEED_PASSWORD_GERENTE_RRHH",
    passwordDefault: "RRHH123!",
    roles: [{ rol: "gerente", sectorSlug: "recursos-humanos" }, { rol: "direccion" }],
  },
  {
    email: "sig@test.local",
    nombre: "Gerente SIG (prueba)",
    passwordEnv: "SEED_PASSWORD_GERENTE_SIG",
    passwordDefault: "Sig123!",
    roles: [{ rol: "gerente", sectorSlug: "sig-y-medio-ambiente" }, { rol: "direccion" }],
  },
];

async function main() {
  const client = await pool.connect();
  try {
    for (const u of USERS) {
      const password = process.env[u.passwordEnv] ?? u.passwordDefault;
      const passwordHash = await bcrypt.hash(password, 10);

      const { rows } = await client.query(
        `insert into perfil (email, password_hash, nombre)
         values ($1, $2, $3)
         on conflict (email) do update
           set password_hash = excluded.password_hash,
               nombre = excluded.nombre
         returning id`,
        [u.email, passwordHash, u.nombre]
      );
      const perfilId = rows[0].id;

      // Reemplaza todas las filas de rol del perfil por las declaradas acá —
      // más simple que un upsert por fila con clave compuesta, y esta tabla
      // solo la escribe este script (nunca la UI).
      await client.query("delete from perfil_rol where perfil_id = $1", [perfilId]);
      for (const r of u.roles) {
        let sectorId = null;
        if (r.sectorSlug) {
          const sectorRows = await client.query("select id from sector where slug = $1", [r.sectorSlug]);
          if (sectorRows.rows.length === 0) {
            throw new Error(`Sector not found: ${r.sectorSlug}`);
          }
          sectorId = sectorRows.rows[0].id;
        }
        await client.query("insert into perfil_rol (perfil_id, rol, sector_id) values ($1, $2, $3)", [
          perfilId,
          r.rol,
          sectorId,
        ]);
      }

      const rolesDesc = u.roles.map((r) => (r.sectorSlug ? `${r.rol}:${r.sectorSlug}` : r.rol)).join(", ");
      console.log(`OK: ${u.email} (${rolesDesc})`);
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

- [ ] **Step 2: Delete `scripts/verify-acceso-extendido.mjs`, create `scripts/verify-roles.mjs`**

```bash
git rm scripts/verify-acceso-extendido.mjs
```

```js
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString });

// email -> roles esperados (rol + sectorSlug, sectorSlug null para dirección).
const EXPECTED = {
  "compras@test.local": [{ rol: "gerente", sectorSlug: "compras" }],
  "almacenes@test.local": [{ rol: "gerente", sectorSlug: "almacenes" }],
  "direccion@test.local": [{ rol: "direccion", sectorSlug: null }],
  "rrhh@test.local": [
    { rol: "gerente", sectorSlug: "recursos-humanos" },
    { rol: "direccion", sectorSlug: null },
  ],
  "sig@test.local": [
    { rol: "gerente", sectorSlug: "sig-y-medio-ambiente" },
    { rol: "direccion", sectorSlug: null },
  ],
};

function clave(roles) {
  return roles
    .map((r) => `${r.rol}:${r.sectorSlug ?? ""}`)
    .sort()
    .join(",");
}

async function main() {
  const { rows } = await pool.query(
    `select p.email, pr.rol, s.slug as sector_slug
     from perfil p
     join perfil_rol pr on pr.perfil_id = p.id
     left join sector s on s.id = pr.sector_id
     where p.email = any($1::text[])`,
    [Object.keys(EXPECTED)]
  );
  await pool.end();

  const actualPorEmail = {};
  for (const row of rows) {
    (actualPorEmail[row.email] ??= []).push({ rol: row.rol, sectorSlug: row.sector_slug });
  }

  let ok = true;
  for (const [email, esperado] of Object.entries(EXPECTED)) {
    const actual = actualPorEmail[email] ?? [];
    if (clave(actual) !== clave(esperado)) {
      console.error(`MISMATCH ${email}: expected [${clave(esperado)}], got [${clave(actual)}]`);
      ok = false;
    }
  }

  if (!ok) process.exit(1);
  console.log(`OK: roles correctos para los ${Object.keys(EXPECTED).length} perfiles de prueba.`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
```

- [ ] **Step 3: Update `package.json`**

Remove this line from `"scripts"`:
```json
"verify:acceso-extendido": "node scripts/verify-acceso-extendido.mjs",
```

Add this line in its place (same position, right after `verify:rls`):
```json
"verify:roles": "node scripts/verify-roles.mjs",
```

- [ ] **Step 4: Replace `docs/superpowers/plans/2026-08-04-credenciales-prueba.md`**

```markdown
# Credenciales de prueba — Fase 2 / Fase 3c / Fase 3d

Generadas por `scripts/seed-users.mjs`. Son credenciales de **prueba/desarrollo**,
no de producción — cambiá las env vars `SEED_PASSWORD_*` antes de correr este
script contra cualquier ambiente real.

| Usuario | Email | Roles | Contraseña (default de desarrollo) |
|---|---|---|---|
| Gerente Compras | `compras@test.local` | gerente (Compras) | `Compras123!` |
| Gerente Almacenes | `almacenes@test.local` | gerente (Almacenes) | `Almacenes123!` |
| Dirección | `direccion@test.local` | direccion | `Direccion123!` |
| Gerente RRHH | `rrhh@test.local` | gerente (Recursos Humanos) + direccion | `RRHH123!` |
| Gerente SIG | `sig@test.local` | gerente (SIG y Medio Ambiente) + direccion | `Sig123!` |

Para usar contraseñas distintas, seteá `SEED_PASSWORD_GERENTE_COMPRAS`,
`SEED_PASSWORD_GERENTE_ALMACENES`, `SEED_PASSWORD_DIRECCION`,
`SEED_PASSWORD_GERENTE_RRHH`, `SEED_PASSWORD_GERENTE_SIG` antes de correr
`npm run db:seed-users` — si no están seteadas, usa los defaults de esta tabla.

Casos de uso:
- **Gerente Compras**: sector chico (2 puestos), rápido para probar el flujo
  de escritura editable.
- **Gerente Almacenes**: sector distinto, para el test cruzado de RLS (un
  gerente de un sector no puede escribir en otro).
- **Dirección**: sin sector, valida puestos de cualquier sector, ve todos
  los sectores y el dashboard MAESTRO.
- **Gerente RRHH / Gerente SIG** (Fase 3d — múltiples roles): un solo login
  con AMBOS roles a la vez. Editan su propio sector como gerente, y además
  pueden validar puestos de cualquier sector como dirección — no solo verlos,
  a diferencia del `acceso_extendido` de Fase 3c (retirado en Fase 3d).
```

- [ ] **Step 5: Lint SQL and type-check (sanity — this task touches no `.ts`/`.sql` directly, confirms nothing else regressed)**

Run: `npm run lint:sql`
Expected: unchanged from Task 1, `All 10 SQL file(s) parse cleanly.`

Run: `npx tsc --noEmit`
Expected: no errors.

Note: `scripts/seed-users.mjs` and `scripts/verify-roles.mjs` are **not run** as part of this task's verification — both require a live, already-migrated database not available in this environment. They run once, by a human, in the manual runbook below.

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-users.mjs scripts/verify-roles.mjs package.json docs/superpowers/plans/2026-08-04-credenciales-prueba.md
git commit -m "feat: seed perfil_rol, replace verify-acceso-extendido with verify-roles"
```

---

## Final check

Run once, after Task 6:

```bash
npx tsc --noEmit
npm run build
npm run lint:sql
npm run verify:seed-counts
npm run verify:real-scores
```

All five must be clean. The last three confirm this plan didn't disturb the seed data itself (only `perfil`/`perfil_rol`, which those scripts don't check) or the real historical scores.

## Manual verification runbook (requires a live database — cannot run in the agent sandbox)

A human with `DATABASE_URL`/`DATABASE_URL_OWNER` pointing at a real (or local) Postgres needs to:

1. `npm run db:migrate` — applies migration 0009 (drops `perfil.rol`/`sector_id`/`acceso_extendido`, adds `perfil_rol`, migrates the 5 existing perfiles, adds the `direccion` row for RRHH/SIG).
2. `npm run db:seed-users` — rewrites `perfil_rol` from the script's `USERS` array (idempotent — safe to re-run).
3. `npm run verify:roles` — confirms all 5 test perfiles have exactly the expected role rows.
4. `npm run verify:rls` — confirms the 9 existing RLS cases still pass (they should be completely unaffected, since `0007_enable_rls.sql` was never touched).
5. `npm run dev`, then in a browser, using the credentials from `docs/superpowers/plans/2026-08-04-credenciales-prueba.md`:
   - **Gerente RRHH** (`rrhh@test.local`): logging in lands on `/dashboard` (has `esDireccion` now, same as before). Navbar shows all 12 sectores + MAESTRO, same as Fase 3c. Opens their own sector (Recursos Humanos) — editable, same as always. Opens a DIFFERENT sector (e.g. Compras) — **new in this phase**: the "Validación de Dirección" control should now be the editable `ValidacionSelect`, not a read-only badge. Change it, confirm it saves.
   - Same check for **Gerente SIG** (`sig@test.local`).
   - **Gerente Compras** (`compras@test.local`, no `direccion` role): unaffected — still only sees Compras, still sees a read-only validación badge on their own sector's card (Dirección's field, not theirs to edit), still 404s on `/sector/almacenes` and redirects away from `/dashboard`.
   - **Dirección** (`direccion@test.local`): unaffected — same total access as always.
   - From the dashboard's tabla consolidada, logged in as RRHH or SIG: confirm the "Validación de Dirección" column is now editable for every row (not just read-only), and saving one updates correctly.
