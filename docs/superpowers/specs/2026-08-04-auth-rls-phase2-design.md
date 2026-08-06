# F-116 Puestos Clave — Phase 2: Auth + Roles + RLS (self-hosted, no Supabase)

**Status:** Approved, with 2 corrections applied per `PROMPT_Fase2_Implementacion.md` (security_invoker explicit on 0004, no INSERT grant/policy — UPDATE only on 0006/0007)
**Scope:** Login propio (Auth.js v5, Credentials) + RLS real en Postgres self-hosted + Next.js containerizado detrás de Nginx (host). Navbar consciente de rol/sector. El formulario completo de 10 preguntas y el dashboard MAESTRO con gráficos siguen siendo Fase 3 — esta fase construye lo mínimo necesario para probar que un gerente de un sector puede escribir en el suyo y es rechazado **en la base de datos** al intentar escribir en otro.

## Context

Fase 1 (commit `5932625`, pusheado a `origin/main`) construyó el schema y seed asumiendo Supabase (`supabase/migrations/`, `supabase/seed.sql`, corridos vía `supabase db reset`). Esa decisión se revierte acá: no hay Supabase (ni cloud ni self-hosted) en ningún punto de la infra. Todo corre en Postgres + Docker + Nginx propios del server existente.

Infra relevada en proyectos hermanos del mismo server (`plataforma_medica`, `pruebas-control`, `pdf-sica/pdf-merger`, `files/panel-presencia` — ver sus `docker-compose.yml` locales):
- Cada proyecto corre su **propio** contenedor Postgres cuando lo necesita (patrón `medica_db` en `plataforma_medica`), no uno compartido.
- La red Docker externa `sicalab_default` se usa específicamente cuando un contenedor de un proyecto necesita resolver el hostname de un contenedor de **otro** proyecto (ej. `pdf-merger` → `gotenberg`). Los proyectos de un solo contenedor la usan por eso, no para que Nginx les llegue.
- El Nginx que expone todo al público corre en el **host**, fuera de Docker, con un `server {}` por proyecto haciendo `proxy_pass` a `localhost:<puerto>`. No hay ninguna config de ese Nginx versionada en ningún repo local — no se edita acá, se documenta un bloque de ejemplo para que el usuario lo integre a mano.
- Puertos de host ya ocupados: `8095` (pdf-merger), `8096` (panel-presencia), `3002` (plataforma_medica-frontend). Este proyecto usa **8097**.

Decisión: puestos-clave sigue el patrón `plataforma_medica` (Postgres propio dedicado, sin unirse a `sicalab_default`, ya que no necesita llamar a contenedores de otros proyectos).

## Out of scope (Fase 3)

- Formulario de carga completo (10 preguntas, cálculo en vivo, guardado).
- Dashboard MAESTRO con KPIs/gráficos/tabla consolidada.
- Diseño visual (animaciones, bento grid, paleta SICA) — esta fase usa UI mínima sin pulir.

---

## 1. Reestructuración: `supabase/` → `db/`

El SQL de Fase 1 no tiene nada específico de Supabase (se evitó `auth.uid()`, RLS de Supabase, etc. deliberadamente), así que el contenido se mueve tal cual:

- `supabase/migrations/20260804120000_create_schema.sql` → `db/migrations/0001_create_schema.sql`
- `supabase/migrations/20260804120100_create_vista_evaluacion_calculada.sql` → `db/migrations/0002_create_vista_evaluacion_calculada.sql`
- `supabase/seed.sql` → `db/seed.sql`
- Se borra el directorio `supabase/` completo y la dependencia `"supabase": "2.111.0"` de `package.json` — ya no se usa `supabase db reset` para nada.
- `scripts/lint-sql.mjs`, `scripts/verify-seed-counts.mjs`, `scripts/verify-real-scores.mjs` se actualizan solo en las rutas que leen (`supabase/migrations` → `db/migrations`, `supabase/seed.sql` → `db/seed.sql`), sin cambios de lógica.

Reemplazo de `supabase db reset`: `scripts/migrate.mjs`, un runner propio con `pg`:

```sql
create table if not exists schema_migrations (
  id serial primary key,
  filename text not null unique,
  applied_at timestamptz not null default now()
);
```

