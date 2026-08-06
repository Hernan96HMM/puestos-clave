do $$
begin
  if not exists (select from pg_roles where rolname = 'puestos_clave_app') then
    create role puestos_clave_app with login nosuperuser nobypassrls;
  end if;
end $$;

grant connect on database puestos_clave to puestos_clave_app;
grant usage on schema public to puestos_clave_app;

grant select on sector, puesto, pregunta to puestos_clave_app;
grant select on perfil to puestos_clave_app;
grant select, update on evaluacion, respuesta_pregunta, validacion_puesto to puestos_clave_app;
grant select on vista_evaluacion_calculada to puestos_clave_app;
