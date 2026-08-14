# Fase 3b — Formulario de Evaluación Editable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the editable 10-question evaluation form for the gerente's own sector on `/sector/[slug]`, with live weighted-score preview, conditional-justification validation, and a save path that reuses the existing RLS/`withUserContext` transaction pattern.

**Architecture:** A pure calculation function (`calcularPuntajePonderado`) shared between the live client-side preview and documented as mirroring the DB view's formula; one new UI primitive (`Textarea`); a new Server Action (`updateEvaluacionAction`) that updates `evaluacion` + all 10 `respuesta_pregunta` rows in a single transaction; a new Client Component (`PuestoEvaluacionForm`) that renders the 10-question form with controlled state; and a modification to the existing sector page to fetch the extra data and wrap each puesto in a native `<details>` when the viewer is the sector's own gerente.

**Tech Stack:** Next.js 16 (App Router) + TypeScript, Tailwind CSS v4, `pg` (node-postgres), Auth.js v5. No new dependencies — same constraint as Fase 3a.

**Spec:** `docs/superpowers/specs/2026-08-14-fase3b-formulario-evaluacion-design.md`

## Global Constraints

- No new npm dependencies — plain Tailwind utility classes and hand-written React/TypeScript, same as Fase 3a.
- Path alias `@/*` → `./src/*`.
- No schema changes — `pregunta`, `evaluacion`, `respuesta_pregunta` already have every column this plan needs (migration 0001). No new migration.
- No changes to RLS policies, `withUserContext`, `auth.ts`, or `auth.config.ts` — writes go through the existing `evaluacion_write`/`respuesta_pregunta_write` policies (migration 0007), already covered by `scripts/verify-rls.mjs`.
- `puntaje = null` is the schema's only representation of "N/A / unanswered" — do not introduce a third state.
- Justificación is required (non-empty after `.trim()`) when `puntaje` is 3, 4, or 5 — enforced both client-side (`required` on the textarea, toggled dynamically) and server-side (defense in depth, since a `required` HTML attribute can be bypassed with a hand-crafted POST).
- `peso_pct` is a Postgres `numeric` column — `pg` returns `numeric` values as **strings**, not JS numbers, by default (unlike `integer`, which comes back as a real `number`). Every place that reads `peso_pct` from a query result must `Number(...)` it before doing arithmetic, or `+`/`reduce` will silently do string concatenation instead of addition.
- No test suite exists in this project (same as Fase 2/3a) — verification per task is `npx tsc --noEmit` (must be clean), plus `npm run build` where noted, plus one `node -e` arithmetic check for the pure function (Task 1) since it has no JSX and can be verified directly. Final manual verification happens in the user's own browser via `npm run dev` — no screenshot/browser tool is available in the agent's execution environment.
- Spanish UI copy throughout, matching the existing app.

---

### Task 1: `calcularPuntajePonderado` — shared live-score formula

**Files:**
- Create: `src/lib/calculoPuntaje.ts`

**Interfaces:**
- Produces: `RespuestaCalculo` (interface: `{ peso_pct: number; puntaje: number | null }`) and `calcularPuntajePonderado(respuestas: RespuestaCalculo[]): number`, both named exports from `@/lib/calculoPuntaje`. Task 4 (`PuestoEvaluacionForm`) imports and calls this on every keystroke to show the live preview; it must always receive `peso_pct` as a real `number` (see the `numeric`-string Global Constraint above) — this function does not do that conversion itself, its caller does.

- [ ] **Step 1: Write `src/lib/calculoPuntaje.ts`**

