-- Decisión puntual de negocio (no una regla genérica por sector): habilita
-- que un gerente vea, además de su propio sector editable, el resto de los
-- sectores en solo lectura y el dashboard MAESTRO. Hoy solo RRHH y SIG y
-- Medio Ambiente lo tienen (ver scripts/seed-users.mjs). Un `direccion`
-- nunca necesita esta columna en true — ya tiene acceso total por `rol` —
-- por eso no hay un check cruzado con `rol` como el que sí tiene
-- `gerente_tiene_sector` (migración 0003).
alter table perfil add column acceso_extendido boolean not null default false;