`migrate.mjs` lee `db/migrations/*.sql` ordenados por nombre, y para cada archivo no registrado en `schema_migrations`: `BEGIN`, ejecuta el archivo completo, `INSERT INTO schema_migrations (filename) VALUES (...)`, `COMMIT`. Si un archivo falla, `ROLLBACK` y aborta sin marcar los siguientes. Corre con el rol dueño de las tablas (ver sección 3), nunca con el rol de la app.

---

## 2. Schema nuevo

`vista_evaluacion_calculada` (Fase 1) selecciona `e.validacion_direccion` explícitamente dentro de su CTE `base` — es una dependencia real de Postgres, no cosmética. Si se suelta la columna antes de que la vista deje de referenciarla, `ALTER TABLE ... DROP COLUMN` falla en seco ("cannot drop column ... because other objects depend on it"). El orden importa, por eso son 3 migraciones separadas, no una:

**`db/migrations/0003_perfil_and_validacion_puesto.sql`** — crea las tablas nuevas, todavía no toca `evaluacion` ni la vista:

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

**`db/migrations/0004_update_vista_calculada.sql`** — `create or replace view`, reemplazando la referencia directa a `e.validacion_direccion` dentro del CTE `base` por `left join validacion_puesto vp on vp.evaluacion_id = e.id` y `coalesce(vp.estado, 'pendiente') as validacion_direccion` en el `select` final — mismo nombre de columna que el dashboard de Fase 1 ya espera, mismo resto de la fórmula (sin tocar nada del cálculo, ya verificado contra los 5 casos reales). `create or replace view` **no hereda** `with (security_invoker = true)` de la versión anterior — hay que repetirlo explícitamente en la misma sentencia, si no la vista vuelve a quedar security-definer sin que nada lo avise:

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

`coalesce(vp.estado, 'pendiente')` cubre el caso transitorio entre la migración 0004 (que ya corre con esta vista nueva) y la 0005 (que todavía no migró los datos de `evaluacion.validacion_direccion` a `validacion_puesto`) — en ese punto intermedio `validacion_puesto` está vacía y la vista debe seguir devolviendo `'pendiente'`, no `null`, para no romper nada que ya lea esta columna del dashboard de Fase 1.

Verificación de que `security_invoker` quedó seteado tras el `CREATE OR REPLACE` (se agrega al runbook de aceptación):

```sql
select relname, reloptions
from pg_class
where relname = 'vista_evaluacion_calculada';
-- reloptions debe incluir security_invoker=true
```

**`db/migrations/0005_drop_validacion_direccion_column.sql`** — ahora sí, seguro:

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

---

## 3. Roles de Postgres

Dos roles, nunca el mismo:

- **`puestos_clave_owner`** (o el rol por defecto del contenedor Postgres) — dueño de las tablas, corre `migrate.mjs` y `db/seed.sql`. Nunca se usa desde la app.
- **`puestos_clave_app`** — el que usa `DATABASE_URL` de Next.js. Creado explícitamente **sin `BYPASSRLS`** (los roles no-superusuario no lo tienen por default; se documenta acá para que quede explícito y no dependa de un default silencioso):

```sql
-- db/migrations/0006_create_app_role_and_grants.sql (versionado, sin secretos)
do $$
begin
  if not exists (select from pg_roles where rolname = 'puestos_clave_app') then
    create role puestos_clave_app with login nosuperuser nobypassrls;
  end if;
end $$;

grant connect on database puestos_clave to puestos_clave_app;
grant usage on schema public to puestos_clave_app;

grant select on sector, puesto, pregunta to puestos_clave_app;
grant select on perfil to puestos_clave_app; -- para el authorize() del login
grant select, update on evaluacion, respuesta_pregunta, validacion_puesto to puestos_clave_app;
grant select on vista_evaluacion_calculada to puestos_clave_app;
```

Sin `insert` en `evaluacion`/`respuesta_pregunta`/`validacion_puesto`: el diseño de Fase 1 (`docs/superpowers/specs/2026-08-04-data-model-seed-design.md`) es explícito en que el formulario hace `UPDATE` sobre las filas pre-seedeadas (76 `evaluacion` + 760 `respuesta_pregunta` ya existen desde Fase 1; `validacion_puesto` se llena por la migración 0005, no por la app), nunca `INSERT` — mínimo privilegio real, no solo declarado. Si una feature futura (ej. "agregar puesto nuevo") necesita `INSERT`, se agrega en el momento en que se diseñe esa feature, no antes.

