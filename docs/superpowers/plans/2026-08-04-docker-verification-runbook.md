# Docker verification runbook — Phase 1 (data model + seed)

Run this on a machine with Docker running, after pulling the repo.

## 0. Pre-flight (no Docker required)

Install dependencies (this also installs the pinned `supabase` CLI from
`package.json`'s devDependencies, so `npx supabase` below resolves to the
exact version the migrations/config were authored against, not whatever is
latest on the day you run this) and run the cheap offline checks before
touching Docker:

    npm ci
    npm run lint:sql && npm run verify:seed-counts && npm run verify:real-scores

## 1. Apply migrations + seed to a local Supabase instance

    npx supabase start
    npx supabase db reset

`db reset` applies every file in `supabase/migrations/` in order, then runs
`supabase/seed.sql`.

## 2. Acceptance queries

Connect with `npx supabase db psql` (or any Postgres client on the printed
local connection string) and run:

    select count(*) from sector;              -- expect 12
    select count(*) from puesto;               -- expect 76
    select count(*) from pregunta;              -- expect 10
    select count(*) from evaluacion;            -- expect 76
    select count(*) from respuesta_pregunta;    -- expect 760

    select clasificacion, count(*)
    from vista_evaluacion_calculada
    group by clasificacion
    order by clasificacion;
    -- expect: NO ES PUESTO CLAVE = 71, PUESTO CLAVE = 3, PUESTO DE ATENCIÓN = 2

    select puesto_nombre, puntaje_ponderado_pct, clasificacion, nivel_riesgo, semaforo
    from vista_evaluacion_calculada
    where puntaje_ponderado_pct > 0
    order by puntaje_ponderado_pct desc;
    -- expect exactly these 5 rows:
    --   Responsable Administrativo de Recursos Humanos | 87.2 | PUESTO CLAVE        | ALTO  | 🔴
    --   Radiólogo (N1)                                  | 82.8 | PUESTO CLAVE        | ALTO  | 🔴
    --   Encargado de Tesorería                          | 71.7 | PUESTO CLAVE        | ALTO  | 🔴
    --   Comprador Jr.                                   | 64.0 | PUESTO DE ATENCIÓN  | MEDIO | 🟡
    --   Asistente de Gestión de Calidad                 | 62.8 | PUESTO DE ATENCIÓN  | MEDIO | 🟡

    select s.nombre as sector, count(*) as evaluados,
      count(*) filter (where v.clasificacion = 'PUESTO CLAVE') as clave,
      count(*) filter (where v.clasificacion = 'PUESTO DE ATENCIÓN') as atencion,
      count(*) filter (where v.clasificacion = 'NO ES PUESTO CLAVE') as no_clave
    from vista_evaluacion_calculada v
    join sector s on s.id = v.sector_id
    group by s.nombre
    order by s.nombre;
    -- must match F116_MAESTRO_Consolidado.xlsx "RESUMEN POR SECTOR" exactly:
    --   Admin. y Finanzas        | 6  | 1 | 0 | 5
    --   Almacenes                | 4  | 0 | 0 | 4
    --   Comercial                | 6  | 0 | 0 | 6
    --   Compras                  | 2  | 0 | 1 | 1
    --   Control de Calidad       | 11 | 0 | 0 | 11
    --   Ingeniería                | 10 | 0 | 0 | 10
    --   Mantenimiento            | 7  | 0 | 0 | 7
    --   Obras                    | 3  | 0 | 0 | 3
    --   Planificación Operativa  | 11 | 0 | 0 | 11
    --   Radiología                | 3  | 1 | 0 | 2
    --   Recursos Humanos         | 5  | 1 | 0 | 4
    --   SIG y Medio Ambiente     | 8  | 0 | 1 | 7

If any count or value differs from what's listed above, something in the
migrations or seed regressed — do not proceed to the auth/UI phases until
this matches exactly, since later phases build on this data.

## 3. Tear down

    npx supabase stop