```ts
export interface RespuestaCalculo {
  peso_pct: number;
  puntaje: number | null;
}

// Replica la fórmula de vista_evaluacion_calculada (migración 0004):
// round(coalesce(sum(peso*puntaje) filter (donde respondida) / sum(peso) filter (donde respondida) / 5 * 100, 0), 1)
export function calcularPuntajePonderado(respuestas: RespuestaCalculo[]): number {
  const respondidas = respuestas.filter((r) => r.puntaje !== null);
  const pesoRespondido = respondidas.reduce((sum, r) => sum + r.peso_pct, 0);
  if (pesoRespondido === 0) return 0;
  const sumaPonderada = respondidas.reduce((sum, r) => sum + r.peso_pct * (r.puntaje as number), 0);
  return Math.round(((sumaPonderada / pesoRespondido / 5) * 100) * 10) / 10;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify the arithmetic with a plain-JS equivalent**

The function has no JSX and no framework dependency, so its logic can be checked directly by running the same arithmetic (structurally identical, just without TypeScript's type annotations) with `node -e`:

Run:
```bash
node -e "
const respuestas = [{peso_pct: 12, puntaje: 5}, {peso_pct: 10, puntaje: 3}, {peso_pct: 8, puntaje: null}];
const respondidas = respuestas.filter(r => r.puntaje !== null);
const pesoRespondido = respondidas.reduce((s,r)=>s+r.peso_pct,0);
const sumaPonderada = respondidas.reduce((s,r)=>s+r.peso_pct*r.puntaje,0);
console.log(Math.round(((sumaPonderada/pesoRespondido/5)*100)*10)/10);
"
```
Expected output: `81.8` (the third question, `puntaje: null`, is correctly excluded from both the numerator and the denominator — only the first two questions' weights, 12+10=22, count).

Also verify the all-N/A edge case returns `0`, not `NaN`:
```bash
node -e "
const respuestas = [{peso_pct: 12, puntaje: null}];
const respondidas = respuestas.filter(r => r.puntaje !== null);
const pesoRespondido = respondidas.reduce((s,r)=>s+r.peso_pct,0);
console.log(pesoRespondido === 0 ? 0 : 'unreachable in this case');
"
```
Expected output: `0`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/calculoPuntaje.ts
git commit -m "feat: add shared weighted-score calculation for live preview"
```

---

### Task 2: `Textarea` UI primitive

**Files:**
- Create: `src/components/ui/Textarea.tsx`

**Interfaces:**
- Consumes: `bg-bg`, `border-border`, `text-text`, `text-text-muted`, `focus:ring-secondary`, `focus:border-secondary` utility classes (Task 1 of Fase 3a — already in `src/app/globals.css`).
- Produces: `Textarea` — named export from `@/components/ui/Textarea`, a styled `<textarea>` accepting every native `TextareaHTMLAttributes<HTMLTextAreaElement>` prop plus an optional `className` override, same pattern as `Input.tsx`. Task 4 (`PuestoEvaluacionForm`) uses this for each question's justificación field, including its `required`, `value`, `onChange`, `disabled`, and `placeholder` props.

- [ ] **Step 1: Write `src/components/ui/Textarea.tsx`**

```tsx
import type { TextareaHTMLAttributes } from "react";

export function Textarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-md border border-border bg-bg px-3 py-2 text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-secondary focus:border-secondary disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Textarea.tsx
git commit -m "feat: add Textarea UI primitive"
```

---

### Task 3: `updateEvaluacionAction` Server Action

**Files:**
- Create: `src/app/(app)/sector/[slug]/evaluacionActions.ts`

**Interfaces:**
- Consumes: `withUserContext` (`@/lib/db/withUserContext`, exact signature already in the codebase: `withUserContext(user: { id: string; rol: "gerente" | "direccion"; sectorId: string | null }, fn: (client: PoolClient) => Promise<T>): Promise<T>`), `auth` (`@/auth`).
- Produces: `EvaluacionActionState` (interface: `{ error?: string; ok?: boolean }`) and `updateEvaluacionAction(prevState: EvaluacionActionState, formData: FormData): Promise<EvaluacionActionState>`, both named exports from `./evaluacionActions`. Task 4 (`PuestoEvaluacionForm`) calls this via `useActionState(updateEvaluacionAction, initialState)` and must submit a `<form>` with these EXACT field names (the contract this task defines): hidden `evaluacionId`, hidden `slug`, hidden `preguntaIds` (comma-separated list of the 10 `pregunta.id` UUIDs for this puesto, no spaces), text `evaluador`, date `fechaEvaluacion` (native `<input type="date">` format, `YYYY-MM-DD` or empty string), and per question — for every id in `preguntaIds` — a select named `puntaje_<preguntaId>` (values: `"NA"` or `"0"`–`"5"`) and a textarea named `justificacion_<preguntaId>`.