La contraseña del rol se setea aparte, fuera de git, con `scripts/set-app-role-password.mjs` (usa `pg`, toma `POSTGRES_APP_PASSWORD` de env, corre `ALTER ROLE puestos_clave_app WITH PASSWORD '<valor>'` una vez por entorno — idempotente, sin riesgo de inyección porque el valor viene de una env var propia, no de input de usuario).

`sector`, `puesto`, `pregunta`: sin RLS — son datos de referencia estáticos, y el rol de la app no tiene `INSERT`/`UPDATE`/`DELETE` en ellos (el `GRANT` ya los protege, RLS encima sería complejidad sin beneficio real).

---

## 4. RLS

```sql
-- db/migrations/0007_enable_rls.sql
alter table evaluacion enable row level security;
alter table respuesta_pregunta enable row level security;
alter table validacion_puesto enable row level security;

-- SELECT abierto a cualquier fila para cualquier conexión con este rol —
-- la restricción de "quién puede ni siquiera conectarse" vive en el
-- middleware de Next.js (sesión Auth.js válida), no acá, porque solo hay
-- un rol de Postgres compartido para toda la app.
create policy evaluacion_select on evaluacion for select using (true);
create policy respuesta_pregunta_select on respuesta_pregunta for select using (true);
create policy validacion_puesto_select on validacion_puesto for select using (true);

-- Gerente: solo puede tocar evaluacion/respuesta_pregunta de puestos de SU sector.
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

-- Dirección: solo puede tocar validacion_puesto, nunca respuesta_pregunta.
create policy validacion_puesto_write on validacion_puesto for update using (
  current_setting('app.rol', true) = 'direccion'
) with check (
  current_setting('app.rol', true) = 'direccion'
);
```

Con contexto vacío (nadie llamó `set_config`), `current_setting('app.rol', true)` devuelve `NULL`; `NULL = 'gerente'` es `NULL` (no `true`), así que toda policy de escritura falla por default — el "sin contexto = default deny" pedido sale de esto, sin código extra.

Las tres policies de escritura (`evaluacion_write`, `respuesta_pregunta_write`, `validacion_puesto_write`) usan `for update`, no `for all` — mínimo privilegio, consistente con que el `GRANT` de la sección 3 tampoco incluye `insert` ni `delete`. Ninguna fila nueva se crea desde la app en esta fase: las 76 `evaluacion` y 760 `respuesta_pregunta` vienen pre-seedeadas de Fase 1, y `validacion_puesto` se llena en la migración 0005, no en runtime.

---

## 5. `withUserContext` y cliente de DB

`lib/db/pool.ts` — un único `pg.Pool` module-level, `DATABASE_URL` apunta al rol `puestos_clave_app`.

`lib/db/withUserContext.ts` — tal cual el helper del prompt (`BEGIN` → 3x `select set_config(...)` → callback → `COMMIT`/`ROLLBACK` → `client.release()`). Toda Server Action que escribe `evaluacion`, `respuesta_pregunta` o `validacion_puesto` pasa por acá — no hay excepciones.

Lecturas simples (lista de sectores, `vista_evaluacion_calculada` para el navbar) usan un helper de solo-lectura más liviano (`lib/db/query.ts`, `pool.query(...)` directo, sin transacción) ya que las policies de `SELECT` son `using(true)` — no necesitan contexto de sesión para leer, pero sí necesitan que el middleware ya haya verificado que hay una sesión Auth.js válida antes de llegar a ese código (defensa en profundidad: RLS protege escritura por sector, el middleware protege que existe una sesión).

No se usa Prisma ni ningún ORM (Fase 1 ya estableció "no ORM, SQL plano" y no hay Prisma instalado) — `pg` directo para todo, lecturas y escrituras.

---

## 6. Auth.js v5 (Credentials + JWT)

