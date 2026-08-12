create table sector (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text not null unique,
  orden int not null
);

create table puesto (
  id uuid primary key default gen_random_uuid(),
  sector_id uuid not null references sector (id) on delete cascade,
  nombre text not null,
  orden int not null
);

create table pregunta (
  id uuid primary key default gen_random_uuid(),
  numero int not null unique,
  texto text not null,
  ref_iso text not null,
  peso_pct numeric not null
);

create table evaluacion (
  id uuid primary key default gen_random_uuid(),
  puesto_id uuid not null unique references puesto (id) on delete cascade,
  evaluador text,
  fecha_evaluacion date,
  validacion_direccion text not null default 'pendiente'
    check (validacion_direccion in ('pendiente', 'aprobado', 'observado')),
  actualizado_en timestamptz not null default now()
);

create table respuesta_pregunta (
  id uuid primary key default gen_random_uuid(),
  evaluacion_id uuid not null references evaluacion (id) on delete cascade,
  pregunta_id uuid not null references pregunta (id) on delete cascade,
  puntaje int check (puntaje between 0 and 5),
  justificacion text,
  unique (evaluacion_id, pregunta_id)
);