- [ ] **Step 1: Write `src/app/(app)/sector/[slug]/evaluacionActions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { withUserContext } from "@/lib/db/withUserContext";

export interface EvaluacionActionState {
  error?: string;
  ok?: boolean;
}

// Los 7 valores válidos del <select> por pregunta: "NA" (puntaje null) o "0"-"5".
const PUNTAJES_VALIDOS = ["NA", "0", "1", "2", "3", "4", "5"] as const;

export async function updateEvaluacionAction(
  _prevState: EvaluacionActionState,
  formData: FormData
): Promise<EvaluacionActionState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "No hay sesión activa." };
  }
  if (session.user.rol !== "gerente") {
    return { error: "No tenés permiso para editar esta evaluación." };
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

  let filasAfectadas: number;
  try {
    filasAfectadas = await withUserContext(
      { id: session.user.id, rol: session.user.rol, sectorId: session.user.sectorId },
      async (client) => {
        let count = 0;
        const evalResult = await client.query(
          "update evaluacion set evaluador = $1, fecha_evaluacion = $2 where id = $3 returning id",
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
        return count;
      }
    );
  } catch {
    // Cualquier fallo real de la base (conexión, constraint inesperado): no es
    // un problema de permisos, y mezclarlo con el caso de abajo confunde.
    return { error: "Ocurrió un error, intentá de nuevo." };
  }

  // Menos filas afectadas que las esperadas (1 de evaluacion + N de respuestas)
  // = la policy de RLS filtró alguna fila (sector ajeno) sin lanzar error.
  const filasEsperadas = 1 + respuestas.length;
  if (filasAfectadas < filasEsperadas) {
    return { error: "No tenés permiso para editar este puesto." };
  }

  // La página se renderizó en el servidor con los valores viejos; sin esto
  // quedan desactualizados hasta un reload.
  revalidatePath(`/sector/${slug}`);
  return { ok: true };
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds (this confirms the `"use server"` module compiles even before anything imports it).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/sector/[slug]/evaluacionActions.ts"
git commit -m "feat: add Server Action to save puesto evaluations"
```

---

### Task 4: `PuestoEvaluacionForm` component

**Files:**
- Create: `src/app/(app)/sector/[slug]/PuestoEvaluacionForm.tsx`

**Interfaces:**
- Consumes: `calcularPuntajePonderado`/`RespuestaCalculo` (`@/lib/calculoPuntaje`, Task 1), `Textarea` (`@/components/ui/Textarea`, Task 2), `updateEvaluacionAction`/`EvaluacionActionState` (`./evaluacionActions`, Task 3), `Field` (`@/components/ui/Field`, already in the codebase from Fase 3a — props `{ label: string; error?: string } & InputHTMLAttributes<HTMLInputElement>`), `Button` (`@/components/ui/Button`, already in the codebase).
- Produces: `PuestoEvaluacionForm` — named export from `./PuestoEvaluacionForm`, props:
  ```ts
  interface PreguntaRespuesta {
    preguntaId: string;
    numero: number;
    texto: string;
    refIso: string;
    pesoPct: number; // ya convertido a number por el caller — ver Global Constraints
    puntaje: number | null;
    justificacion: string | null;
  }

  interface PuestoEvaluacionFormProps {
    evaluacionId: string;
    slug: string;
    evaluador: string | null;
    fechaEvaluacion: string | null; // 'YYYY-MM-DD' o null
    preguntas: PreguntaRespuesta[]; // las 10, ya ordenadas por numero
  }
  ```
  Task 5 (`page.tsx`) renders `<PuestoEvaluacionForm>` with these exact prop names and types, and is responsible for converting `peso_pct` (a `numeric`/string column) to a real `number` before passing it in.

