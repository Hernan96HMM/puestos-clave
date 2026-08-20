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

-- RRHH y SIG suman la segunda fila (dirección), sin perder la de gerente —
-- ver docs/superpowers/specs/2026-08-18-multi-rol-perfil-design.md.
insert into perfil_rol (perfil_id, rol, sector_id)
select id, 'direccion', null from perfil where email in ('rrhh@test.local', 'sig@test.local');

alter table perfil drop constraint gerente_tiene_sector;
alter table perfil drop column rol;
alter table perfil drop column sector_id;
alter table perfil drop column acceso_extendido;

grant select on perfil_rol to puestos_clave_app;
