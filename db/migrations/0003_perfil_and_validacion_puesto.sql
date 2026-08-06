create table perfil (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  nombre text not null,
  rol text not null check (rol in ('gerente','direccion')),
  sector_id uuid references sector(id),
  created_at timestamptz not null default now(),
  constraint gerente_tiene_sector check (
    (rol = 'gerente' and sector_id is not null) or
    (rol = 'direccion' and sector_id is null)
  )
);

create table validacion_puesto (
  id uuid primary key default gen_random_uuid(),
  evaluacion_id uuid not null unique references evaluacion(id) on delete cascade,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','aprobado','observado')),
  actualizado_por uuid references perfil(id),
  actualizado_en timestamptz not null default now()
);