- [ ] **Step 1: Write `src/app/(app)/sector/[slug]/PuestoEvaluacionForm.tsx`**

```tsx
"use client";

import { useActionState, useState } from "react";
import { updateEvaluacionAction, type EvaluacionActionState } from "./evaluacionActions";
import { calcularPuntajePonderado } from "@/lib/calculoPuntaje";
import { Field } from "@/components/ui/Field";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";

interface PreguntaRespuesta {
  preguntaId: string;
  numero: number;
  texto: string;
  refIso: string;
  pesoPct: number;
  puntaje: number | null;
  justificacion: string | null;
}

interface PuestoEvaluacionFormProps {
  evaluacionId: string;
  slug: string;
  evaluador: string | null;
  fechaEvaluacion: string | null;
  preguntas: PreguntaRespuesta[];
}

const initialState: EvaluacionActionState = {};

// Escala del formulario (sección 2.4 del prompt original F-116):
// 0 = No aplica el criterio ... 5 = Muy alto, N/A = la pregunta no corresponde a este puesto.
const OPCIONES_PUNTAJE = [
  { value: "NA", label: "N/A — No corresponde a este puesto" },
  { value: "0", label: "0 — No aplica el criterio" },
  { value: "1", label: "1 — Muy bajo" },
  { value: "2", label: "2 — Bajo" },
  { value: "3", label: "3 — Medio" },
  { value: "4", label: "4 — Alto" },
  { value: "5", label: "5 — Muy alto" },
];

export function PuestoEvaluacionForm({
  evaluacionId,
  slug,
  evaluador,
  fechaEvaluacion,
  preguntas,
}: PuestoEvaluacionFormProps) {
  const [state, formAction, pending] = useActionState(updateEvaluacionAction, initialState);
  const [respuestas, setRespuestas] = useState(
    preguntas.map((p) => ({
      preguntaId: p.preguntaId,
      puntaje: p.puntaje,
      justificacion: p.justificacion ?? "",
    }))
  );

  const puntajeEnVivo = calcularPuntajePonderado(
    respuestas.map((r, i) => ({ peso_pct: preguntas[i].pesoPct, puntaje: r.puntaje }))
  );

  function actualizarPuntaje(preguntaId: string, valor: string) {
    setRespuestas((prev) =>
      prev.map((r) =>
        r.preguntaId === preguntaId ? { ...r, puntaje: valor === "NA" ? null : Number(valor) } : r
      )
    );
  }

  function actualizarJustificacion(preguntaId: string, valor: string) {
    setRespuestas((prev) =>
      prev.map((r) => (r.preguntaId === preguntaId ? { ...r, justificacion: valor } : r))
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 pt-4">
      <input type="hidden" name="evaluacionId" value={evaluacionId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="preguntaIds" value={preguntas.map((p) => p.preguntaId).join(",")} />

      <div className="flex items-center justify-between rounded-md bg-secondary-bg px-3 py-2">
        <span className="text-sm font-medium text-secondary-text">Puntaje ponderado (en vivo)</span>
        <span className="text-lg font-bold text-secondary-text">{puntajeEnVivo}%</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Evaluador" name="evaluador" defaultValue={evaluador ?? ""} disabled={pending} />
        <Field
          label="Fecha de evaluación"
          name="fechaEvaluacion"
          type="date"
          defaultValue={fechaEvaluacion ?? ""}
          disabled={pending}
        />
      </div>

      <div className="flex flex-col gap-4">
        {preguntas.map((p, i) => {
          const respuesta = respuestas[i];
          const requiereJustificacion = respuesta.puntaje !== null && respuesta.puntaje >= 3;
          return (
            <div key={p.preguntaId} className="flex flex-col gap-2 border-t border-border pt-3">
              <p className="text-sm text-text">
                <span className="font-medium">{p.numero}.</span> {p.texto}
              </p>
              <p className="text-xs text-text-muted">
                Ref. ISO 9001:2015 {p.refIso} · Peso {p.pesoPct}%
              </p>
              <select
                name={`puntaje_${p.preguntaId}`}
                value={respuesta.puntaje === null ? "NA" : String(respuesta.puntaje)}
                onChange={(e) => actualizarPuntaje(p.preguntaId, e.target.value)}
                disabled={pending}
                className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-secondary focus:border-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {OPCIONES_PUNTAJE.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <Textarea
                name={`justificacion_${p.preguntaId}`}
                value={respuesta.justificacion}
                onChange={(e) => actualizarJustificacion(p.preguntaId, e.target.value)}
                required={requiereJustificacion}
                disabled={pending}
                rows={2}
                placeholder={
                  requiereJustificacion
                    ? "Justificación obligatoria para este puntaje"
                    : "Justificación (opcional)"
                }
              />
            </div>
          );
        })}
      </div>

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

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds (component isn't rendered anywhere yet — this only confirms it compiles standalone; Task 5 wires it up for real).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/sector/[slug]/PuestoEvaluacionForm.tsx"
git commit -m "feat: add PuestoEvaluacionForm component"
```

