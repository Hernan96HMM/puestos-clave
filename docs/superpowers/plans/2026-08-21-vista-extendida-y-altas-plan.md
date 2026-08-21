# Vista extendida de Dirección + altas de puesto y pregunta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dirección puede ver (solo lectura) las 10+ preguntas de cualquier puesto de cualquier sector; cualquier sector tiene un botón "Nuevo puesto" que precarga las 10 preguntas globales; Dirección puede agregar una pregunta puntual a un puesto específico desde un botón al final de su lista de preguntas.

**Architecture:** Extiende el modelo existente (`pregunta` gana un `puesto_id` nullable para preguntas de puesto), agrega INSERT a RLS/grants (hoy solo hay SELECT/UPDATE), unifica el render de `/sector/[slug]` en un único camino (expandable form) con un flag `readOnly`, y agrega dos Server Actions nuevas siguiendo el patrón `withUserContext` + `PermisoError` ya establecido en `evaluacionActions.ts`/`actions.ts`.

**Tech Stack:** Next.js 16 App Router, TypeScript, `pg`, Postgres RLS, React `useActionState`.

**Spec:** `docs/superpowers/specs/2026-08-21-vista-extendida-y-altas-design.md`

## Global Constraints

- `withUserContext(user, fn)` firma: `{ id: string; rol: "gerente" | "direccion"; sectorId: string | null }` — no se toca (`src/lib/db/withUserContext.ts`).
- Todo INSERT/UPDATE vía Server Action corre dentro de `withUserContext`, envuelto en `try { ... } catch { return { error: "Ocurrió un error, intentá de nuevo." } }`; los fallos de permiso que la policy de RLS no filtra por sí sola (evaluación inexistente, etc.) se señalizan lanzando una clase local `PermisoError extends Error` DENTRO del callback, para que dispare `ROLLBACK` en vez de `COMMIT` (patrón ya usado en `evaluacionActions.ts`).
- Toda action que escribe termina con `revalidatePath(`/sector/${slug}`)` antes del `return { ok: true }`.
- Columnas `numeric`/`bigint` de Postgres vuelven como `string` en `pg` — pasar por `Number(...)` antes de aritmética o comparación.
- El pool de runtime de la app (`src/lib/db/pool.ts`, usado por `query()` y por `withUserContext`) se conecta con `DATABASE_URL` — es el rol `puestos_clave_app`, sujeto a RLS. Los scripts de migración (`scripts/migrate.mjs`) usan `DATABASE_URL_OWNER`, que **sí** bypassea RLS. Esto importa para el Task 1: habilitar RLS en una tabla sin una policy de `select` permisiva rompe toda lectura de esa tabla en producción, no en la migración.
- No hay base de datos disponible en este entorno de desarrollo — la migración (Task 1) se valida con `npm run lint:sql` (parseo real vía `libpg-query`, sin conexión) y revisión manual; la aplicación real contra la base ocurre en el server del usuario con el flujo ya establecido (`docker exec ... npm run db:migrate`), fuera del alcance de estas tareas.
- Componentes UI existentes a reusar tal cual: `Card`, `Button`, `Field`, `Input`, `Textarea` (`src/components/ui/`). No inventar estilos nuevos.

---

### Task 1: Migración 0010 — `pregunta.puesto_id`, grants de INSERT, policies RLS

**Files:**
- Create: `db/migrations/0010_pregunta_puesto_y_grants_insert.sql`
- Modify: `scripts/verify-rls.mjs`

**Interfaces:**
- Produce: columna `pregunta.puesto_id uuid references puesto(id) on delete cascade` (nullable; `NULL` = pregunta global de las 10 de siempre). Índice único parcial `pregunta_numero_global_unico` reemplaza la constraint `pregunta_numero_key`. Grants de `insert` sobre `puesto, evaluacion, respuesta_pregunta, pregunta` para el rol `puestos_clave_app`. Policies de `insert` en esas 4 tablas. RLS habilitada en `puesto` y `pregunta` (antes no lo estaba) con policy de `select using (true)` en ambas para no romper las lecturas existentes.
- Consume: nada de tareas anteriores — es la primera tarea.

- [ ] **Step 1: Escribir la migración**

Crear `db/migrations/0010_pregunta_puesto_y_grants_insert.sql`:

```sql
alter table pregunta add column puesto_id uuid references puesto(id) on delete cascade;

alter table pregunta drop constraint pregunta_numero_key;
create unique index pregunta_numero_global_unico on pregunta (numero) where puesto_id is null;

grant insert on puesto, evaluacion, respuesta_pregunta, pregunta to puestos_clave_app;

alter table puesto enable row level security;
alter table pregunta enable row level security;

create policy puesto_select on puesto for select using (true);
create policy pregunta_select on pregunta for select using (true);

create policy puesto_insert on puesto for insert with check (
  current_setting('app.rol', true) = 'direccion'
  or (
    current_setting('app.rol', true) = 'gerente'
    and sector_id::text = current_setting('app.sector_id', true)
  )
);

create policy evaluacion_insert on evaluacion for insert with check (
  current_setting('app.rol', true) = 'direccion'
  or (
    current_setting('app.rol', true) = 'gerente'
    and exists (
      select 1 from puesto p
      where p.id = evaluacion.puesto_id
        and p.sector_id::text = current_setting('app.sector_id', true)
    )
  )
);

create policy respuesta_pregunta_insert on respuesta_pregunta for insert with check (
  current_setting('app.rol', true) = 'direccion'
  or (
    current_setting('app.rol', true) = 'gerente'
    and exists (
      select 1 from evaluacion e
      join puesto p on p.id = e.puesto_id
      where e.id = respuesta_pregunta.evaluacion_id
        and p.sector_id::text = current_setting('app.sector_id', true)
    )
  )
);

create policy pregunta_insert on pregunta for insert with check (
  current_setting('app.rol', true) = 'direccion'
);
```

- [ ] **Step 2: Validar sintaxis**

Run: `npm run lint:sql`
Expected: `OK: db/migrations/0010_pregunta_puesto_y_grants_insert.sql` entre las líneas, termina con `All N SQL file(s) parse cleanly.` y exit code 0.

- [ ] **Step 3: Actualizar `scripts/verify-rls.mjs`**

Este script hoy asume que el rol `puestos_clave_app` no tiene NINGÚN grant de `insert` (test 8) — con esta migración eso deja de ser cierto para `gerente` en su propio sector y para `direccion`. Hay que:

(a) Reemplazar el comentario de las líneas 147-151 (el que explica por qué existían los tests 8 y 9) por uno que refleje que ahora SÍ hay INSERT, y que estos tests verifican que las policies (no ya el grant crudo) sigan acotando quién puede insertar qué.

(b) Reemplazar el test 8 completo (líneas 153-170) por estos cuatro, y agregar un test de setup para tener un puesto "scratch" disponible:

```js
  // Setup para los tests de INSERT: un puesto de Compras recién creado, sin
  // usar el que ya trae evaluación con id fijo (evita chocar con la unique
  // constraint (evaluacion_id, pregunta_id) de respuesta_pregunta).
  let scratchPuestoId, scratchEvaluacionId;
  await withRollback(async (client) => {
    const puestoRows = await client.query(
      `insert into puesto (sector_id, nombre, orden) values ($1, 'Puesto scratch RLS', 999) returning id`,
      [comprasSectorId]
    );
    scratchPuestoId = puestoRows.rows[0].id;
    const evalRows = await client.query(
      `insert into evaluacion (puesto_id) values ($1) returning id`,
      [scratchPuestoId]
    );
    scratchEvaluacionId = evalRows.rows[0].id;
  });
  if (!scratchPuestoId) {
    console.error("No se pudo crear el puesto scratch para los tests de INSERT (el setup corre sin RLS, revisar DATABASE_URL_OWNER vs DATABASE_URL).");
  }

  // 8. Gerente de Compras INSERT puesto en su propio sector -> éxito
  await withRollback(async (client) => {
    await setContext(client, { rol: "gerente", sectorId: comprasSectorId });
    const { rows } = await client.query(
      `insert into puesto (sector_id, nombre, orden) values ($1, 'Puesto test', 998) returning id`,
      [comprasSectorId]
    );
    report("8. gerente Compras INSERT puesto en su propio sector", rows.length === 1);
  });

  // 9. Gerente de Compras INSERT puesto en Almacenes -> falla (42501, RLS)
  await withRollback(async (client) => {
    await setContext(client, { rol: "gerente", sectorId: comprasSectorId });
    try {
      const almacenesSector = await client.query(`select id from sector where slug = 'almacenes'`);
      await client.query(
        `insert into puesto (sector_id, nombre, orden) values ($1, 'Puesto test', 998) returning id`,
        [almacenesSector.rows[0].id]
      );
      report("9. gerente Compras NO puede INSERT puesto en Almacenes", false, "el insert tuvo éxito");
    } catch (error) {
      report("9. gerente Compras NO puede INSERT puesto en Almacenes", error.code === "42501", `code=${error.code}`);
    }
  });

  // 10. Dirección INSERT respuesta_pregunta en el puesto scratch -> éxito
  await withRollback(async (client) => {
    await setContext(client, { rol: "direccion", sectorId: null });
    const { rows } = await client.query(
      `insert into respuesta_pregunta (evaluacion_id, pregunta_id) values ($1, (select id from pregunta where numero = 1)) returning id`,
      [scratchEvaluacionId]
    );
    report("10. direccion puede INSERT respuesta_pregunta en cualquier sector", rows.length === 1);
  });

  // 11. Dirección INSERT pregunta (de puesto) -> éxito
  await withRollback(async (client) => {
    await setContext(client, { rol: "direccion", sectorId: null });
    const { rows } = await client.query(
      `insert into pregunta (numero, texto, ref_iso, peso_pct, puesto_id) values (11, 'Pregunta de prueba', '', 5, $1) returning id`,
      [scratchPuestoId]
    );
    report("11. direccion puede INSERT pregunta de puesto", rows.length === 1);
  });

  // 12. Gerente INSERT pregunta -> falla (solo direccion puede)
  await withRollback(async (client) => {
    await setContext(client, { rol: "gerente", sectorId: comprasSectorId });
    try {
      await client.query(
        `insert into pregunta (numero, texto, ref_iso, peso_pct, puesto_id) values (12, 'Pregunta de prueba', '', 5, $1) returning id`,
        [scratchPuestoId]
      );
      report("12. gerente NO puede INSERT pregunta", false, "el insert tuvo éxito");
    } catch (error) {
      report("12. gerente NO puede INSERT pregunta", error.code === "42501", `code=${error.code}`);
    }
  });
```

(c) Test 9 original ("UPDATE sobre sector rechazado por falta de grant") se renumera a **13** — solo cambiar el número en el string del `report(...)`, la lógica queda igual.

(d) El bloque de setup (el `let scratchPuestoId, scratchEvaluacionId;` y su `withRollback`) va inmediatamente después del bloque de setup existente (`setupClient` con `comprasEvaluacionId`, `comprasSectorId`, `almacenesEvaluacionId`, líneas 49-68 del archivo actual), antes del test 1.

- [ ] **Step 4: Validar sintaxis del script modificado**

Run: `node --check scripts/verify-rls.mjs`
Expected: sin salida, exit code 0 (no hay typecheck de `.mjs`; esto solo confirma que el JS parsea).

- [ ] **Step 5: Commit**

```bash
git add db/migrations/0010_pregunta_puesto_y_grants_insert.sql scripts/verify-rls.mjs
git commit -m "feat: add puesto_id to pregunta, grant INSERT, add RLS insert policies"
```

---

### Task 2: Vista extendida de Dirección (solo lectura) en `/sector/[slug]`

**Files:**
- Modify: `src/app/(app)/sector/[slug]/page.tsx`
- Modify: `src/app/(app)/sector/[slug]/PuestoEvaluacionForm.tsx`

**Interfaces:**
- Consume: nada de Task 1 (este task es puramente de lectura/UI, no depende de la migración para compilar ni para el flujo normal — usa columnas y tablas que ya existían).
- Produce: `PuestoEvaluacionForm` gana el prop `readOnly?: boolean`. `page.tsx` pasa `readOnly={!isOwnSector}` a cada `PuestoEvaluacionForm`. (El prop `puedeAgregarPregunta` lo agrega recién Task 4, junto con el único lugar que lo usa — declararlo acá sin uso dispara `no-unused-vars` de ESLint sobre la variable desestructurada y rompe `npm run build`.)

- [ ] **Step 1: Ampliar el fetch de preguntas en `page.tsx`**

En `src/app/(app)/sector/[slug]/page.tsx`, la condición actual es:

```tsx
  const preguntasPorEvaluacion = new Map<string, PreguntaRow[]>();
  if (isOwnSector) {
```

