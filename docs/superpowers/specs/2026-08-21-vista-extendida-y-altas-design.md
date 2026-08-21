# Vista extendida de Dirección + altas de puesto y pregunta — Design

**Status:** approved by user (2026-08-21)

## Objetivo

Tres cambios sobre `/sector/[slug]`:

1. Los perfiles con acceso a dashboard (`session.user.esDireccion`) pasan a poder
   ver, en modo solo lectura, las 10 preguntas y respuestas de cada puesto en
   **cualquier** sector — hoy solo ven un resumen (puntaje + clasificación +
   validación) de los sectores que no son el propio.
2. Botón **"Nuevo puesto"** en cada sector: crea un puesto nuevo con las 10
   preguntas globales precargadas (sin responder), listo para completar.
3. Botón **"Nueva pregunta"**, al final de la lista de preguntas de cada
   puesto, visible solo para Dirección: agrega una pregunta puntual a ESE
   puesto (no al catálogo global, no al resto del sector).

## Estado actual (referencia)

- `pregunta`: catálogo global, 10 filas, `numero` único, compartidas por todos
  los sectores/puestos (`db/migrations/0001_create_schema.sql`).
- `evaluacion`: 1:1 con `puesto` (`puesto_id unique`).
- `respuesta_pregunta`: fila por `(evaluacion_id, pregunta_id)`.
- `vista_evaluacion_calculada` (`0004_update_vista_calculada.sql`) calcula
  `puntaje_ponderado_pct` dividiendo `sum(peso_pct * puntaje)` por
  `sum(peso_pct)` **solo de las preguntas respondidas** (`filter (where
  rp.puntaje is not null)`), luego `/5*100`. Esto es clave: el cálculo ya
  se auto-normaliza por lo respondido, así que agregar una pregunta nueva
  con su propio peso no rompe ni requiere reajustar evaluaciones existentes
  — mientras esa pregunta quede sin responder, ni siquiera entra en la
  cuenta.
- Grants actuales (`0006_create_app_role_and_grants.sql`): `select` en
  `sector, puesto, pregunta, perfil`; `select, update` en `evaluacion,
  respuesta_pregunta, validacion_puesto`. **No hay INSERT en ninguna tabla.**
- RLS actual (`0007_enable_rls.sql`): `select` abierto (`using (true)`) en
  `evaluacion`, `respuesta_pregunta`, `validacion_puesto`. `update` en
  `evaluacion`/`respuesta_pregunta` solo si `app.rol = 'gerente'` y el
  `puesto.sector_id` coincide con `app.sector_id`. `update` en
  `validacion_puesto` solo si `app.rol = 'direccion'`.
- `src/app/(app)/sector/[slug]/page.tsx`: si `isOwnSector`, arma el form
  completo (`PuestoEvaluacionForm`) dentro de `<details>`; si no
  (dirección mirando otro sector), muestra un `<Card>` plano con
  puntaje/clasificación/validación nada más — sin fetch de preguntas.

## 1. Modelo de datos

**Migración `0010_pregunta_puesto_y_grants_insert.sql`:**

```sql
alter table pregunta add column puesto_id uuid references puesto(id) on delete cascade;

alter table pregunta drop constraint pregunta_numero_key;
create unique index pregunta_numero_global_unico on pregunta (numero) where puesto_id is null;

grant insert on puesto, evaluacion, respuesta_pregunta, pregunta to puestos_clave_app;

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

alter table puesto enable row level security;
alter table pregunta enable row level security;
create policy puesto_select on puesto for select using (true);
create policy pregunta_select on pregunta for select using (true);
```

`puesto` y `pregunta` no tenían RLS habilitada (solo dependían del grant de
`select`, ya abierto). Al agregar policies de INSERT hay que habilitar RLS
en ambas tablas explícitamente y declarar el `select` que ya tenían
implícito, para no perder el acceso de lectura existente al prender RLS.

## 2. Vista extendida de Dirección (solo lectura)

`src/app/(app)/sector/[slug]/page.tsx`:

- El fetch de `preguntaRows` deja de estar condicionado a `isOwnSector`;
  pasa a `if (isOwnSector || isDireccion)`.
- Las dos ramas del render (`isOwnSector ? <details con form> : <Card
  plano>`) se unifican: **siempre** que `isOwnSector || isDireccion`, se
  arma el `<details>` con `PuestoEvaluacionForm`. La única diferencia es un
  nuevo prop `readOnly={!isOwnSector}`.
- `ValidacionSelect` sigue condicionado únicamente a `isDireccion`, sin
  cambios.

`PuestoEvaluacionForm.tsx`:

- Nuevo prop `readOnly?: boolean` (default `false`).
- Si `readOnly`, el `<select>` de puntaje y el `<Textarea>` de
  justificación quedan `disabled`; no se renderiza el botón "Guardar" ni
  el bloque de `state.error`/`state.ok` (no hay submit posible).
- El botón "Nueva pregunta" (sección 4) se renderiza independientemente de
  `readOnly` — es una acción de catálogo de Dirección, no de edición de
  respuestas.

## 3. Botón "Nuevo puesto"

Nuevo componente `src/app/(app)/sector/[slug]/NuevoPuestoForm.tsx`
(client): botón "+ Nuevo puesto" que al hacer clic revela un input de
texto + botón "Crear" (mismo patrón visual que el resto del formulario:
`Field`, `Button`). Usa `useActionState` con la action de abajo.

Visible en `page.tsx` para cualquiera que vea la página (ya está acotado a
`isOwnSector || isDireccion` por el `notFound()` de arriba).

`src/app/(app)/sector/[slug]/puestoActions.ts` (nuevo):

```ts
export async function crearPuestoAction(
  _prevState: PuestoActionState,
  formData: FormData
): Promise<PuestoActionState> {
  const session = await auth();
  if (!session?.user) return { error: "No autenticado." };

  const slug = String(formData.get("slug") ?? "");
  const nombre = String(formData.get("nombre") ?? "").trim();
  if (!nombre) return { error: "El nombre del puesto es obligatorio." };

  const sectorRows = await query<{ id: string }>(
    "select id from sector where slug = $1", [slug]
  );
  const sector = sectorRows[0];
  if (!sector) return { error: "Sector no encontrado." };

  const esGerenteDeEsteSector = session.user.sectoresGerente.includes(sector.id);
  if (!session.user.esDireccion && !esGerenteDeEsteSector) {
    return { error: "No tenés permiso para agregar puestos en este sector." };
  }

  const rol = session.user.esDireccion ? "direccion" : "gerente";

  try {
    await withUserContext(
      { id: session.user.id, rol, sectorId: esGerenteDeEsteSector ? sector.id : null },
      async (client) => {
        const ordenRows = await client.query<{ siguiente: number }>(
          "select coalesce(max(orden), 0) + 1 as siguiente from puesto where sector_id = $1", [sector.id]
        );
        const orden = ordenRows.rows[0].siguiente;

        const puestoRows = await client.query<{ id: string }>(
          "insert into puesto (sector_id, nombre, orden) values ($1, $2, $3) returning id",
          [sector.id, nombre, orden]
        );
        const puestoId = puestoRows.rows[0].id;

        const evalRows = await client.query<{ id: string }>(
          "insert into evaluacion (puesto_id) values ($1) returning id", [puestoId]
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
    // Cualquier fallo real de la base (conexión, constraint inesperado, o la
    // policy de INSERT rechazando la fila): no distinguimos más porque ya
    // validamos el permiso arriba con datos frescos de sesión — mismo
    // criterio que updateValidacionAction en actions.ts.
    return { error: "Ocurrió un error, intentá de nuevo." };
  }

  revalidatePath(`/sector/${slug}`);
  return { ok: true };
}
```

Nota: cuando `esDireccion` y el sector NO es propio, `sectorId` va `null`
en `withUserContext` (igual que hace `actions.ts` hoy para
`updateValidacionAction`) — la policy de `puesto_insert`/`evaluacion_insert`
para `rol = 'direccion'` no depende de `app.sector_id`.