- `auth.config.ts` (edge-safe): `pages: { signIn: '/login' }`, `callbacks.authorized` (usado por el middleware — redirige a `/login` si no hay `auth.user`). Sin imports de `bcryptjs` ni `pg` acá — el middleware corre en Edge runtime y ninguna de las dos librerías es edge-compatible.
- `auth.ts` (Node runtime): importa `auth.config`, agrega el provider `Credentials`:
  - `authorize({ email, password })`: `SELECT id, password_hash, nombre, rol, sector_id FROM perfil WHERE email = $1` (vía `lib/db/query.ts`, con el rol `puestos_clave_app` que ya tiene `GRANT SELECT` en `perfil`), `bcryptjs.compare(password, row.password_hash)`, si coincide devuelve `{ id, email, nombre, rol, sectorId }`, si no `null`.
  - `callbacks.jwt`: en el primer login (`user` presente) copia `rol`/`sectorId` al token.
  - `callbacks.session`: copia `token.rol`/`token.sectorId` a `session.user`, para que el layout autenticado los lea del JWT sin pegarle a la base en cada render.
- `middleware.ts`: `export { auth as middleware } from "@/auth"` con el `matcher` excluyendo `/login`, `/api/health`, y assets estáticos.
- `AUTH_SECRET`: generado con `npx auth secret`, en `.env` (no commiteado).
- `AUTH_URL`/`trustHost`: dominio real todavía no decidido — se documenta en `.env.example` como `AUTH_URL=https://REEMPLAZAR.example.com` con una nota en `docs/` de que hay que setearlo antes de deployar, porque sin esto las cookies de sesión no salen bien detrás de Nginx.
- Password hashing: **bcryptjs** (JS puro), no `bcrypt` nativo — evita compilar nativo cruzado en el build multi-stage de la imagen Alpine.

---

## 7. Seed de usuarios de prueba

`db/seed.sql` (Fase 1, movido) sigue siendo SQL estático sin secretos. Los 3 usuarios de prueba necesitan un hash bcrypt real, así que van en un script Node aparte:

`scripts/seed-users.mjs` — usa `pg` + `bcryptjs`, hashea con el mismo `bcryptjs.hash(password, 10)` que usa `authorize()`, hace `INSERT ... ON CONFLICT (email) DO UPDATE` (idempotente). Las contraseñas de prueba salen de env vars con defaults de desarrollo documentados (no hardcodeadas como si fueran producción):

| Usuario | Email | Rol | Sector | Env var (password) |
|---|---|---|---|---|
| Gerente Compras | `compras@test.local` | gerente | Compras (2 puestos, rápido de probar) | `SEED_PASSWORD_GERENTE_COMPRAS` (default doc: `Compras123!`) |
| Gerente Almacenes | `almacenes@test.local` | gerente | Almacenes (para el test cruzado de RLS) | `SEED_PASSWORD_GERENTE_ALMACENES` (default doc: `Almacenes123!`) |
| Dirección | `direccion@test.local` | direccion | — | `SEED_PASSWORD_DIRECCION` (default doc: `Direccion123!`) |

Documentado en `docs/superpowers/plans/2026-08-04-credenciales-prueba.md` — estas son credenciales de **prueba/desarrollo**, no de producción; se documentan tal como pide el prompt.

---

## 8. `verify:rls`

`scripts/verify-rls.mjs` — se conecta con el rol `puestos_clave_app` (nunca con el owner, para probar exactamente lo que la app va a poder hacer). Cada caso: `BEGIN`, `set_config` según el escenario, intento de escritura, `ROLLBACK` siempre (nunca deja datos mutados), assert éxito/fracaso esperado:

1. Gerente de Compras escribe `respuesta_pregunta` de un puesto de Compras → éxito.
2. Gerente de Compras escribe `respuesta_pregunta` de un puesto de Almacenes → falla (policy violation).
3. Dirección intenta escribir `respuesta_pregunta` → falla (rol no es `gerente`).
4. Dirección escribe `validacion_puesto` → éxito.
5. Gerente intenta escribir `validacion_puesto` → falla (rol no es `direccion`).
6. Sin `set_config` (contexto vacío) → cualquier intento de escritura falla (default deny).
7. `SELECT` funciona igual con o sin contexto (sanity check de que la lectura no quedó accidentalmente bloqueada).

Como no hay Docker en este entorno de ejecución (misma limitación que Fase 1), `verify:rls` se escribe y se revisa estáticamente, pero solo se puede correr de verdad contra Postgres real en el server del usuario — se agrega como paso al runbook existente.

---

## 9. Docker Compose + Dockerfile