---

### Task 5: Wire the form into the sector page

**Files:**
- Modify: `src/app/(app)/sector/[slug]/page.tsx`

**Interfaces:**
- Consumes: `PuestoEvaluacionForm` (Task 4). Renders the existing `ValidacionSelect` component completely unchanged (same props as today) — this task does not touch the dirección-facing validation column.

- [ ] **Step 1: Replace `src/app/(app)/sector/[slug]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { query } from "@/lib/db/query";
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

  const puestos = await query<PuestoRow>(
    `select evaluacion_id, puesto_nombre, puntaje_ponderado_pct, clasificacion, nivel_riesgo, semaforo,
            validacion_direccion, evaluador, to_char(fecha_evaluacion, 'YYYY-MM-DD') as fecha_evaluacion
     from vista_evaluacion_calculada
     where sector_id = $1
     order by puesto_nombre`,
    [sector.id]
  );

  const isDireccion = session.user.rol === "direccion";
  const isOwnSector = session.user.rol === "gerente" && session.user.sectorId === sector.id;

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
                <summary className="flex cursor-pointer flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

- [ ] **Step 2: Type-check and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds, `/sector/[slug]` still listed as a dynamic route.

- [ ] **Step 3: Run the existing verification scripts (no schema changed, should still pass)**

Run: `npm run lint:sql && npm run verify:seed-counts && npm run verify:real-scores`
Expected: all three still `OK`, unchanged from before this task (confirms nothing under `db/` was touched).

- [ ] **Step 4: Manual verification**

Requires `npm run dev` and a real login — this cannot be automated in the agent's environment, describe the expected behavior for the user to confirm:

1. Log in as the `gerente` for a sector with more than one puesto (see `docs/superpowers/plans/2026-08-04-credenciales-prueba.md` for test credentials). Expected: each puesto is now a collapsible block (closed by default, since there's more than one) — clicking the summary row expands it into the full 10-question form, "Evaluador"/"Fecha de evaluación" fields, and a "Puntaje ponderado (en vivo)" pill.
2. Set one question's score to 4 and leave its justificación empty, then try to submit. Expected: the browser blocks the submit natively (no page reload, no server round-trip) and focuses the empty required textarea.
3. Fill that justificación and submit. Expected: a "Guardado." message appears, and the % shown in the (now-closed) summary row matches what was live-previewed before saving.
4. Log in as a gerente from a DIFFERENT sector and open this same URL directly. Expected: no `<details>`, no form — same read-only Card as before this plan.
5. Log in as `direccion@test.local`. Expected: same read-only Card + `ValidacionSelect` as before this plan — completely unaffected by this task.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/sector/[slug]/page.tsx"
git commit -m "feat: wire evaluation form into sector page for the owning gerente"
```

---

## Final check

Run once, after Task 5:

```bash
npx tsc --noEmit
npm run build
npm run lint:sql
npm run verify:seed-counts
npm run verify:real-scores
```

All five must be clean. The last three confirm this plan didn't accidentally touch anything under `db/` or `scripts/` — it shouldn't have, per the Global Constraints (no schema changes), but they're cheap to re-run.
