alter table pregunta add column puesto_id uuid references puesto(id) on delete cascade;

alter table pregunta drop constraint pregunta_numero_key;
create unique index pregunta_numero_global_unico on pregunta (numero) where puesto_id is null;

grant insert on puesto, evaluacion, respuesta_pregunta, pregunta to puestos_clave_app;

alter table puesto enable row level security;
alter table pregunta enable row level security;

create policy puesto_select on puesto for select using (true);
create policy pregunta_select on pregunta for select using (true);

create policy puesto_insert on puesto for insert with check (
  current_setting('app.rol', true) = 'direccion'
  or (
    current_setting('app.rol', true) = 'gerente'
    and sector_id::text = current_setting('app.sector_id', true)
  )
);

create policy evaluacion_insert on evaluacion for insert with check (
  current_setting('app.rol', true) = 'direccion'
  or (
    current_setting('app.rol', true) = 'gerente'
    and exists (
      select 1 from puesto p
      where p.id = evaluacion.puesto_id
        and p.sector_id::text = current_setting('app.sector_id', true)
    )
  )
);

create policy respuesta_pregunta_insert on respuesta_pregunta for insert with check (
  current_setting('app.rol', true) = 'direccion'
  or (
    current_setting('app.rol', true) = 'gerente'
    and exists (
      select 1 from evaluacion e
      join puesto p on p.id = e.puesto_id
      where e.id = respuesta_pregunta.evaluacion_id
        and p.sector_id::text = current_setting('app.sector_id', true)
    )
  )
);

create policy pregunta_insert on pregunta for insert with check (
  current_setting('app.rol', true) = 'direccion'
);

grant insert on validacion_puesto to puestos_clave_app;

create policy validacion_puesto_insert on validacion_puesto for insert with check (
  current_setting('app.rol', true) = 'direccion'
  or (
    current_setting('app.rol', true) = 'gerente'
    and exists (
      select 1 from evaluacion e
      join puesto p on p.id = e.puesto_id
      where e.id = validacion_puesto.evaluacion_id
        and p.sector_id::text = current_setting('app.sector_id', true)
    )
  )
);
