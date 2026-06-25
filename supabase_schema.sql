-- ============================================================================
-- Control de Maquinaria Pesada · Supabase Schema
-- Run this in the Supabase SQL editor.
-- ============================================================================

-- Extensions
create extension if not exists "pgcrypto";

-- ============================================================================
-- Helper SECURITY DEFINER functions (avoid RLS recursion on perfiles)
-- ============================================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.perfiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

create or replace function public.is_admin_or_gerente()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.perfiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'gerente')
  );
$$;

-- ============================================================================
-- 1. perfiles (linked to auth.users)
-- ============================================================================
create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  cedula text unique not null,
  nombre text not null,
  email text unique not null,
  role text not null default 'empleado' check (role in ('admin','gerente','empleado')),
  password_hash text,         -- PBKDF2-SHA256 hex (offline fallback)
  salt text,                  -- hex
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.perfiles enable row level security;

-- Everyone can read their own profile; admins/gerentes can read all
create policy "perfiles_self_read" on public.perfiles
  for select using (id = auth.uid() or public.is_admin_or_gerente());

create policy "perfiles_admin_write" on public.perfiles
  for all using (public.is_admin()) with check (public.is_admin());

-- Trigger: handle_new_user() — creates a profile when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, cedula, nombre, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'cedula', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'empleado')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

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
create policy "ubicaciones_read" on public.ubicaciones
  for select using (public.is_admin_or_gerente() or true);
create policy "ubicaciones_admin_write" on public.ubicaciones
  for all using (public.is_admin()) with check (public.is_admin());

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
create policy "maquinaria_read" on public.maquinaria
  for select using (true);
create policy "maquinaria_admin_gerente_write" on public.maquinaria
  for all using (public.is_admin_or_gerente()) with check (public.is_admin_or_gerente());

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
-- Empleados see and write their own turnos; admins/gerentes see all
create policy "turnos_self_read" on public.turnos
  for select using (usuario_id = auth.uid() or public.is_admin_or_gerente());
create policy "turnos_self_insert" on public.turnos
  for insert with check (usuario_id = auth.uid() or public.is_admin_or_gerente());
create policy "turnos_self_update" on public.turnos
  for update using (usuario_id = auth.uid() or public.is_admin_or_gerente());

-- ============================================================================
-- 5. entradas
-- ============================================================================
create table if not exists public.entradas (
  id uuid primary key default gen_random_uuid(),
  razon text not null,
  serial text not null,
  descripcion text,
  modelo text,
  marca text,
  cantidad integer not null default 1,
  fecha date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.entradas enable row level security;
create policy "entradas_read" on public.entradas for select using (true);
create policy "entradas_admin_gerente_write" on public.entradas
  for all using (public.is_admin_or_gerente()) with check (public.is_admin_or_gerente());

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
create policy "salidas_read" on public.salidas for select using (true);
create policy "salidas_admin_gerente_write" on public.salidas
  for all using (public.is_admin_or_gerente()) with check (public.is_admin_or_gerente());

-- ============================================================================
-- 7. observaciones
-- ============================================================================
create table if not exists public.observaciones (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid references public.turnos(id) on delete set null,
  maquinaria_id uuid references public.maquinaria(id) on delete set null,
  maquinaria_serial text,
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  usuario_nombre text not null,
  categoria text not null check (categoria in ('mecanica','electrica','hidraulica','neumatica','estructura','otra')),
  texto text not null,
  fotos jsonb not null default '[]'::jsonb,  -- array of base64 JPEG
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_obs_maquinaria on public.observaciones(maquinaria_id);
create index if not exists idx_obs_turno on public.observaciones(turno_id);

alter table public.observaciones enable row level security;
create policy "observaciones_read" on public.observaciones
  for select using (true);
create policy "observaciones_self_insert" on public.observaciones
  for insert with check (usuario_id = auth.uid());
create policy "observaciones_self_update" on public.observaciones
  for update using (usuario_id = auth.uid() or public.is_admin_or_gerente());

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
create policy "mant_read" on public.mantenimiento_programado for select using (true);
create policy "mant_admin_gerente_write" on public.mantenimiento_programado
  for all using (public.is_admin_or_gerente()) with check (public.is_admin_or_gerente());

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
create policy "audit_read" on public.registro_de_auditoria
  for select using (public.is_admin());
create policy "audit_insert" on public.registro_de_auditoria
  for insert with check (true);

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
create policy "rev_self_read" on public.revisiones_de_turnos
  for select using (usuario_id = auth.uid() or public.is_admin_or_gerente());
create policy "rev_self_insert" on public.revisiones_de_turnos
  for insert with check (usuario_id = auth.uid());
create policy "rev_admin_update" on public.revisiones_de_turnos
  for update using (public.is_admin());

-- ============================================================================
-- updated_at triggers
-- ============================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

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
-- Seed admin profiles (run after creating auth.users via Supabase dashboard
-- or by signing them up through the auth API).
-- ============================================================================
insert into public.perfiles (id, cedula, nombre, email, role)
select auth.uid(), 'admin-deya', 'Deya', 'deya@maquinaria.local', 'admin'
where auth.uid() is not null
on conflict (email) do nothing;

-- NOTE: to create the admin auth users, use the Supabase dashboard Auth tab
-- or run this from a server-side script:
--   supabase.auth.admin.createUser({ email: 'deya@maquinaria.local', password: 'admin123', email_confirm: true })
--   supabase.auth.admin.createUser({ email: 'jhonatan@maquinaria.local', password: 'admin123', email_confirm: true })
