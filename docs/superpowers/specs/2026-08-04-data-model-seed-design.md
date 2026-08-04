# F-116 Puestos Clave — Phase 1: Data Model + Seed

**Status:** Draft for review
**Scope:** Postgres schema (Supabase, plain SQL migrations) + seed script. No auth/RLS, no UI — those are later phases (see `PROMPT_Claude_Code_SICA_F116.md` §6 for the full phase breakdown this design implements phases 1–3 of).

## Context

SICA runs an annual "F-116" evaluation of key positions, today spread across 13 Excel files (12 sector files + 1 `F116_MAESTRO_Consolidado.xlsx`). This phase migrates the data model and real historical data into Postgres, so later phases can build auth, the sector forms, and the MAESTRO dashboard on top of it.

The source `.md` prompt claims "11 sectores" but lists 12 numbered sectors including a standalone "Radiología" (whose puestos are also duplicated as a sub-listing inside "Control de Calidad" — confirmed in the real Excels: they're separate sector tabs sharing 4 puesto names). This design uses **12 sectors, 76 puestos total**, matching the real `F116_MAESTRO_Consolidado.xlsx` "TOTAL ORGANIZACIÓN" row exactly.

All question text, weights, ISO refs, and consolidated-table columns were cross-checked against the real `.xlsx` files (`F-116_Compras.xlsx`, `F-116_Admin_y_Finanzas.xlsx`, `F-116_MAESTRO_Consolidado.xlsx`) and match the prompt doc's §2.2 byte-for-byte, with one exception: the first puesto block in `F-116_Admin_y_Finanzas.xlsx` ("Responsable de Administración") uses an older, reworded variant of the same 10 questions. This is treated as a leftover from an earlier draft of the Excel and ignored — the canonical wording from the prompt doc's §2.2 is what gets seeded for all puestos, since the question bank is meant to be identical across sectors.

## Schema

Plain SQL migrations under `supabase/migrations/`, no ORM. IDs are `uuid default gen_random_uuid()`.

```sql
sector
  id            uuid pk
  nombre        text not null
  slug          text not null unique
  orden         int not null

puesto
  id            uuid pk
  sector_id     uuid fk -> sector, not null
  nombre        text not null
  orden         int not null

pregunta                          -- fixed bank of 10, not sector-scoped, seeded once
  id            uuid pk
  numero        int not null unique        -- 1..10
  texto         text not null
  ref_iso       text not null
  peso_pct      numeric not null           -- e.g. 12, 10, 8 — sums to 100

evaluacion                        -- one per puesto
  id                    uuid pk
  puesto_id             uuid fk -> puesto, not null unique
  evaluador             text null
  fecha_evaluacion      date null
  validacion_direccion  text not null default 'pendiente'
                          check (validacion_direccion in ('pendiente','aprobado','observado'))
  actualizado_en        timestamptz not null default now()

respuesta_pregunta
  id              uuid pk
  evaluacion_id   uuid fk -> evaluacion, not null
  pregunta_id     uuid fk -> pregunta, not null
  puntaje         int null check (puntaje between 0 and 5)   -- null = N/A
  justificacion   text null
  unique (evaluacion_id, pregunta_id)
```

**Calculated fields are never stored.** `puntaje_ponderado_pct`, `clasificacion`, `nivel_riesgo`, `semaforo` are derived by a SQL view (`vista_evaluacion_calculada` or similar) joining `evaluacion` → `respuesta_pregunta` → `pregunta`, using the exact formula reverse-engineered from the real Excel formulas (`F-116_Admin_y_Finanzas.xlsx`, cell `E59`):

```
puntaje_ponderado_pct = ROUND( SUM(peso_pct * puntaje) / SUM(peso_pct) / 5 * 100, 1 )
```
— where both sums only include questions where `puntaje IS NOT NULL` (this is how the Excel excludes N/A from the calculation: N/A questions drop out of *both* the numerator and the weight denominator, so the remaining weights are implicitly renormalized to 100%).

```
clasificacion  = case when pct >= 70 then 'PUESTO CLAVE'
                       when pct >= 50 then 'PUESTO DE ATENCIÓN'
                       else 'NO ES PUESTO CLAVE' end
nivel_riesgo   = case when pct >= 70 then 'ALTO'
                       when pct >= 50 then 'MEDIO'
                       else 'BAJO' end
semaforo       = case nivel_riesgo when 'ALTO' then '🔴' when 'MEDIO' then '🟡' else '🟢' end
```

If no `respuesta_pregunta` rows have a non-null `puntaje` yet, `pct` = 0, `clasificacion` = 'NO ES PUESTO CLAVE', matching the real Excel's default state for unanswered blocks.

### Justificación validation

The prompt requires justificación when `puntaje >= 3`. The real data violates this (all 5 historically-answered puestos have scores ≥3 with blank justificación, and `evaluador`/`fecha_evaluacion` are blank across every single puesto in every sector file, with no exceptions found). So this rule is **application-layer only** — enforced by the Next.js form/API in a later phase, not a DB constraint. The DB permits `justificacion` and `evaluador`/`fecha_evaluacion` to be null unconditionally, so the real legacy data imports without modification and without fabricating any text nobody actually wrote.

## Seed data

Seed script (`supabase/seed.sql` or a TS script run once) populates, in order:

1. **12 sectors**, `nombre`/`slug`/`orden` from prompt §2.1 (Admin. y Finanzas, Compras, Comercial, Control de Calidad, Ingeniería, Mantenimiento, Obras, Planificación Operativa, Radiología, Recursos Humanos, SIG y Medio Ambiente, Almacenes).
2. **76 puestos**, exact names and order from prompt §2.1, each linked to its sector.
3. **10 preguntas**, exact text/ref_iso/peso_pct from prompt §2.2 (weights: 12,12,12,10,8,8,10,10,10,8 — sums to 100).
4. **76 evaluaciones** (one per puesto, all `validacion_direccion = 'pendiente'`) + **760 respuesta_pregunta rows** (10 per puesto, all `puntaje = null`) — every puesto gets a full blank block so the future form does UPDATEs, never INSERTs, matching the Excel's fixed-block-per-puesto shape.
5. **Overwrite the 5 respuesta_pregunta sets** that have real historical scores, verified from the actual Excel cells:

   | Sector | Puesto | Q1–Q10 puntajes | Total | Clasificación |
   |---|---|---|---|---|
   | Admin. y Finanzas | Encargado de Tesorería | 5,3,4,3,1,4,5,3,∅,∅ | 71.7% | PUESTO CLAVE |
   | Compras | Comprador Jr. | 4,3,3,3,4,3,3,3,3,3 | 64.0% | PUESTO DE ATENCIÓN |
   | Radiología | Radiólogo (N1) | 5,4,4,4,5,5,5,5,3,1 | 82.8% | PUESTO CLAVE |
   | Recursos Humanos | Responsable Administrativo de RRHH | 4,4,4,4,5,5,5,5,4,4 | 87.2% | PUESTO CLAVE |
   | SIG y Medio Ambiente | Asistente de Gestión de Calidad | 3,4,3,3,4,2,3,3,4,2 | 62.8% | PUESTO DE ATENCIÓN |

   (∅ = N/A/unanswered, stays null.) `justificacion`, `evaluador`, `fecha_evaluacion` stay null for these, matching the source. These totals must match what the view computes — used as the acceptance check for the view's formula.

## Testing / acceptance

- Seed script is idempotent (safe to re-run against a fresh local Supabase instance).
- After seeding, querying the calculated view must reproduce: 76 puestos total, 3 "PUESTO CLAVE", 2 "PUESTO DE ATENCIÓN", 71 "NO ES PUESTO CLAVE" — matching `F116_MAESTRO_Consolidado.xlsx`'s "TOTAL ORGANIZACIÓN" row exactly.
- Per-sector breakdown (puestos evaluados / clave / atención / no-clave) must match the Excel's "RESUMEN POR SECTOR" table for all 12 sectors.

## Out of scope for this phase

Auth, roles, RLS policies, the sector form UI, the MAESTRO dashboard UI, and all visual/animation work (prompt §§3–4) are separate later phases per the prompt's own phase plan (§6).
