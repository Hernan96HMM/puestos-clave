# Fase 3b — Formulario de evaluación editable (10 preguntas, cálculo en vivo)

## Contexto

`docs/superpowers/specs/2026-08-13-fase3a-visual-design.md` ya identificó esta fase al partir la "Fase 3" original: 3a cubrió el diseño visual de las pantallas que **ya existían** (login, navbar, índice, sector page, control de validación de dirección) — pero ninguna de ellas nunca tuvo forma de editar una evaluación. La tabla `respuesta_pregunta` está poblada por el seed (760 filas en blanco) y solo se probó por RLS directo en `scripts/verify-rls.mjs`; no existe ningún componente que la lea ni la escriba.

Motivador inmediato: el usuario entró como gerente de "Compras" y vio la sector page ya estilizada (Fase 3a) pero sin ningún input — cada puesto muestra badge de riesgo y "pendiente", sin forma de cargar los puntajes. Es el comportamiento esperado del alcance actual, no un bug, pero confirma que esta es la próxima pieza a construir.

## Alcance de este spec

El formulario editable de 10 preguntas por puesto, para el gerente dueño del sector, en la misma ruta `/sector/[slug]` que ya existe. Incluye:
- Carga/edición de las 10 respuestas (puntaje 0-5 o N/A + justificación) por puesto.
- Campos `evaluador` (texto libre) y `fecha_evaluacion` (fecha), parte de la misma tabla `evaluacion`.
- Validación de negocio: justificación obligatoria si puntaje ≥ 3 (cliente + servidor).
- Cálculo en vivo del puntaje ponderado mientras el gerente completa, antes de guardar.
- Guardado por puesto (un botón "Guardar" por bloque, no un guardado global de sector).

**Explícitamente fuera de este spec:**
- Dashboard MAESTRO (KPIs, gráficos, tabla consolidada) — Fase 3c.
- Cualquier librería nueva (shadcn/ui, Framer Motion, Recharts, Magic UI/Stitch) — se sigue el mismo criterio que 3a: cero dependencias nuevas, Tailwind a mano.
- Animaciones de scroll/reveal — Fase 3d si llega a hacer falta.
- Cambios de schema — `evaluacion`/`respuesta_pregunta`/`pregunta` ya tienen todas las columnas que este spec necesita (migración 0001), no hace falta ninguna migración nueva.
- Un componente `Select`/`Accordion` genérico nuevo — se reutiliza `<select>`/`<details>` nativos, mismo criterio que `ValidacionSelect` en 3a.

## Datos

Sin cambios de schema. Se leen/escriben las tablas ya existentes:

```
pregunta            (banco fijo, 10 filas, no editable desde la UI)
 - id, numero, texto, ref_iso, peso_pct

evaluacion           (una por puesto)
 - id, puesto_id, evaluador, fecha_evaluacion, validacion_direccion, actualizado_en

respuesta_pregunta   (una por evaluacion × pregunta, 10 por evaluación)
 - id, evaluacion_id, pregunta_id, puntaje (0-5 o null), justificacion
```

`puntaje = null` es la única representación de "N/A / sin responder" que tiene el schema — no distingue "todavía no completado" de "administrativamente no aplica". Es una decisión ya tomada en Fase 1 (migración 0001 + seed), este spec no la reabre.

**Lectura** — `sector/[slug]/page.tsx` ya hace:
```sql
select evaluacion_id, puesto_nombre, puntaje_ponderado_pct, clasificacion, nivel_riesgo, semaforo, validacion_direccion
from vista_evaluacion_calculada where sector_id = $1 order by puesto_nombre
```
Se extiende para pedir también `evaluador, fecha_evaluacion` (la vista ya los expone, migración 0004 — solo son dos columnas más en el `select`, sin tocar la vista).

Cuando el usuario es el gerente dueño del sector (`session.user.rol === "gerente" && session.user.sectorId === sector.id`), se agrega una segunda query, solo en ese caso:
```sql
select rp.evaluacion_id, pr.id as pregunta_id, pr.numero, pr.texto, pr.ref_iso, pr.peso_pct,
       rp.puntaje, rp.justificacion
from respuesta_pregunta rp
join pregunta pr on pr.id = rp.pregunta_id
where rp.evaluacion_id = any($1)
order by rp.evaluacion_id, pr.numero
```
con `$1` = los `evaluacion_id` ya obtenidos de la primera query. El resultado se agrupa en JS por `evaluacion_id` (un array de 10 filas por puesto) y se pasa como prop al componente del formulario.

**Escritura** — una Server Action nueva, un `UPDATE evaluacion` + 10 `UPDATE respuesta_pregunta` dentro de la misma transacción de `withUserContext` (nunca `INSERT` — las filas ya existen desde el seed, mismo criterio de Fase 2).

## Componentes

**`src/lib/calculoPuntaje.ts`** (función pura, sin JSX): replica la fórmula de `vista_evaluacion_calculada` para el preview en el cliente.
```ts
export interface RespuestaCalculo { peso_pct: number; puntaje: number | null }

export function calcularPuntajePonderado(respuestas: RespuestaCalculo[]): number {
  const respondidas = respuestas.filter((r) => r.puntaje !== null);
  const pesoRespondido = respondidas.reduce((sum, r) => sum + r.peso_pct, 0);
  if (pesoRespondido === 0) return 0;
  const sumaPonderada = respondidas.reduce((sum, r) => sum + r.peso_pct * (r.puntaje as number), 0);
  return Math.round(((sumaPonderada / pesoRespondido / 5) * 100) * 10) / 10;
}
```
Es un preview: el valor persistido y mostrado en cualquier otra vista siempre sale de `vista_evaluacion_calculada` después de guardar — no hay dos fuentes de verdad en la base, solo esta duplicación aritmética intencional cliente/servidor (misma razón por la que `verify-real-scores.mjs` ya existe: mantener ambos cálculos alineados es una responsabilidad conocida del proyecto).

