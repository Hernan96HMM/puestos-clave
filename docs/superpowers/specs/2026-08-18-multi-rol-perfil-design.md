# Fase 3d — Múltiples roles por perfil (`perfil_rol`)

## Contexto

`perfil` fuerza hoy un solo rol por login: `rol text check (rol in ('gerente','direccion'))` + `sector_id` con un `check` cruzado (`gerente_tiene_sector`) que exige sector si es gerente y prohíbe sector si es dirección (migración 0003). `email` es `unique`, así que una persona no puede tener un único login que combine ambos roles.

Necesidad real: RRHH y SIG y Medio Ambiente son gerentes de su propio sector **y** forman parte de Dirección — necesitan un solo login que les dé ambas capacidades: cargar/editar su sector como gerente, y validar puestos de **cualquier** sector como dirección (no solo verlos, como daba `acceso_extendido` en Fase 3c).

Esto hace que `perfil.acceso_extendido` (Fase 3c, migración 0008) quede redundante — todo lo que otorgaba (ver todos los sectores + dashboard MAESTRO) ya lo da tener el rol `direccion`, y esta fase además suma la capacidad de escritura que `acceso_extendido` nunca dio. Se retira en esta fase.

## Alcance de este spec

1. Tabla `perfil_rol` — N filas de rol por perfil, cada `gerente` con su `sector_id`, cada `direccion` sin sector.
2. Migración de los 5 perfiles existentes a la tabla nueva; RRHH y SIG suman una segunda fila `direccion`.
3. `perfil.rol`, `perfil.sector_id`, `perfil.acceso_extendido` se eliminan — toda esa información vive en `perfil_rol`.
4. Sesión/JWT: `session.user.rol`/`sectorId`/`accesoExtendido` (singulares) se reemplazan por `esDireccion: boolean` y `sectoresGerente: string[]`.
5. **Cero cambios a `db/migrations/0007_enable_rls.sql` ni a la firma de `withUserContext`** — cada Server Action resuelve con qué capacidad (`{rol, sectorId}` singular, tal como ya lo espera RLS) actuar según qué acción es, no según un "modo activo" que el usuario elija.
6. Actualización de todos los call sites que hoy comparan `rol`/`sectorId` como valor único (tabla completa en la sección Componentes).
7. `scripts/seed-users.mjs` reescrito para el schema nuevo; se retira `scripts/verify-acceso-extendido.mjs`, se agrega `scripts/verify-roles.mjs`.

**Explícitamente fuera de este spec:**
- Cualquier cambio a `db/migrations/0007_enable_rls.sql` — las políticas siguen comparando `current_setting('app.rol')`/`current_setting('app.sector_id')` contra un solo valor, exactamente como hoy.
- UI para que un usuario "elija" en qué rol actuar — no hace falta, cada acción ya implica la capacidad requerida.
- Cargar los 12 usuarios reales — este spec deja el schema y los scripts listos para eso, pero cargar los datos reales es un paso posterior, coordinado aparte una vez aplicada la migración.
- Cualquier UI nueva para gestionar roles (agregar/quitar roles de un perfil) — hoy se sigue haciendo vía `seed-users.mjs`, igual que el resto de `perfil`.

## Datos

### Schema — migración 0009

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

-- RRHH y SIG suman la segunda fila (dirección), sin perder la de gerente.
insert into perfil_rol (perfil_id, rol, sector_id)
select id, 'direccion', null from perfil where email in ('rrhh@test.local', 'sig@test.local');

alter table perfil drop constraint gerente_tiene_sector;
alter table perfil drop column rol;
alter table perfil drop column sector_id;
alter table perfil drop column acceso_extendido;

grant select on perfil_rol to puestos_clave_app;
```

El `grant` es table-level (mismo criterio que `perfil` en la migración 0006) — no hace falta tocar esa migración vieja, este `grant` vive en la 0009.

### `perfil` después de esta migración

```
perfil
 - id, email, password_hash, nombre, created_at
 (rol, sector_id, acceso_extendido ya no existen acá)