## 4. Botón "Nueva pregunta"

Dentro de `PuestoEvaluacionForm.tsx`, al final de la lista de preguntas,
solo si `esDireccion` (nuevo prop `puedeAgregarPregunta: boolean`, seteado
en `page.tsx` como `session.user.esDireccion`): botón "+ Nueva pregunta"
que revela un mini-formulario (texto, ref. ISO opcional, peso % — inputs
simples) con botón "Agregar".

`src/app/(app)/sector/[slug]/preguntaActions.ts` (nuevo):

```ts
// Marcador local (mismo patrón que evaluacionActions.ts): se lanza DENTRO
// del callback de withUserContext para que dispare ROLLBACK en vez de
// COMMIT si la evaluación no existe o no matchea ninguna fila.
class PermisoError extends Error {}

export async function crearPreguntaPuestoAction(
  _prevState: PreguntaActionState,
  formData: FormData
): Promise<PreguntaActionState> {
  const session = await auth();
  if (!session?.user?.esDireccion) return { error: "Solo Dirección puede agregar preguntas." };

  const evaluacionId = String(formData.get("evaluacionId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const texto = String(formData.get("texto") ?? "").trim();
  const refIso = String(formData.get("refIso") ?? "").trim();
  const pesoPct = Number(formData.get("pesoPct"));

  if (!texto) return { error: "El texto de la pregunta es obligatorio." };
  if (!Number.isFinite(pesoPct) || pesoPct <= 0 || pesoPct > 100) {
    return { error: "El peso debe ser un número entre 1 y 100." };
  }

  try {
    await withUserContext(
      { id: session.user.id, rol: "direccion", sectorId: null },
      async (client) => {
        const evalRows = await client.query<{ puesto_id: string }>(
          "select puesto_id from evaluacion where id = $1", [evaluacionId]
        );
        const puestoId = evalRows.rows[0]?.puesto_id;
        if (!puestoId) throw new PermisoError();

        const numeroRows = await client.query<{ siguiente: number }>(
          `select coalesce(max(numero), 0) + 1 as siguiente from pregunta
           where puesto_id is null or puesto_id = $1`,
          [puestoId]
        );
        const numero = numeroRows.rows[0].siguiente;

        const preguntaRows = await client.query<{ id: string }>(
          "insert into pregunta (numero, texto, ref_iso, peso_pct, puesto_id) values ($1, $2, $3, $4, $5) returning id",
          [numero, texto, refIso, pesoPct, puestoId]
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

## No-goals

- No se reajustan los pesos de las 10 preguntas globales al agregar una
  pregunta de puesto — el cálculo ya se auto-normaliza (ver sección
  "Estado actual").
- No hay edición ni borrado de preguntas de puesto en este alcance, solo
  alta.
- No hay borrado de puestos en este alcance, solo alta.
- La pregunta de puesto no es editable/reordenable después de creada.

## Testing / verificación manual

- Gerente propio: sigue editando su sector igual que antes (regresión).
- Dirección mirando un sector ajeno: ve las 10+ preguntas de cada puesto,
  todo deshabilitado, sin botón Guardar, sin poder submitear.
- Gerente propio: aprieta "Nuevo puesto", carga nombre, aparece con las 10
  preguntas en blanco, las completa y guarda normal.
- Dirección: aprieta "Nuevo puesto" en un sector ajeno, funciona igual.
- Dirección: en un puesto cualquiera, aprieta "Nueva pregunta", la carga
  con peso 5%, aparece al final de la lista (numero 11) — el gerente de
  ese sector la ve y la puede responder; otros puestos del mismo sector NO
  la ven.
- `npm run verify:rls` (o su equivalente extendido) para confirmar que un
  gerente no puede insertar `pregunta` ni `puesto`/`evaluacion` fuera de
  su sector, y que un gerente sin `direccion` no puede insertar `pregunta`.
