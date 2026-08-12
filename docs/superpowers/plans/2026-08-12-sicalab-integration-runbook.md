# Runbook — integración de puestos-clave al stack sicalab

Reemplaza, para el deploy real en el server, al runbook standalone de Fase 2
(`docs/superpowers/plans/2026-08-04-fase2-verification-runbook.md`, que
queda marcado obsoleto — se conserva como referencia de los pasos de
verificación de datos/RLS, que siguen siendo válidos, pero sus comandos
`docker compose` y nombres de contenedor ya no aplican).

Nombres fijados por esta integración — todo lo demás del stack sicalab
(Nginx, red, disco) los referencia así:

- Contenedor app: `sicalab-puestosclave-1`
- Contenedor Postgres: `puestosclave_db`
- Red: `sicalab_default` (externa, ya debe existir en el server)
- Puerto host publicado por la app: `8097` (libre — `8095` es pdf-merger,
  `8096` panel-presencia, `3002` medica-frontend)
- Subdominio propuesto: `puestosclave.sica` — **a confirmar** con quien
  administra Nginx/DNS interno antes de wirearlo (ver paso 6).

## 0. Antes del primer arranque — permisos del volumen

El volumen de Postgres es un bind mount real, no un volumen nombrado de
Docker — la carpeta tiene que existir y tener el owner correcto (UID/GID 70,
el usuario `postgres` dentro de la imagen `postgres:16-alpine`) ANTES de
`docker compose up`, o el contenedor falla al arrancar con
`Permission denied` (mismo problema que tuvimos con `sica_db`):

    mkdir -p /mnt/disco1/sicalab/puestos-clave/data
    chown -R 70:70 /mnt/disco1/sicalab/puestos-clave/data

Si ya existe un volumen nombrado `puestos-clave_postgres_data` de un deploy
standalone anterior (docker-compose.yml previo a esta integración, antes de
pasar a bind mount): **no se migra solo** — si tiene datos reales que
importan, hay que volcarlos a mano (`pg_dump`/`pg_restore` o `docker cp`)
hacia el nuevo bind mount antes de dar de baja el volumen viejo. Confirmar
con `docker volume ls | grep puestos` si existe antes de asumir que es un
install limpio.

## 1. Levantar Postgres

    cp .env.example .env
    # completar .env con contraseñas reales, AUTH_SECRET (npx auth secret),
    # y confirmar AUTH_URL con el subdominio real antes de seguir

    docker compose up -d puestosclave_db
    docker compose ps   -- puestosclave_db debe quedar healthy (pg_isready)

## 2. Build de la imagen de la app

    docker compose build app

## 3. Migraciones, rol de app, seed — vía `docker exec`

Los scripts de deploy (`migrate.mjs`, `set-app-role-password.mjs`,
`seed.mjs`, `seed-users.mjs`) leen `DATABASE_URL_OWNER`. Esa variable
**no** vive en el entorno persistente del contenedor de la app (ver nota en
`docker-compose.yml` — es la misma decisión de mínimo privilegio que ya se
tomó en la revisión final de Fase 2) — se pasa puntualmente en cada
`docker exec` con `-e`, así el proceso principal de la app nunca la tiene
en su `environ`. Primero levantar la app (necesita estar corriendo para que
`docker exec` entre):

    docker compose up -d app
    docker compose ps   -- sicalab-puestosclave-1 debe quedar healthy

    docker exec -e DATABASE_URL_OWNER="postgresql://puestos_clave_owner:<pass>@puestosclave_db:5432/puestos_clave" \
      sicalab-puestosclave-1 npm run db:migrate

    docker exec -e DATABASE_URL_OWNER="postgresql://puestos_clave_owner:<pass>@puestosclave_db:5432/puestos_clave" \
      -e POSTGRES_APP_PASSWORD="<pass>" \
      sicalab-puestosclave-1 npm run db:set-app-password

    docker exec -e DATABASE_URL_OWNER="postgresql://puestos_clave_owner:<pass>@puestosclave_db:5432/puestos_clave" \
      sicalab-puestosclave-1 npm run db:seed

    docker exec -e DATABASE_URL_OWNER="postgresql://puestos_clave_owner:<pass>@puestosclave_db:5432/puestos_clave" \
      sicalab-puestosclave-1 npm run db:seed-users

Alternativa desde el host (si `psql`/Node están disponibles ahí y se
prefiere no depender del contenedor para esto): `puestosclave_db` publica
`127.0.0.1:55432` en loopback, así que los mismos comandos `npm run db:...`
corren igual desde el host con `DATABASE_URL_OWNER` apuntando a
`localhost:55432` (ver `.env.example`).

## 4. Queries de aceptación (heredadas de Fase 1/2, deben seguir dando lo mismo)

Desde el host contra el puerto loopback, o con `docker exec ... psql` si el
container tuviera `psql` instalado (no lo tiene por defecto — la imagen
`node:*-alpine` no trae cliente de Postgres):

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

    psql "$DATABASE_URL_OWNER" -c "
      select relname, reloptions from pg_class
      where relname = 'vista_evaluacion_calculada';
    "
    -- reloptions debe incluir security_invoker=true

    psql "$DATABASE_URL_OWNER" -c "
      select rolname, rolbypassrls, rolsuper from pg_roles
      where rolname = 'puestos_clave_app';
    "
    -- rolbypassrls debe ser 'f', rolsuper debe ser 'f'

## 5. Los 9 casos de RLS (7 originales + 2 de negative-privilege agregados en la revisión final)

    docker exec -e DATABASE_URL="postgresql://puestos_clave_app:<pass>@puestosclave_db:5432/puestos_clave" \
      sicalab-puestosclave-1 npm run verify:rls

Esperado: `9 passed, 0 failed`.

## 6. Nginx — avisar antes de wirear

Una vez que `sicalab-puestosclave-1` está `healthy` y los 9 casos de RLS
pasan, avisar para agregar el bloque `server {}` correspondiente a
Nginx (ver `docs/superpowers/plans/2026-08-04-nginx-example.md` para el
formato base) — subdominio propuesto `puestosclave.sica`, `proxy_pass` a
`http://localhost:8097` si Nginx sigue corriendo en el host, o al hostname
del contenedor vía `sicalab_default` si Nginx también está dockerizado en
esa red. Confirmar cuál de los dos aplica en este server antes de escribir
el bloque final.

## 7. Checklist final antes de dar el deploy por terminado

    docker inspect sicalab-puestosclave-1 --format '{{json .Mounts}}'
    -- esperado: [] (la app no persiste nada local, todo va a Postgres)

    docker inspect puestosclave_db --format '{{json .Mounts}}'
    -- esperado: debe mostrar el bind mount real a
    --   /mnt/disco1/sicalab/puestos-clave/data

    docker inspect sicalab-puestosclave-1 --format '{{json .NetworkSettings.Networks}}'
    -- esperado: debe incluir "sicalab_default"

    docker inspect puestosclave_db --format '{{json .NetworkSettings.Networks}}'
    -- esperado: debe incluir "sicalab_default" también (mismo `networks.default`
    --   del compose, así la app resuelve `puestosclave_db` por DNS interno)

    docker compose ps
    -- ambos servicios "healthy"; confirmar que el healthcheck de la app usa
    --   `wget` (presente en node:*-alpine) y el de Postgres usa `pg_isready`
    --   (presente en la imagen postgres:*-alpine) — ninguno de los dos
    --   depende de `nc`, que no está garantizado en ninguna de las dos imágenes.

Si cualquier paso da algo distinto a lo documentado acá, no se considera
terminada la integración hasta resolverlo.
