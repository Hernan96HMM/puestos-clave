alter table evaluacion enable row level security;
alter table respuesta_pregunta enable row level security;
alter table validacion_puesto enable row level security;

create policy evaluacion_select on evaluacion for select using (true);
create policy respuesta_pregunta_select on respuesta_pregunta for select using (true);
create policy validacion_puesto_select on validacion_puesto for select using (true);

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

create policy validacion_puesto_write on validacion_puesto for update using (
  current_setting('app.rol', true) = 'direccion'
) with check (
  current_setting('app.rol', true) = 'direccion'
);