Cambiarla a:

```tsx
  const preguntasPorEvaluacion = new Map<string, PreguntaRow[]>();
  if (isOwnSector || isDireccion) {
```

- [ ] **Step 2: Unificar las dos ramas de render en un único camino**

Reemplazar todo el bloque `const listaPuestos = ( <div className="flex flex-col gap-3"> {puestos.map((p) => isOwnSector ? ( ... ) : ( ... ))} </div> );` (el ternario completo con las dos ramas — `<details>` para `isOwnSector` y `<Card>` plano para el resto) por una única rama, ya que a este punto de la página siempre es cierto `isOwnSector || isDireccion` (si no, ya se hizo `notFound()` más arriba):

```tsx
  const listaPuestos = (
    <div className="flex flex-col gap-3">
        {puestos.map((p) => (
          <AnimatedCard key={p.evaluacion_id}>
            <Card>
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
                  readOnly={!isOwnSector}
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
              {isDireccion && (
                <div className="mt-3 flex justify-end border-t border-border pt-3">
                  <ValidacionSelect
                    evaluacionId={p.evaluacion_id}
                    estadoActual={p.validacion_direccion}
                    slug={slug}
                  />
                </div>
              )}
            </Card>
          </AnimatedCard>
        ))}
    </div>
  );
```

- [ ] **Step 3: Agregar `readOnly` a `PuestoEvaluacionForm`**

En `src/app/(app)/sector/[slug]/PuestoEvaluacionForm.tsx`:

Cambiar la interfaz de props:

```tsx
interface PuestoEvaluacionFormProps {
  evaluacionId: string;
  slug: string;
  evaluador: string | null;
  fechaEvaluacion: string | null;
  preguntas: PreguntaRespuesta[];
  readOnly?: boolean;
}
```

Cambiar la firma del componente:

```tsx
export function PuestoEvaluacionForm({
  evaluacionId,
  slug,
  evaluador,
  fechaEvaluacion,
  preguntas,
  readOnly = false,
}: PuestoEvaluacionFormProps) {
```

En el JSX, envolver los controles editables. El bloque del `<select>` de puntaje pasa de:

```tsx
              <select
                name={`puntaje_${p.preguntaId}`}
                value={respuesta.puntaje === null ? "NA" : String(respuesta.puntaje)}
                onChange={(e) => actualizarPuntaje(p.preguntaId, e.target.value)}
                disabled={pending}
```

a:

```tsx
              <select
                name={`puntaje_${p.preguntaId}`}
                value={respuesta.puntaje === null ? "NA" : String(respuesta.puntaje)}
                onChange={(e) => actualizarPuntaje(p.preguntaId, e.target.value)}
                disabled={pending || readOnly}
```

El `<Textarea>` de justificación pasa de:

```tsx
              <Textarea
                name={`justificacion_${p.preguntaId}`}
                value={respuesta.justificacion}
                onChange={(e) => actualizarJustificacion(p.preguntaId, e.target.value)}
                required={requiereJustificacion}
                disabled={pending}
```

a:

```tsx
              <Textarea
                name={`justificacion_${p.preguntaId}`}
                value={respuesta.justificacion}
                onChange={(e) => actualizarJustificacion(p.preguntaId, e.target.value)}
                required={requiereJustificacion && !readOnly}
                disabled={pending || readOnly}
```

(el `required` también se apaga en modo lectura para que el navegador no intente validar un campo que nunca se va a enviar).

Los campos `Evaluador` y `Fecha de evaluación` también quedan de solo lectura — su `disabled={pending}` pasa a `disabled={pending || readOnly}` en ambos `<Field>`.

El bloque final (mensajes de estado + botón "Guardar") pasa de:

```tsx
      {state.error && (
        <p role="alert" className="text-sm text-risk-high">
          {state.error}
        </p>
      )}
      {state.ok && <p className="text-sm text-risk-low">Guardado.</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "Guardando..." : "Guardar"}
      </Button>
    </form>
  );
}
```

a:

```tsx
      {!readOnly && state.error && (
        <p role="alert" className="text-sm text-risk-high">
          {state.error}
        </p>
      )}
      {!readOnly && state.ok && <p className="text-sm text-risk-low">Guardado.</p>}

      {!readOnly && (
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando..." : "Guardar"}
        </Button>
      )}
    </form>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin salida (exit code 0).

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`, sin errores de TypeScript ni de ESLint.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/sector/[slug]/page.tsx" "src/app/(app)/sector/[slug]/PuestoEvaluacionForm.tsx"
git commit -m "feat: Dirección ve preguntas y respuestas de cualquier sector en modo lectura"
```

---

### Task 3: Botón "Nuevo puesto"

**Files:**
- Create: `src/app/(app)/sector/[slug]/puestoActions.ts`
- Create: `src/app/(app)/sector/[slug]/NuevoPuestoForm.tsx`
- Modify: `src/app/(app)/sector/[slug]/page.tsx`

**Interfaces:**
- Consume: `withUserContext` (`src/lib/db/withUserContext.ts`), `query` (`src/lib/db/query.ts`), `auth` (`@/auth`), componentes `Card`/`Button`/`Field` (`@/components/ui/*`). Depende de la migración 0010 de Task 1 para funcionar en runtime real (grants/policies de INSERT) — no depende de ella para compilar.
- Produce: `crearPuestoAction(prevState, formData)` y tipo `PuestoActionState` exportados desde `puestoActions.ts`. Componente `NuevoPuestoForm({ slug }: { slug: string })` exportado desde `NuevoPuestoForm.tsx`.

- [ ] **Step 1: Server action `crearPuestoAction`**

Crear `src/app/(app)/sector/[slug]/puestoActions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { query } from "@/lib/db/query";
import { withUserContext } from "@/lib/db/withUserContext";

export interface PuestoActionState {
  error?: string;
  ok?: boolean;
}

export async function crearPuestoAction(
  _prevState: PuestoActionState,
  formData: FormData
): Promise<PuestoActionState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "No hay sesión activa." };
  }

  const slug = formData.get("slug");
  const nombre = formData.get("nombre");
  if (typeof slug !== "string" || typeof nombre !== "string" || nombre.trim() === "") {
    return { error: "El nombre del puesto es obligatorio." };
  }

  const sectorRows = await query<{ id: string }>("select id from sector where slug = $1", [slug]);
  const sector = sectorRows[0];
  if (!sector) {
    return { error: "Sector no encontrado." };
  }

  const esGerenteDeEsteSector = session.user.sectoresGerente.includes(sector.id);
  if (!session.user.esDireccion && !esGerenteDeEsteSector) {
    return { error: "No tenés permiso para agregar puestos en este sector." };
  }

  const rol = session.user.esDireccion ? "direccion" : "gerente";
  const nombreLimpio = nombre.trim();

  try {
    await withUserContext(
      { id: session.user.id, rol, sectorId: esGerenteDeEsteSector ? sector.id : null },
      async (client) => {
        const ordenRows = await client.query<{ siguiente: number }>(
          "select coalesce(max(orden), 0) + 1 as siguiente from puesto where sector_id = $1",
          [sector.id]
        );
        const orden = ordenRows.rows[0].siguiente;

        const puestoRows = await client.query<{ id: string }>(
          "insert into puesto (sector_id, nombre, orden) values ($1, $2, $3) returning id",
          [sector.id, nombreLimpio, orden]
        );
        const puestoId = puestoRows.rows[0].id;

        const evalRows = await client.query<{ id: string }>(
          "insert into evaluacion (puesto_id) values ($1) returning id",
          [puestoId]
        );
        const evaluacionId = evalRows.rows[0].id;

        const preguntasGlobales = await client.query<{ id: string }>(
          "select id from pregunta where puesto_id is null"
        );
        for (const p of preguntasGlobales.rows) {
          await client.query(
            "insert into respuesta_pregunta (evaluacion_id, pregunta_id) values ($1, $2)",
            [evaluacionId, p.id]
          );
        }
      }
    );
  } catch {
    return { error: "Ocurrió un error, intentá de nuevo." };
  }

  revalidatePath(`/sector/${slug}`);
  return { ok: true };
}
```

- [ ] **Step 2: Componente `NuevoPuestoForm`**

Crear `src/app/(app)/sector/[slug]/NuevoPuestoForm.tsx`:

```tsx
"use client";

import { useActionState, useState } from "react";
import { crearPuestoAction, type PuestoActionState } from "./puestoActions";
import { Card } from "@/components/ui/Card";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const initialState: PuestoActionState = {};

export function NuevoPuestoForm({ slug }: { slug: string }) {
  const [abierto, setAbierto] = useState(false);
  const [state, formAction, pending] = useActionState(crearPuestoAction, initialState);

  if (!abierto) {
    return (
      <Button variant="ghost" onClick={() => setAbierto(true)} className="self-start">
        + Nuevo puesto
      </Button>
    );
  }

  return (
    <Card>
      <form action={formAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <input type="hidden" name="slug" value={slug} />
        <div className="flex-1">
          <Field label="Nombre del puesto" name="nombre" id="nuevo-puesto-nombre" disabled={pending} required />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Creando..." : "Crear"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setAbierto(false)} disabled={pending}>
            Cancelar
          </Button>
        </div>
      </form>
      {state.error && (
        <p role="alert" className="mt-2 text-sm text-risk-high">
          {state.error}
        </p>
      )}
    </Card>
  );
}
```

Nota de comportamiento: tras un `ok: true`, `revalidatePath` refresca `page.tsx` con el nuevo puesto en la lista, pero este componente sigue montado con `abierto === true` y el formulario vacío (no hay reset explícito de `abierto` en éxito) — es aceptable: el usuario ve el puesto nuevo aparecer debajo y puede cerrar el formulario él mismo con "Cancelar", o cargar otro puesto seguido sin reabrir.

- [ ] **Step 3: Insertar el botón en `page.tsx`**

En `src/app/(app)/sector/[slug]/page.tsx`, importar el componente:

```tsx
import { NuevoPuestoForm } from "./NuevoPuestoForm";
```

Y en `listaPuestos` (definido en Task 2), agregarlo como primer hijo del `<div className="flex flex-col gap-3">`:

```tsx
  const listaPuestos = (
    <div className="flex flex-col gap-3">
        <NuevoPuestoForm slug={slug} />
        {puestos.map((p) => (
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin salida (exit code 0).

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`, sin errores.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/sector/[slug]/puestoActions.ts" "src/app/(app)/sector/[slug]/NuevoPuestoForm.tsx" "src/app/(app)/sector/[slug]/page.tsx"
git commit -m "feat: add Nuevo puesto button, precarga las 10 preguntas globales"
```

---

### Task 4: Botón "Nueva pregunta" (solo Dirección, por puesto)

**Files:**
- Create: `src/app/(app)/sector/[slug]/preguntaActions.ts`
- Modify: `src/app/(app)/sector/[slug]/PuestoEvaluacionForm.tsx`

**Interfaces:**
- Consume: `withUserContext`.
- Produce: `crearPreguntaPuestoAction(prevState, formData)` y tipo `PreguntaActionState` exportados desde `preguntaActions.ts`. `PuestoEvaluacionForm` gana el prop `puedeAgregarPregunta?: boolean` (nuevo en este task) y `page.tsx` pasa `puedeAgregarPregunta={isDireccion}` en su único call site.

- [ ] **Step 1: Server action `crearPreguntaPuestoAction`**

Crear `src/app/(app)/sector/[slug]/preguntaActions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { withUserContext } from "@/lib/db/withUserContext";

export interface PreguntaActionState {
  error?: string;
  ok?: boolean;
}

// Marcador local (mismo patrón que evaluacionActions.ts): se lanza DENTRO
// del callback de withUserContext para que dispare ROLLBACK en vez de
// COMMIT si la evaluación no existe.
class PermisoError extends Error {}

export async function crearPreguntaPuestoAction(
  _prevState: PreguntaActionState,
  formData: FormData
): Promise<PreguntaActionState> {
  const session = await auth();
  if (!session?.user?.esDireccion) {
    return { error: "Solo Dirección puede agregar preguntas." };
  }

  const evaluacionId = formData.get("evaluacionId");
  const slug = formData.get("slug");
  const texto = formData.get("texto");
  const refIso = formData.get("refIso");
  const pesoPctRaw = formData.get("pesoPct");
  if (
    typeof evaluacionId !== "string" ||
    typeof slug !== "string" ||
    typeof texto !== "string" ||
    typeof refIso !== "string" ||
    typeof pesoPctRaw !== "string"
  ) {
    return { error: "Datos inválidos." };
  }

  const textoLimpio = texto.trim();
  const refIsoLimpio = refIso.trim();
  const pesoPct = Number(pesoPctRaw);
  if (!textoLimpio) {
    return { error: "El texto de la pregunta es obligatorio." };
  }
  if (!Number.isFinite(pesoPct) || pesoPct <= 0 || pesoPct > 100) {
    return { error: "El peso debe ser un número entre 1 y 100." };
  }

  try {
    await withUserContext(
      { id: session.user.id, rol: "direccion", sectorId: null },
      async (client) => {
        const evalRows = await client.query<{ puesto_id: string }>(
          "select puesto_id from evaluacion where id = $1",
          [evaluacionId]
        );
        const puestoId = evalRows.rows[0]?.puesto_id;
        if (!puestoId) {
          throw new PermisoError();
        }

        const numeroRows = await client.query<{ siguiente: number }>(
          `select coalesce(max(numero), 0) + 1 as siguiente from pregunta
           where puesto_id is null or puesto_id = $1`,
          [puestoId]
        );
        const numero = numeroRows.rows[0].siguiente;

        const preguntaRows = await client.query<{ id: string }>(
          "insert into pregunta (numero, texto, ref_iso, peso_pct, puesto_id) values ($1, $2, $3, $4, $5) returning id",
          [numero, textoLimpio, refIsoLimpio, pesoPct, puestoId]
        );

        await client.query(
          "insert into respuesta_pregunta (evaluacion_id, pregunta_id) values ($1, $2)",
          [evaluacionId, preguntaRows.rows[0].id]
        );
      }
    );
  } catch (e) {
    if (e instanceof PermisoError) {
      return { error: "Evaluación no encontrada." };
    }
    return { error: "Ocurrió un error, intentá de nuevo." };
  }

  revalidatePath(`/sector/${slug}`);
  return { ok: true };
}
```

- [ ] **Step 2: Agregar el botón + mini-formulario al final de la lista de preguntas**

En `src/app/(app)/sector/[slug]/PuestoEvaluacionForm.tsx`:

Agregar el prop a la interfaz (queda igual a como lo dejó Task 2, más esta línea):

```tsx
interface PuestoEvaluacionFormProps {
  evaluacionId: string;
  slug: string;
  evaluador: string | null;
  fechaEvaluacion: string | null;
  preguntas: PreguntaRespuesta[];
  readOnly?: boolean;
  puedeAgregarPregunta?: boolean;
}
```

Y a la firma del componente:

```tsx
export function PuestoEvaluacionForm({
  evaluacionId,
  slug,
  evaluador,
  fechaEvaluacion,
  preguntas,
  readOnly = false,
  puedeAgregarPregunta = false,
}: PuestoEvaluacionFormProps) {
```

Agregar los imports:

```tsx
import { crearPreguntaPuestoAction, type PreguntaActionState } from "./preguntaActions";
```

Agregar, junto a `const initialState: EvaluacionActionState = {};`, un segundo estado inicial:

```tsx
const initialStatePregunta: PreguntaActionState = {};
```

Dentro del componente, después de las declaraciones de `useState`/`useActionState` existentes, agregar:

```tsx
  const [nuevaPreguntaAbierta, setNuevaPreguntaAbierta] = useState(false);
  const [statePregunta, formActionPregunta, pendingPregunta] = useActionState(
    crearPreguntaPuestoAction,
    initialStatePregunta
  );
```

Después del `</div>` que cierra `<div className="flex flex-col gap-4">` (el que envuelve el `.map` de preguntas) y **antes** del bloque `{!readOnly && state.error && (...)}`, agregar, solo si `puedeAgregarPregunta`:

```tsx
      {puedeAgregarPregunta && (
        <div className="border-t border-border pt-3">
          {!nuevaPreguntaAbierta ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setNuevaPreguntaAbierta(true)}
              className="text-xs"
            >
              + Nueva pregunta
            </Button>
          ) : (
            <form action={formActionPregunta} className="flex flex-col gap-2">
              <input type="hidden" name="evaluacionId" value={evaluacionId} />
              <input type="hidden" name="slug" value={slug} />
              <Textarea
                name="texto"
                placeholder="Texto de la pregunta"
                required
                disabled={pendingPregunta}
                rows={2}
              />
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  name="refIso"
                  placeholder="Ref. ISO (opcional)"
                  disabled={pendingPregunta}
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-secondary focus:border-secondary disabled:cursor-not-allowed disabled:opacity-50 sm:w-1/2"
                />
                <input
                  name="pesoPct"
                  type="number"
                  min="1"
                  max="100"
                  placeholder="Peso %"
                  required
                  disabled={pendingPregunta}
                  className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-secondary focus:border-secondary disabled:cursor-not-allowed disabled:opacity-50 sm:w-1/2"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={pendingPregunta} className="text-xs">
                  {pendingPregunta ? "Agregando..." : "Agregar"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setNuevaPreguntaAbierta(false)}
                  disabled={pendingPregunta}
                  className="text-xs"
                >
                  Cancelar
                </Button>
              </div>
              {statePregunta.error && (
                <p role="alert" className="text-xs text-risk-high">
                  {statePregunta.error}
                </p>
              )}
            </form>
          )}
        </div>
      )}
```

Este bloque va DENTRO del `<form action={formAction} ...>` principal del componente pero es un `<form>` anidado con su propia `action` — HTML no permite `<form>` dentro de `<form>` válidamente. Para evitarlo, sacar este bloque fuera del `<form>` principal: cerrar el `</form>` del componente ANTES de este bloque, y volver a envolverlo en el `return` como hermano. Concretamente, el `return` del componente pasa de:

```tsx
  return (
    <form action={formAction} className="flex flex-col gap-4 pt-4">
      ...
      {!readOnly && (
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando..." : "Guardar"}
        </Button>
      )}
    </form>
  );
}
```

a:

```tsx
  return (
    <div className="flex flex-col gap-4 pt-4">
      <form action={formAction} className="flex flex-col gap-4">
        ...
        {!readOnly && (
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando..." : "Guardar"}
          </Button>
        )}
      </form>

      {puedeAgregarPregunta && (
        <div className="border-t border-border pt-3">
          ... (bloque de arriba) ...
        </div>
      )}
    </div>
  );
}
```

Es decir: el elemento raíz retornado deja de ser el `<form>` y pasa a ser un `<div>` que envuelve DOS hermanos — el `<form>` principal (edición de respuestas) y, aparte, el bloque de "Nueva pregunta" con su propio `<form>` independiente. El resto del contenido interno del `<form>` principal (los inputs ocultos, el puntaje en vivo, los campos de evaluador/fecha, el `.map` de preguntas) no cambia de lugar, solo el tag raíz y su className (`flex flex-col gap-4 pt-4` se reparte: el `<div>` externo se queda con `pt-4`, el `<form>` interno se queda con `flex flex-col gap-4` sin el `pt-4` para no duplicar espaciado).

- [ ] **Step 3: Pasar el prop desde `page.tsx`**

En `src/app/(app)/sector/[slug]/page.tsx`, en el único call site de `<PuestoEvaluacionForm ... />` (dentro de `listaPuestos`), justo debajo de la línea `readOnly={!isOwnSector}` que ya dejó Task 2, agregar:

```tsx
                  puedeAgregarPregunta={isDireccion}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin salida (exit code 0).

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: `✓ Compiled successfully`, sin errores.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(app)/sector/[slug]/preguntaActions.ts" "src/app/(app)/sector/[slug]/PuestoEvaluacionForm.tsx" "src/app/(app)/sector/[slug]/page.tsx"
git commit -m "feat: add Nueva pregunta button para Dirección al final de cada evaluación"
```

---

## Verificación manual (server del usuario, fuera de este entorno)

Después de `npm run db:migrate` (aplica 0010):

1. `npm run verify:rls` — confirma que las policies nuevas de INSERT filtran correctamente por sector/rol.
2. Gerente propio entra a su sector: sigue pudiendo editar y guardar como siempre (regresión).
3. Dirección entra a un sector ajeno: ve el `<details>` de cada puesto con las 10 preguntas, todo deshabilitado, sin botón "Guardar".
4. Cualquiera de los dos aprieta "+ Nuevo puesto", carga un nombre, aparece en la lista con las 10 preguntas en blanco listas para responder.
5. Dirección, en cualquier puesto (propio o ajeno), aprieta "+ Nueva pregunta", carga texto + peso, aparece al final de la lista de ESE puesto (numerada 11) — otros puestos del mismo sector no la ven.
6. El gerente dueño de ese puesto responde la pregunta 11 igual que las demás y el puntaje ponderado se recalcula solo.