**`src/components/ui/Textarea.tsx`** (único primitivo nuevo, mismo patrón que `Input.tsx`):
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

**`src/app/(app)/sector/[slug]/PuestoEvaluacionForm.tsx`** (Client Component nuevo, uno por puesto editable):
- Recibe por props: `evaluacionId`, `slug`, `evaluador` y `fechaEvaluacion` actuales, y el array de 10 `{ preguntaId, numero, texto, refIso, pesoPct, puntaje, justificacion }`.
- Estado local controlado (`useState`) por cada una de las 10 respuestas — a diferencia de `ValidacionSelect` (no controlado), acá hace falta estado controlado porque cada cambio dispara dos efectos: recalcular el puntaje en vivo y decidir si el textarea de esa pregunta es `required`.
- Puntaje en vivo: `calcularPuntajePonderado(respuestas)`, mostrado arriba del bloque (mismo `Badge`/texto que usa la sector page para el valor persistido).
- Por pregunta: número + `texto` + `ref_iso` (muted, chico) + `<select>` de 7 opciones (`N/A`, `0`–`5`, cada una con label completo: `"3 — Medio"`) + `Textarea` de justificación, con `required` dinámico cuando el puntaje seleccionado es 3, 4 o 5.
- `evaluador` (`Field`) y `fecha_evaluacion` (`Input type="date"`) arriba del bloque de preguntas.
- Botón "Guardar" (`Button`) + mensaje de resultado (`useActionState`, mismo patrón que `ValidacionSelect`: error en `text-risk-high`, éxito en `text-risk-low`).

**`src/app/(app)/sector/[slug]/page.tsx`** (modificado): para el puesto donde `isOwnSector` es true, la `Card` envuelve un `<details>` (abierto por defecto solo si es el único puesto del sector, cerrado si hay más de uno — evita que la página cargue con 8 formularios abiertos) con `<summary>` mostrando lo mismo que hoy (nombre, badge de riesgo, %) y el `PuestoEvaluacionForm` colapsado adentro. Para cualquier otro caso (gerente en sector ajeno, dirección) la fila queda exactamente como está — sin `<details>`, sin form.

**`src/app/(app)/sector/[slug]/evaluacionActions.ts`** (Server Action nueva, separada de `actions.ts` que es de Dirección):
```ts
export async function updateEvaluacionAction(
  _prevState: EvaluacionActionState,
  formData: FormData
): Promise<EvaluacionActionState>
```
- Auth: sesión activa y `rol === "gerente"` (mismo chequeo temprano que `updateValidacionAction`; RLS es la defensa real, esto es UX rápida).
- Lee `evaluacionId`, `slug`, `evaluador`, `fechaEvaluacion` y, para cada uno de los 10 `preguntaId` recibidos como campo oculto (`hidden input` con la lista, para no adivinar nombres de campo del lado servidor), `puntaje_<preguntaId>` (`"NA"` o `"0"`–`"5"`) y `justificacion_<preguntaId>`.
- Valida servidor: cualquier puntaje 3/4/5 sin justificación no vacía → error, no llega a tocar la base (mismo criterio que la whitelist de `updateValidacionAction`: fallar antes de la query, no dejar que el error de constraint se confunda con un problema de permisos).
- `withUserContext`: un `UPDATE evaluacion SET evaluador = $1, fecha_evaluacion = $2 WHERE id = $3`, luego 10 `UPDATE respuesta_pregunta SET puntaje = $, justificacion = $ WHERE evaluacion_id = $ AND pregunta_id = $`, todo en la misma transacción/conexión.
- Cuenta filas afectadas (evaluacion + 10 respuestas = 11 esperadas); menos que eso = la policy de RLS filtró algo → mismo mensaje humano que ya usa `updateValidacionAction` ("No tenés permiso para editar este sector.").
- `revalidatePath('/sector/${slug}')` en éxito.

## Archivos

**Nuevos:**
- `src/lib/calculoPuntaje.ts`
- `src/components/ui/Textarea.tsx`
- `src/app/(app)/sector/[slug]/PuestoEvaluacionForm.tsx`
- `src/app/(app)/sector/[slug]/evaluacionActions.ts`

**Modificados:**
- `src/app/(app)/sector/[slug]/page.tsx`

Ningún archivo de auth/RLS/schema se toca — la escritura ya está permitida y probada por `verify-rls.mjs` (casos de `respuesta_pregunta_write`/`evaluacion_write`), este spec solo le construye la UI encima.

## Verificación

Mismo criterio que 3a: sin suite de tests, `npx tsc --noEmit` + `npm run build` + los `verify:*` existentes (sin cambios de schema, deberían seguir pasando igual). Verificación manual guiada en el plan de implementación:
1. Gerente de Compras completa las 10 preguntas de un puesto, deja una en 4 sin justificación → bloqueado (nativo, sin submit).
2. Completa la justificación, guarda → el % en vivo coincide con el que muestra la `Card` después del `revalidatePath`.
3. El mismo gerente abre un puesto de OTRO sector (vía URL directa) → sin `<details>`, sin form, como hoy.
4. (Regresión, ya cubierta por `verify-rls.mjs` pero vale repetirla a mano una vez) un POST directo a la Server Action con el `evaluacionId` de otro sector → 0 filas afectadas, mensaje de permiso, nada se escribe.
