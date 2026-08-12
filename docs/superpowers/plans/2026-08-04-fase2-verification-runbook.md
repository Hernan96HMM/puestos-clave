> **OBSOLETO (integración sicalab):** Los comandos `docker compose` de este
> runbook usaban el `docker-compose.yml` standalone (contenedores
> `puestos_clave_db`/`puestos_clave_app`, red propia, Postgres 17, volumen
> nombrado). Ese compose fue reemplazado por la integración al stack
> sicalab (contenedores `puestosclave_db`/`sicalab-puestosclave-1`, red
> `sicalab_default`, Postgres 16-alpine, bind mount). Se conserva como
> referencia de las queries de aceptación (siguen siendo válidas). Usar
> `docs/superpowers/plans/2026-08-12-sicalab-integration-runbook.md` para
> los pasos de deploy reales.

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