perfil_rol
 - id, perfil_id, rol ('gerente'|'direccion'), sector_id (solo si rol='gerente')
```

## Sesión y el patrón "resolver la capacidad por acción"

**`session.user` nuevo** (reemplaza `rol`/`sectorId`/`accesoExtendido`):
```ts
interface SessionUser {
  id: string;
  esDireccion: boolean;
  sectoresGerente: string[]; // ids de sector donde tiene rol gerente — hoy 0 o 1, el schema soporta N
}
```

`src/types/next-auth.d.ts`: las 4 interfaces que hoy tienen `rol`/`sectorId`/`accesoExtendido` (`User`, `Session.user`, `JWT` en `next-auth/jwt`, `JWT` en `@auth/core/jwt`) pasan a tener `esDireccion: boolean` y `sectoresGerente: string[]`.

`src/auth.ts`: `authorize()` deja de leer `rol`/`sector_id`/`acceso_extendido` de `perfil` — hace un segundo query, con join a `sector` para que `sectoresGerente` salga ya ordenado por `sector.orden` (así `(app)/page.tsx` puede tomar el primero sin ambigüedad si algún día hay más de uno):
```sql
select pr.rol, pr.sector_id
from perfil_rol pr
left join sector s on s.id = pr.sector_id
where pr.perfil_id = $1
order by s.orden
```
```ts
const esDireccion = filas.some((f) => f.rol === "direccion");
const sectoresGerente = filas.filter((f) => f.rol === "gerente").map((f) => f.sector_id as string);
```
Los callbacks `jwt`/`session` propagan `esDireccion`/`sectoresGerente` igual que hoy propagan `rol`/`sectorId`.

**`withUserContext` y `db/migrations/0007_enable_rls.sql` no se tocan.** Siguen esperando `{id, rol: "gerente"|"direccion", sectorId: string|null}` — un solo par por transacción, exactamente como hoy. Lo que cambia es que cada Server Action arma ese par según qué acción es, no según un rol "activo" global:

- **`updateEvaluacionAction`**: hoy pasa `session.user.sectorId` directo a `withUserContext`. Pasa a resolver el `sector_id` de la evaluación que se está guardando (ya tiene `slug` del formulario oculto) y confirmar que esté en `session.user.sectoresGerente` — si no, mismo error de permiso que hoy. Si está, llama `withUserContext({ rol: "gerente", sectorId: eseSector }, ...)`.
- **`updateValidacionAction`**: el chequeo temprano `rol !== "direccion"` pasa a `!session.user.esDireccion`. Llama `withUserContext({ rol: "direccion", sectorId: null }, ...)` — misma forma que hoy, solo cambia de dónde sale el booleano.

Una persona con ambos roles puede llamar a las dos acciones sin que la UI le pregunte "¿en qué rol querés actuar?" — cada Server Action ya implica la capacidad que necesita.

## Componentes — call sites a actualizar

| Archivo | Hoy | Pasa a |
|---|---|---|
| `src/lib/permisos.ts` | `puedeVerTodo(user)`: `rol==='direccion' \|\| accesoExtendido` | `puedeVerTodo(user)`: `user.esDireccion` (misma firma exportada, cuerpo simplificado — se mantiene el helper para no tocar cada call site dos veces) |
| `src/app/(app)/layout.tsx` | query de sectores del navbar gateada en `puedeVerTodo(session.user)` | sin cambio de lógica — `puedeVerTodo` ya devuelve lo correcto con el nuevo `session.user` |
| `src/app/(app)/page.tsx` | si `rol==='gerente' && !puedeVerTodo`, redirect a `sectorId` propio | si `!session.user.esDireccion`, redirect al sector de `sectoresGerente[0]` (ordenado por `sector.orden` — hoy siempre hay como mucho 1, pero el schema soporta N) |
| `src/app/(app)/sector/[slug]/page.tsx` | `isOwnSector = rol==='gerente' && sectorId===sector.id`; `isDireccion = rol==='direccion'` (gatea si se muestra `ValidacionSelect` en la fila de solo lectura) | `isOwnSector = sectoresGerente.includes(sector.id)`; `isDireccion = session.user.esDireccion` |
| `src/app/(app)/dashboard/page.tsx` | guard `!puedeVerTodo(session.user)` | sin cambio de lógica |
| `src/app/(app)/components/Navbar.tsx` | recibe `rol`/`sectorId`, `isEditable = rol==='gerente' && sectorId===sector.id` | recibe `sectoresGerente: string[]`, `isEditable = sectoresGerente.includes(sector.id)` |
| `src/app/(app)/sector/[slug]/evaluacionActions.ts` | ver sección anterior | ver sección anterior |
| `src/app/(app)/sector/[slug]/actions.ts` (`updateValidacionAction`) | ver sección anterior | ver sección anterior |
| `src/app/(app)/dashboard/page.tsx` → `TablaConsolidada` | `esDireccion={session.user.rol==='direccion'}` | `esDireccion={session.user.esDireccion}` |

Ningún archivo de esta tabla cambia su propósito ni su forma externa más allá de lo listado — `PuestoEvaluacionForm.tsx`, `ValidacionSelect.tsx`, `DashboardCharts.tsx`, `DashboardHeader.tsx` no se tocan (no leen `rol`/`sectorId` directamente).

## Seed y verificación

**`scripts/seed-users.mjs`**: se reescribe el `main()` para, por cada usuario, upsertear `perfil` (sin `rol`/`sector_id`/`acceso_extendido`) y luego upsertear sus filas de `perfil_rol` (borra las filas de rol existentes del perfil y vuelve a insertar las declaradas — más simple que un upsert por fila con la clave compuesta). El array `USERS` cambia su forma: cada entrada declara una lista de roles en vez de un `rol`/`sectorId`/`accesoExtendido` planos:
```js
{
  email: "rrhh@test.local",
  nombre: "Gerente RRHH (prueba)",
  passwordEnv: "SEED_PASSWORD_GERENTE_RRHH",
  passwordDefault: "RRHH123!",
  roles: [
    { rol: "gerente", sectorSlug: "recursos-humanos" },
    { rol: "direccion" },
  ],
},
```

**Se retira** `scripts/verify-acceso-extendido.mjs` y su entrada `verify:acceso-extendido` en `package.json` (la columna que verificaba ya no existe).

**Se agrega** `scripts/verify-roles.mjs` (mismo patrón que el script que retira — requiere `DATABASE_URL`, no se ejecuta en el sandbox del agente): confirma que `rrhh@test.local` y `sig@test.local` tienen exactamente 2 filas cada uno en `perfil_rol` (una `gerente` con el sector correcto, una `direccion`), y que los otros 3 perfiles de prueba tienen exactamente 1 fila cada uno con su rol de siempre.

**`docs/superpowers/plans/2026-08-04-credenciales-prueba.md`**: la fila de RRHH/SIG se actualiza — ya no dice solo "acceso extendido (ve todo)", dice que además pueden validar puestos de cualquier sector, como Dirección.

**Verificación automatizada** (mismo criterio que Fase 3c, sin DB real en el entorno del agente): `npx tsc --noEmit`, `npm run build`, `npm run lint:sql`, `npm run verify:seed-counts`, `npm run verify:real-scores`.

**Runbook manual** (con DB real, lo corre el usuario en el server): `npm run db:migrate` (aplica 0009), `npm run db:seed-users` (reescribe `perfil_rol`), `npm run verify:roles`, `npm run verify:rls` (los 9 casos existentes — no deberían cambiar de resultado, porque RLS no se tocó), y una verificación manual en navegador: loguearse como RRHH, confirmar que puede (a) editar su propio sector como siempre, (b) ver y validar puestos de un sector ajeno desde `/sector/[otro-slug]` o desde la tabla del dashboard.
