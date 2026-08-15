# Fase 3c — Dashboard MAESTRO (KPIs, gráficos, tabla consolidada)

## Contexto

`docs/superpowers/specs/2026-08-14-fase3b-formulario-evaluacion-design.md` cerró explícitamente el Dashboard MAESTRO como fuera de alcance ("Fase 3c"). Con Fase 3b mergeada, cada sector ya tiene formulario editable funcionando end-to-end. Lo que falta del alcance original (`PROMPT_Claude_Code_SICA_F116.md`) es la pieza consolidada: un panel único con KPIs, gráficos y la tabla "Consolidado General" que hoy solo existe como hoja de Excel (`F116_MAESTRO_Consolidado.xlsx`).

El prompt original pedía este dashboard visible para "todos los roles autenticados". La realidad de negocio es más específica: **es una decisión puntual**, no una regla genérica — los gerentes de **RRHH** y **SIG y Medio Ambiente** tienen visibilidad extendida (ven todos los sectores en solo lectura + el dashboard), el resto de los gerentes solo ve y edita su propio sector, y Dirección mantiene acceso total como ya lo tenía.

Revisando el código actual (`layout.tsx`, `Navbar.tsx`, `sector/[slug]/page.tsx`) se encontró que **hoy no existe ninguna restricción de lectura por sector**: cualquier usuario autenticado puede abrir `/sector/[slug]` de cualquier sector en modo solo lectura, y la navbar lista los 12 sectores para todos. Esto nunca fue un problema porque nunca se pidió lo contrario — pero la decisión de negocio de esta fase sí lo pide explícitamente para gerentes comunes, así que este spec incluye cerrar ese acceso como parte del mismo cambio, no como fix aparte.

## Alcance de este spec

1. **Modelo de permisos "acceso extendido"**: nueva columna `perfil.acceso_extendido`, propagada a la sesión, usada para decidir qué sectores ve la navbar y quién puede abrir `/sector/[slug]` de un sector ajeno y `/dashboard`.
2. **Cierre de la lectura abierta actual**: un gerente sin acceso extendido ya no puede ver otros sectores (ni en la navbar ni por URL directa).
3. **Ruta `/dashboard`**: KPIs, gráfico de torta (distribución por clasificación), gráfico de barras (puestos clave por sector), tabla consolidada filtrable/ordenable con la columna de Validación de Dirección editable solo para Dirección.
4. **Landing post-login**: gerentes comunes → su sector (sin cambios). Acceso extendido (RRHH, SIG, Dirección) → `/dashboard`.
5. **Tab "MAESTRO"** en la navbar, visible solo con acceso extendido.
6. **Nivel visual "full spec original"**: se suman `recharts`, `framer-motion`, `lucide-react` como dependencias nuevas — primera vez que este proyecto rompe el criterio de "cero dependencias nuevas" que sostuvieron 3a/3b, es una decisión explícita de esta fase, no un default.
7. **2 usuarios de prueba nuevos** (RRHH, SIG) con `acceso_extendido = true`.

**Explícitamente fuera de este spec:**
- Cualquier cambio a las políticas RLS de escritura (`evaluacion_write`, `respuesta_pregunta_write`, `validacion_puesto_write`) — no se tocan, siguen igual.
- Edición de `validacion_direccion` cambia de UI (se reutiliza `ValidacionSelect` tal cual, solo se monta también en la tabla del dashboard).
- Auditoría/historial de cambios de `acceso_extendido` — es un booleano simple, sin log de quién lo cambió ni cuándo (igual criterio que el resto de `perfil` hoy).
- Responsive avanzado más allá de lo que ya cubre Tailwind por defecto en el resto del proyecto.
- Íconos de icoon.co / integración Magic UI (21st.dev) — no hay MCP conectado para eso en este entorno; se usa `lucide-react`, que la propia spec original autoriza como alternativa.

## Modelo de permisos

### Schema (migración 0008)