`docker-compose.yml` (raíz del repo, reemplaza cualquier compose previo — no existía ninguno en Fase 1):

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

Sin `sicalab_default` (ver razonamiento en Contexto). `app/api/health/route.ts` nuevo (`GET` → `200 { status: 'ok' }`) para el healthcheck.

`Dockerfile` multi-stage: `deps` (instala con `package-lock.json`) → `build` (`next build`, requiere `output: 'standalone'` en `next.config.ts`) → `runtime` (imagen `node:22-alpine` liviana, copia solo `.next/standalone` + `.next/static` + `public`, usuario no-root, `CMD ["node", "server.js"]`).

Migraciones/seed/creación de rol no corren dentro del `Dockerfile` — son pasos de deploy separados (`docker compose exec` o un job aparte), documentados en el runbook, para no atar el ciclo de vida de la imagen al de la base.

---

## 10. Nginx (documentado, no editado en vivo)

No tengo el archivo real del Nginx del host. Se documenta un bloque de ejemplo en `docs/` para que el usuario lo agregue a su config existente:

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

Con TLS terminado ahí, `AUTH_URL` debe ser `https://` para que Auth.js emita la cookie de sesión con `Secure`.

---

## 11. Frontend (alcance de esta fase)

- `middleware.ts` — redirige a `/login` sin sesión.
- `app/login/page.tsx` — form email/password, Server Action que llama `signIn('credentials', ...)`.
- `app/(app)/layout.tsx` — resuelve `session.user.rol`/`sectorId` (del JWT, sin query nueva), redirige a `/login` si no hay sesión (defensa en profundidad además del middleware), renderiza la navbar de los 12 sectores.
- Navbar: cada sector marcado como **editable** (si `rol === 'gerente' && sectorId === sector.id`) o **solo lectura** (cualquier otro caso) — solo el badge/indicador visual, sin el formulario de 10 preguntas (Fase 3).
- `app/(app)/sector/[slug]/page.tsx` — lista de puestos del sector con su badge de clasificación/riesgo (de `vista_evaluacion_calculada`, ya funcionando desde Fase 1), sin inputs de puntaje.
- Vista de dirección: control simple (`select` con las 3 opciones) para `validacion_puesto.estado` por puesto, vía Server Action que pasa por `withUserContext` y mapea cualquier error de policy violada a "No tenés permiso para editar este sector" (o el mensaje equivalente para dirección) en vez del error crudo de Postgres.
- Sin dashboard MAESTRO con gráficos (Fase 3).

---

## 12. Testing / acceptance

- `npm run lint:sql` (rutas actualizadas a `db/`), `npm run verify:seed-counts`, `npm run verify:real-scores` — siguen pasando igual que Fase 1.
- `npm run verify:rls` — los 7 casos de la sección 8, corridos contra Postgres real (Docker del usuario).
- Login end-to-end: gerente de Compras se loguea, ve Compras editable y el resto solo lectura; un intento manual de `UPDATE respuesta_pregunta` de un puesto de otro sector (vía `withUserContext` con el contexto de Compras) falla con policy violation, no con un check silencioso del lado del cliente.
- `npm run build` sigue pasando con `output: 'standalone'`.

## 13. Runbook de Fase 1 queda obsoleto

`docs/superpowers/plans/2026-08-04-docker-verification-runbook.md` instruye `npx supabase start` / `db reset` — ya no aplica, nada de eso existe en esta fase. Se reemplaza por `docs/superpowers/plans/2026-08-04-fase2-verification-runbook.md`, con los pasos reales: `docker compose up -d postgres`, `node scripts/migrate.mjs`, `psql < db/seed.sql` (o el equivalente vía `pg`), `node scripts/set-app-role-password.mjs`, `node scripts/seed-users.mjs`, y ahí sí las queries de aceptación de Fase 1 (76 puestos, 3/2/71, los 5 casos históricos) más los 7 casos de `verify:rls`. El runbook viejo se deja como referencia histórica con una nota al principio marcándolo obsoleto, no se borra (documenta una decisión ya tomada).

## Out of scope

Formulario completo de 10 preguntas, dashboard MAESTRO, diseño visual pulido (Fase 3). Rotación real de `AUTH_SECRET`/contraseñas de producción (responsabilidad del deploy, no de este spec).
