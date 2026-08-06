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