```sql
alter table perfil add column acceso_extendido boolean not null default false;
```

Sin `check` cruzado con `rol` — un `direccion` nunca necesita esta columna en `true` (ya tiene acceso total por `rol`), pero no hace daño dejarla en `false` por default para todos y no forzar ninguna combinación. La regla de negocio vive en código de aplicación, no en el schema:

```ts
function puedeVerTodo(user: { rol: "gerente" | "direccion"; accesoExtendido: boolean }) {
  return user.rol === "direccion" || user.accesoExtendido;
}
```

Este helper vive en `src/lib/permisos.ts` (nuevo, una función pura) — se usa desde `layout.tsx`, `sector/[slug]/page.tsx`, `dashboard/page.tsx` y `(app)/page.tsx`, así la regla no se repite cuatro veces.

### Sesión (mismo patrón que `sectorId`)

- `src/types/next-auth.d.ts`: agregar `accesoExtendido: boolean` a `User`, `Session.user` y `JWT` (las 3 interfaces que ya tienen `rol`/`sectorId`), incluyendo la interfaz duplicada en `@auth/core/jwt` por la misma razón que ya está documentada ahí (declaration merging no sigue el re-export).
- `src/auth.ts`: `PerfilRow` suma `acceso_extendido: boolean`; el `select` de `authorize` lo pide; `authorize` lo devuelve como `accesoExtendido`; los callbacks `jwt`/`session` lo propagan igual que `sectorId`.

### Rutas afectadas

| Archivo | Cambio |
|---|---|
| `src/app/(app)/layout.tsx` | La query de sectores para la navbar se filtra: si `!puedeVerTodo(session.user)`, solo el sector propio (`where id = $1`, el `sectorId` de la sesión) en vez de los 12. |
| `src/app/(app)/components/Navbar.tsx` | Recibe un prop nuevo `mostrarDashboard: boolean`; si es `true`, renderiza una tab "MAESTRO" (`href="/dashboard"`) antes de las tabs de sector, con el mismo indicador de activo animado que ya tienen. |
| `src/app/(app)/sector/[slug]/page.tsx` | Después de resolver `sector`, si `!isOwnSector && !puedeVerTodo(session.user)` → `notFound()`. Un gerente común que fuerza la URL de otro sector ve 404, igual que hoy ve 404 un slug inexistente. |
| `src/app/(app)/page.tsx` | Gerente sin acceso extendido → redirect a su sector (sin cambios). Gerente con acceso extendido o `direccion` → `redirect("/dashboard")` en vez de renderizar la lista plana de sectores que hoy es el fallback de Dirección. |
| `src/app/(app)/dashboard/page.tsx` (nuevo) | Si `!puedeVerTodo(session.user)` → `redirect` al sector propio (un gerente común nunca debería llegar acá salvo URL directa, no es un caso de error sino de alcance). |

No se toca `db/migrations/0007_enable_rls.sql`: las policies de `select` ya son `using (true)` — la restricción de lectura por sector es una decisión de producto a nivel de rutas de la aplicación, la base de datos siempre estuvo preparada para lectura abierta a cualquier usuario autenticado (así lo dice el prompt original, sección 5). Bajo riesgo: no hay cambio de política de seguridad, solo de qué muestra la UI/routing.

## Datos del dashboard

Todo sale de `vista_evaluacion_calculada` (ya expone `clasificacion`, `nivel_riesgo`, `semaforo`, `puntaje_ponderado_pct`, `validacion_direccion`) con join a `sector` para nombre/orden. Tres queries en el Server Component, sin vista nueva — son agregaciones simples sobre datos que ya existen:

```sql
-- KPIs
select
  count(*) as total,
  count(*) filter (where clasificacion = 'PUESTO CLAVE') as puesto_clave,
  count(*) filter (where clasificacion = 'PUESTO DE ATENCIÓN') as puesto_atencion
from vista_evaluacion_calculada;

-- Distribución por clasificación (torta)
select clasificacion, count(*) as cantidad
from vista_evaluacion_calculada
group by clasificacion;

-- Puestos clave por sector (barras)
select s.nombre as sector, count(*) as cantidad
from vista_evaluacion_calculada v
join sector s on s.id = v.sector_id
where v.clasificacion = 'PUESTO CLAVE'
group by s.nombre, s.orden
order by s.orden;

-- Tabla consolidada (todas las filas, filtro/orden en cliente)
select v.evaluacion_id, s.nombre as sector, v.puesto_nombre, v.evaluador,
       to_char(v.fecha_evaluacion, 'YYYY-MM-DD') as fecha_evaluacion,
       v.puntaje_ponderado_pct, v.clasificacion, v.nivel_riesgo, v.semaforo,
       v.validacion_direccion
from vista_evaluacion_calculada v
join sector s on s.id = v.sector_id
order by s.orden, v.puesto_nombre;
```

`% sobre el total` (KPI) se calcula en JS (`puesto_clave / total`), no en SQL — es presentación, no dato.

El `%` de la torta y el `count` de las barras cierran solos con los mismos filtros: la tabla consolidada y los gráficos comparten la misma fuente (`vista_evaluacion_calculada`), no hay riesgo de que un número no cierre contra otro por venir de queries independientes con filtros distintos.

## Componentes

**`src/lib/permisos.ts`** (nuevo, función pura): `puedeVerTodo`, como se describió arriba.

**`src/app/(app)/dashboard/page.tsx`** (nuevo, Server Component): hace las 4 queries, arma el layout bento grid, pasa los datos crudos a `DashboardCharts` (client component) para los gráficos y a `TablaConsolidada` (client component) para la tabla filtrable. Ningún estado ni interactividad vive en el Server Component.

**`src/app/(app)/dashboard/DashboardCharts.tsx`** (nuevo, Client Component): envuelve dos `ResponsiveContainer` de `recharts` — un `PieChart` (distribución por clasificación) y un `BarChart` (puestos clave por sector). Los colores de ambos gráficos salen de las mismas CSS custom properties que ya usan los `Badge` (`--risk-high`, `--risk-medium`, `--risk-low`, `--secondary`), leídas vía `getComputedStyle` en el cliente — así un gráfico de "PUESTO CLAVE" usa el mismo rojo que ya significa "riesgo alto" en el resto de la app, no una paleta nueva de Recharts por default.

**`src/app/(app)/dashboard/TablaConsolidada.tsx`** (nuevo, Client Component): recibe las ~76 filas ya resueltas por props, mantiene filtro (sector, clasificación) y orden (columna + dirección) en `useState` local, sin ida y vuelta al servidor — filtrar/ordenar 76 filas en memoria es instantáneo y evita la complejidad de filtros por query string para un dataset de este tamaño. La columna "Validación de Dirección" monta `ValidacionSelect` (ya existe, sin cambios) solo si `rol === "direccion"`; para cualquier otro viewer, `Badge` de solo lectura como ya se usa en `sector/[slug]/page.tsx`.

**KPI cards**: 4 cards chicas en fila (total evaluados, cantidad "Puesto Clave", % sobre el total, cantidad "Puesto de Atención"), reutilizando `Card` ya existente. Con `framer-motion`: fade/slide-in escalonado al entrar en viewport (`whileInView`), mismo criterio para las cards de gráficos y para el bloque de la tabla.

**Headline**: `<h1>` del dashboard con reveal animado por palabra (`framer-motion`, `AnimatePresence`/`motion.span` por palabra) — mismo tratamiento visual mencionado en la spec original para login/dashboard, no se extiende a otros headlines de la app en este spec.

**Íconos**: `lucide-react` en los KPI cards (un ícono por métrica) y en la tab "MAESTRO" de la navbar. No se usa en ningún otro lado de la app todavía — no hace falta retrofit de `sector/[slug]/page.tsx` ni de `login`, eso quedaría para una fase de "pulido visual" aparte si se decide más adelante.

