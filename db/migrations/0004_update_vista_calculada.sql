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
