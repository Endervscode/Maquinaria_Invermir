-- ============================================================================
-- Control de Maquinaria Pesada · Supabase Schema
-- Run this in the Supabase SQL editor.
-- IMPORTANTE: Ejecutar el script COMPLETO de una sola vez.
-- ============================================================================

-- Extensions
create extension if not exists "pgcrypto";

-- ============================================================================
-- 1. perfiles (standalone — SIN FK a auth.users)
--    Los usuarios existen solo aquí, no como usuarios reales de Supabase Auth.
-- ============================================================================
create table if not exists public.perfiles (
  id uuid primary key default gen_random_uuid(),
  cedula text unique not null,
  nombre text not null,
  email text unique not null,
  role text not null default 'empleado' check (role in ('admin','gerente','empleado')),
  password_hash text not null,  -- PBKDF2-SHA256 hex
  salt text not null,           -- hex
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- RPC functions (SECURITY DEFINER — bypass RLS)
-- ============================================================================

-- fn_login: devuelve usuario por cédula o correo (incluye hash para verificar)
create or replace function public.fn_login(p_login_id text)
returns table (
  id uuid, cedula text, nombre text, email text, role text,
  password_hash text, salt text, active boolean
)
language sql
security definer
set search_path = public
as $$
  select id, cedula, nombre, email, role, password_hash, salt, active
  from public.perfiles
  where cedula = p_login_id or email = p_login_id
  limit 1;
$$;

-- fn_register: crea un nuevo usuario con contraseña hasheada
create or replace function public.fn_register(
  p_cedula text,
  p_nombre text,
  p_email text,
  p_password_hash text,
  p_salt text,
  p_role text default 'empleado'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid := gen_random_uuid();
begin
  insert into public.perfiles (id, cedula, nombre, email, password_hash, salt, role)
  values (new_id, p_cedula, p_nombre, p_email, p_password_hash, p_salt, p_role);
  return new_id;
end;
$$;

-- fn_get_users: lista todos los usuarios (para panel admin)
create or replace function public.fn_get_users()
returns table (
  id uuid, cedula text, nombre text, email text, role text,
  active boolean, created_at timestamptz, updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select id, cedula, nombre, email, role, active, created_at, updated_at
  from public.perfiles
  order by nombre;
$$;

-- fn_update_role: cambia el rol de un usuario
create or replace function public.fn_update_role(p_user_id uuid, p_role text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.perfiles set role = p_role, updated_at = now()
  where id = p_user_id;
$$;

-- fn_update_password: actualiza la contraseña de un usuario
create or replace function public.fn_update_password(
  p_user_id uuid, p_password_hash text, p_salt text
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.perfiles set password_hash = p_password_hash, salt = p_salt, updated_at = now()
  where id = p_user_id;
$$;

-- fn_get_user_by_cedula: busca usuario por cédula (para reset de contraseña)
create or replace function public.fn_get_user_by_cedula(p_cedula text)
returns table (
  id uuid, cedula text, nombre text, email text, role text, active boolean
)
language sql
security definer
set search_path = public
as $$
  select id, cedula, nombre, email, role, active
  from public.perfiles
  where cedula = p_cedula
  limit 1;
$$;

-- Eliminar trigger viejo (ya no se necesita — no usamos auth.users)
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- RLS: perfiles no tiene RLS público — solo se accede via RPC functions
alter table public.perfiles enable row level security;
-- Policy vacía: sin RLS directa, todo via security definer RPC

-- ============================================================================
-- 2. ubicaciones (localidades)
-- ============================================================================
create table if not exists public.ubicaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ubicaciones enable row level security;
create policy "ubicaciones_all" on public.ubicaciones
  for all using (true) with check (true);

-- ============================================================================
-- 3. maquinaria
-- ============================================================================
create table if not exists public.maquinaria (
  id uuid primary key default gen_random_uuid(),
  serial text not null,
  descripcion text,
  modelo text,
  marca text,
  cantidad integer not null default 1,
  horas_uso numeric not null default 0,
  estado text not null default 'operativa'
    check (estado in ('operativa','mantenimiento','critica','fuera_de_servicio')),
  localidad_id uuid references public.ubicaciones(id) on delete set null,
  fecha_entrada date not null default current_date,
  fecha_salida date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.maquinaria enable row level security;
create policy "maquinaria_all" on public.maquinaria
  for all using (true) with check (true);

-- ============================================================================
-- 4. turnos
-- ============================================================================
create table if not exists public.turnos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  usuario_nombre text not null,
  cedula text not null,
  localidad_id uuid references public.ubicaciones(id) on delete set null,
  localidad_nombre text not null,
  maquinaria_id uuid references public.maquinaria(id) on delete set null,
  maquinaria_serial text not null,
  jornada text not null check (jornada in ('regular','extraordinaria')),
  fecha_inicio timestamptz not null,
  fecha_fin timestamptz,
  mineral_type text check (mineral_type in ('grueso','calibrado','comercial')),
  taras_moved integer not null default 0,
  toneladas numeric not null default 0,
  estado text not null default 'activo'
    check (estado in ('activo','completo','incompleto','con_horas_extra')),
  razon_incompleto text,
  duracion_minutos integer,
  duracion_esperada_minutos integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_turnos_usuario on public.turnos(usuario_id);
create index if not exists idx_turnos_estado on public.turnos(estado);
create index if not exists idx_turnos_fecha_inicio on public.turnos(fecha_inicio);

alter table public.turnos enable row level security;
create policy "turnos_all" on public.turnos
  for all using (true) with check (true);

-- ============================================================================
-- 5. entradas (asignación de maquinaria a ubicación)
-- ============================================================================
create table if not exists public.entradas (
  id uuid primary key default gen_random_uuid(),
  maquinaria_id uuid not null references public.maquinaria(id) on delete set null,
  maquinaria_serial text not null,
  localidad_id uuid not null references public.ubicaciones(id) on delete set null,
  localidad_nombre text not null,
  fecha date not null default current_date,
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.entradas enable row level security;
create policy "entradas_all" on public.entradas
  for all using (true) with check (true);

-- ============================================================================
-- 6. salidas
-- ============================================================================
create table if not exists public.salidas (
  id uuid primary key default gen_random_uuid(),
  maquinaria_id uuid references public.maquinaria(id) on delete set null,
  maquinaria_serial text not null,
  razon text not null,
  fecha date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.salidas enable row level security;
create policy "salidas_all" on public.salidas
  for all using (true) with check (true);

-- ============================================================================
-- 7. observaciones (sin fotos, solo texto con categoría maquinaria/empleado)
-- ============================================================================
create table if not exists public.observaciones (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid references public.turnos(id) on delete set null,
  maquinaria_id uuid references public.maquinaria(id) on delete set null,
  maquinaria_serial text,
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  usuario_nombre text not null,
  categoria text not null check (categoria in ('maquinaria','empleado')),
  texto text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_obs_maquinaria on public.observaciones(maquinaria_id);
create index if not exists idx_obs_turno on public.observaciones(turno_id);

alter table public.observaciones enable row level security;
create policy "observaciones_all" on public.observaciones
  for all using (true) with check (true);

-- ============================================================================
-- 8. mantenimiento_programado
-- ============================================================================
create table if not exists public.mantenimiento_programado (
  id uuid primary key default gen_random_uuid(),
  maquinaria_id uuid not null references public.maquinaria(id) on delete cascade,
  maquinaria_serial text not null,
  fecha_programada date not null,
  descripcion text,
  horas_en_mantenimiento numeric not null default 1,
  completado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mant_maquinaria on public.mantenimiento_programado(maquinaria_id);
create index if not exists idx_mant_fecha on public.mantenimiento_programado(fecha_programada);

alter table public.mantenimiento_programado enable row level security;
create policy "mant_all" on public.mantenimiento_programado
  for all using (true) with check (true);

-- ============================================================================
-- 9. registro_de_auditoria
-- ============================================================================
create table if not exists public.registro_de_auditoria (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references public.perfiles(id) on delete set null,
  usuario_nombre text not null,
  accion text not null check (accion in (
    'login','logout','cambio_rol','informe_mantenimiento',
    'editar_horas_maquinaria','eliminar_maquinaria',
    'crear_ubicacion','actualizar_ubicacion','eliminar_ubicacion'
  )),
  detalle text not null,
  entidad_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_usuario on public.registro_de_auditoria(usuario_id);

alter table public.registro_de_auditoria enable row level security;
create policy "audit_all" on public.registro_de_auditoria
  for all using (true) with check (true);

-- ============================================================================
-- 10. revisiones_de_turnos (shift_reviews for incomplete shifts)
-- ============================================================================
create table if not exists public.revisiones_de_turnos (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references public.turnos(id) on delete cascade,
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  usuario_nombre text not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','justificado','rechazado')),
  razon_incompleto text not null,
  nota_admin text,
  revisado_por text,
  revisado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_rev_turno on public.revisiones_de_turnos(turno_id);
create index if not exists idx_rev_estado on public.revisiones_de_turnos(estado);

alter table public.revisiones_de_turnos enable row level security;
create policy "rev_all" on public.revisiones_de_turnos
  for all using (true) with check (true);

-- ============================================================================
-- updated_at triggers
-- ============================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'perfiles','ubicaciones','maquinaria','turnos','entradas','salidas',
    'observaciones','mantenimiento_programado','revisiones_de_turnos'
  ]
  loop
    execute format('drop trigger if exists trg_%s_touch on public.%s;', t, t);
    execute format('create trigger trg_%s_touch before update on public.%s for each row execute function public.touch_updated_at();', t, t);
  end loop;
end$$;

-- ============================================================================
-- Seed: Los admins se crean desde el panel de admin de la app,
-- o manualmente con el script seed_admins.sql
-- ============================================================================