## Seed de datos de prueba

**`scripts/seed-users.mjs`**: se agregan 2 entradas al array `USERS`:

| Email | Nombre | Sector (slug) | acceso_extendido |
|---|---|---|---|
| `rrhh@test.local` | Gerente RRHH (prueba) | Recursos Humanos (`recursos-humanos`) | `true` |
| `sig@test.local` | Gerente SIG (prueba) | SIG y Medio Ambiente (`sig-y-medio-ambiente`) | `true` |

Passwords por `SEED_PASSWORD_GERENTE_RRHH` / `SEED_PASSWORD_GERENTE_SIG`, default `RRHH123!` / `Sig123!` — mismo patrón que las 3 cuentas existentes. El `insert ... on conflict` se extiende con `acceso_extendido = $6` (nueva columna en el upsert). `docs/superpowers/plans/2026-08-04-credenciales-prueba.md` se actualiza con las 2 filas nuevas y una nota de qué caso de uso cubren (acceso extendido + dashboard).

Los datos reales de evaluaciones ya sembrados (76 puestos, 5 evaluaciones históricas con puntajes reales según `verify:real-scores`) alcanzan para que el dashboard no se vea vacío — no hace falta generar evaluaciones de muestra adicionales.

## Archivos

**Nuevos:**
- `db/migrations/0008_add_acceso_extendido.sql`
- `src/lib/permisos.ts`
- `src/app/(app)/dashboard/page.tsx`
- `src/app/(app)/dashboard/DashboardCharts.tsx`
- `src/app/(app)/dashboard/TablaConsolidada.tsx`

**Modificados:**
- `package.json` (dependencias: `recharts`, `framer-motion`, `lucide-react`)
- `src/types/next-auth.d.ts`
- `src/auth.ts`
- `src/app/(app)/layout.tsx`
- `src/app/(app)/components/Navbar.tsx`
- `src/app/(app)/sector/[slug]/page.tsx`
- `src/app/(app)/page.tsx`
- `scripts/seed-users.mjs`
- `docs/superpowers/plans/2026-08-04-credenciales-prueba.md`

No se toca `db/migrations/0007_enable_rls.sql`, `evaluacionActions.ts`, `PuestoEvaluacionForm.tsx`, ni `ValidacionSelect.tsx` (se reutiliza tal cual, sin modificar su archivo).

## Verificación

Mismo criterio que 3a/3b: sin suite de tests. `npx tsc --noEmit`, `npm run build`, `npm run lint:sql`, `npm run verify:seed-counts`, `npm run verify:real-scores` deben seguir en verde (la migración 0008 es aditiva, no debería afectar ningún verify existente). Se agrega:

- `npm run verify:acceso-extendido` (nuevo script chico): confirma que después de `db:seed-users`, exactamente 2 filas de `perfil` tienen `acceso_extendido = true` y son las de RRHH/SIG (no Dirección, no ningún otro gerente).

Verificación manual guiada en el plan de implementación:
1. Gerente común (ej. Compras) — navbar muestra solo "Compras", `/sector/almacenes` por URL directa → 404, no ve tab "MAESTRO", `/dashboard` por URL directa → redirect a su sector.
2. Gerente RRHH — navbar muestra los 12 sectores + "MAESTRO", los 11 ajenos en solo lectura, el propio (RRHH) editable, aterriza en `/dashboard` después de loguearse.
3. Dirección — mismo acceso total que ya tenía + tab "MAESTRO", puede editar Validación de Dirección desde la tabla consolidada del dashboard (no solo desde cada `/sector/[slug]`).
4. Los 2 gráficos y la tabla reflejan los mismos 76 puestos con los mismos números — cruzar a mano el count de la torta contra el total de la tabla filtrada.
5. Filtro de la tabla por sector y por clasificación, orden por columna — client-side, sin reload.
