-- ============================================================
-- 0001_modelo_seguro.sql — Modelo seguro mínimo (pequeño y escalable)
-- ------------------------------------------------------------
-- CÓMO APLICAR: Supabase Dashboard → SQL Editor → New query →
-- pegar TODO este archivo → Run. Debe decir "Success".
-- DESPUÉS: Authentication → Add user (el barbero) → copiar su UID →
-- correr: insert into public.barberos (user_id) values ('UID-AQUÍ');
--
-- Riesgo aceptado y consciente: sin antifraude, alguien puede llenar
-- slots con datos válidos (DoS de negocio). Mitigación demo: tope de
-- 3 activas por teléfono. Pre-venta a escala REQUIERE Turnstile/OTP
-- en una Edge Function antes de crear_reserva.
-- ============================================================

create extension if not exists "pgcrypto";

-- Esta migración crea el modelo desde cero. Nunca borra una agenda existente:
-- si ya hay una tabla reservas, se detiene para evitar pérdida de datos.
do $$
begin
  if to_regclass('public.reservas') is not null then
    raise exception 'MIGRACION_0001_REQUIERE_BASE_LIMPIA';
  end if;
end $$;

-- Quién es barbero: allowlist explícita (no "cualquiera autenticado").
create table if not exists public.barberos (
  user_id uuid primary key references auth.users (id) on delete cascade,
  creado_en timestamptz default now()
);

create table public.reservas (
  -- Identidad propia: la reserva NO es la fecha/hora (punto 4 de la revisión).
  id uuid primary key default gen_random_uuid(),
  slot_fecha date not null,
  slot_hora time not null,
  nombre varchar(60) not null,
  telefono varchar(20) not null,
  estado text not null default 'pendiente',
  -- El cliente genera request_id + cancel_token y conserva ambos.
  -- La base guarda el TOKEN HASHEADO (comparar hash, nunca el token).
  cancel_token_hash text not null,
  request_id uuid not null unique,   -- NOT NULL: sin idempotencia no hay insert
  request_fp text not null,          -- fingerprint del payload (detecta reuso indebido)
  creado_en timestamptz default now(),

  -- Invariantes ESTÁTICOS (baratos, eternos). Lo dinámico va en RPCs.
  constraint nombre_len check (char_length(nombre) between 2 and 60),
  constraint telefono_fmt check (telefono ~ '^09[0-9]{7}$'),
  constraint estado_ok check (estado in ('pendiente','confirmado','atendido','cancelado'))
);

-- La ÚNICA operación que libera el slot es cancelar.
-- Atendido NO libera (si se marca antes de tiempo, nadie puede colarse).
drop index if exists public.reservas_slot_activo;
create unique index reservas_slot_activo
  on public.reservas (slot_fecha, slot_hora)
  where estado <> 'cancelado';

alter table public.reservas enable row level security;
alter table public.barberos enable row level security;
-- A propósito: CERO policies. Sin policy = denegado. Todo pasa por RPC.
revoke all on table public.reservas from anon, authenticated, public;
revoke all on table public.barberos from anon, authenticated, public;

-- ¿El llamante es barbero de verdad? (auth.uid() funciona en SECURITY DEFINER)
create or replace function public.es_barbero()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.barberos where user_id = auth.uid());
$$;
revoke execute on function public.es_barbero() from public;

-- Reglas DINÁMICAS centralizadas (no van en CHECK: cambian con el negocio).
create or replace function public.slot_valido(p_fecha date, p_hora time)
returns void language plpgsql stable set search_path = '' as $$
begin
  if extract(isodow from p_fecha) = 7 then
    raise exception 'DOMINGO_CERRADO';
  end if;
  if (p_fecha + p_hora) <= (now() at time zone 'America/Montevideo')::timestamp then
    raise exception 'FECHA_PASADA';
  end if;
  if p_hora not in ('08:00','09:00','10:00','11:00','12:00','13:00',
                    '14:00','15:00','16:00','17:00') then
    raise exception 'SLOT_NO_HABILITADO';
  end if;
  if p_fecha > current_date + 65 then
    raise exception 'FUERA_DE_VENTANA';
  end if;
end $$;
revoke execute on function public.slot_valido(date, time) from public;

-- PÚBLICO: disponibilidad sin PII. La tabla con teléfonos no existe para anon.
create or replace function public.obtener_disponibilidad(dia date)
returns table (hora text, ocupado boolean)
language plpgsql stable security definer set search_path = '' as $$
declare h time;
begin
  if extract(isodow from dia) = 7 then
    raise exception 'DOMINGO_CERRADO';
  end if;
  for h in select unnest(array['08:00','09:00','10:00','11:00','12:00','13:00',
                               '14:00','15:00','16:00','17:00']::time[]) loop
    hora := to_char(h, 'HH24:MI');
    select exists (
      select 1 from public.reservas r
      where r.slot_fecha = dia and r.slot_hora = h and r.estado <> 'cancelado'
    ) into ocupado;
    return next;
  end loop;
end $$;
revoke execute on function public.obtener_disponibilidad(date) from public;
grant execute on function public.obtener_disponibilidad(date) to anon, authenticated;

-- PÚBLICO: crear. Idempotente; distingue QUÉ constraint falló (punto 5).
-- DTO explícito: nunca se devuelve la fila entera (punto 4).
create or replace function public.crear_reserva(
  p_fecha date, p_hora time, p_nombre varchar, p_telefono varchar,
  p_request_id uuid, p_cancel_token uuid
) returns table (o_id uuid, o_fecha date, o_hora time, o_estado text)
language plpgsql security definer set search_path = '' as $$
declare
  v_fp text := md5(p_fecha::text || '|' || p_hora::text || '|' || p_nombre || '|' || p_telefono);
  v_e public.reservas%rowtype;
  v_c text;
begin
  perform public.slot_valido(p_fecha, p_hora);
  if p_nombre is null or char_length(p_nombre) not between 2 and 60
     or p_telefono !~ '^09[0-9]{7}$' then
    raise exception 'PAYLOAD_INVALIDO';
  end if;
  if (select count(*) from public.reservas r
      where r.telefono = p_telefono and r.estado <> 'cancelado') >= 3 then
    raise exception 'TOPE_POR_TELEFONO';
  end if;

  select * into v_e from public.reservas r where r.request_id = p_request_id;
  if found then
    if v_e.request_fp <> v_fp then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;
    o_id := v_e.id; o_fecha := v_e.slot_fecha;
    o_hora := v_e.slot_hora; o_estado := v_e.estado;
    return next; return;
  end if;

  begin
    insert into public.reservas
      (slot_fecha, slot_hora, nombre, telefono, estado,
       cancel_token_hash, request_id, request_fp)
    values (p_fecha, p_hora, p_nombre, p_telefono, 'pendiente',
            encode(extensions.digest(p_cancel_token::text, 'sha256'), 'hex'),
            p_request_id, v_fp)
    returning id, slot_fecha, slot_hora, estado
      into o_id, o_fecha, o_hora, o_estado;
    return next;
  exception when unique_violation then
    get stacked diagnostics v_c = constraint_name;
    if v_c = 'reservas_request_id_key' then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;
    raise exception 'SLOT_OCUPADO';
  end;
end $$;
revoke execute on function public.crear_reserva(date,time,varchar,varchar,uuid,uuid) from public;
grant execute on function public.crear_reserva(date,time,varchar,varchar,uuid,uuid) to anon, authenticated;

-- PÚBLICO con prueba de propiedad: solo con el token (nunca en query string).
create or replace function public.cancelar_con_token(p_id uuid, p_token uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.reservas r set estado = 'cancelado'
  where r.id = p_id
    and r.cancel_token_hash = encode(extensions.digest(p_token::text, 'sha256'), 'hex')
    and r.estado in ('pendiente','confirmado');
  if not found then
    raise exception 'TOKEN_INVALIDO_O_ESTADO_FINAL';
  end if;
end $$;
revoke execute on function public.cancelar_con_token(uuid,uuid) from public;
grant execute on function public.cancelar_con_token(uuid,uuid) to anon, authenticated;

-- Cambio atómico propio: UNA sola RPC. Sin COMMIT explícito: cualquier
-- excepción revierte TODO (el turno original queda intacto).
-- No aplica tope por teléfono: el neto de activas no cambia.
create or replace function public.cambiar_con_token(
  p_id uuid, p_token uuid, p_nueva_fecha date, p_nueva_hora time,
  p_request_id uuid, p_new_cancel_token uuid
) returns table (o_id uuid, o_fecha date, o_hora time, o_estado text)
language plpgsql security definer set search_path = '' as $$
declare
  v_orig public.reservas%rowtype;
  v_fp text;
  v_c text;
begin
  select * into v_orig from public.reservas r where r.id = p_id for update;
  if not found then
    raise exception 'RESERVA_INEXISTENTE';
  end if;
  if v_orig.cancel_token_hash <> encode(extensions.digest(p_token::text, 'sha256'), 'hex') then
    raise exception 'TOKEN_INVALIDO_O_ESTADO_FINAL';
  end if;
  if v_orig.estado not in ('pendiente','confirmado') then
    raise exception 'TOKEN_INVALIDO_O_ESTADO_FINAL';
  end if;
  perform public.slot_valido(p_nueva_fecha, p_nueva_hora);
  if p_nueva_fecha = v_orig.slot_fecha and p_nueva_hora = v_orig.slot_hora then
    raise exception 'SLOT_IGUAL';
  end if;

  v_fp := md5(p_nueva_fecha::text || '|' || p_nueva_hora::text || '|'
              || v_orig.nombre || '|' || v_orig.telefono);
  begin
    insert into public.reservas
      (slot_fecha, slot_hora, nombre, telefono, estado,
       cancel_token_hash, request_id, request_fp)
    values (p_nueva_fecha, p_nueva_hora, v_orig.nombre, v_orig.telefono, 'pendiente',
            encode(extensions.digest(p_new_cancel_token::text, 'sha256'), 'hex'),
            p_request_id, v_fp)
    returning id, slot_fecha, slot_hora, estado
      into o_id, o_fecha, o_hora, o_estado;
  exception when unique_violation then
    get stacked diagnostics v_c = constraint_name;
    if v_c = 'reservas_request_id_key' then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;
    raise exception 'SLOT_OCUPADO';
  end;

  update public.reservas r set estado = 'cancelado' where r.id = p_id;
  return next;
end $$;
revoke execute on function public.cambiar_con_token(uuid,uuid,date,time,uuid,uuid) from public;
grant execute on function public.cambiar_con_token(uuid,uuid,date,time,uuid,uuid) to anon, authenticated;

-- BARBERO: lectura con PII (verifica identidad real, no solo rol).
create or replace function public.admin_listar_rango(d1 date, d2 date)
returns table (o_id uuid, o_fecha date, o_hora time, o_nombre varchar,
               o_telefono varchar, o_estado text, o_creado timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.es_barbero() then
    raise exception 'SOLO_BARBERO';
  end if;
  return query
    select r.id, r.slot_fecha, r.slot_hora, r.nombre, r.telefono,
           r.estado, r.creado_en
    from public.reservas r
    where r.slot_fecha between d1 and d2
    order by r.slot_fecha, r.slot_hora;
end $$;
revoke execute on function public.admin_listar_rango(date,date) from public;
grant execute on function public.admin_listar_rango(date,date) to authenticated;

-- BARBERO: máquina de estados explícita (punto 8). Sin transiciones absurdas.
create or replace function public.admin_cambiar_estado(p_id uuid, p_nuevo text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actual text;
begin
  if not public.es_barbero() then
    raise exception 'SOLO_BARBERO';
  end if;
  select r.estado into v_actual from public.reservas r where r.id = p_id;
  if not found then
    raise exception 'RESERVA_INEXISTENTE';
  end if;
  if not ((v_actual = 'pendiente'  and p_nuevo in ('confirmado','cancelado')) or
          (v_actual = 'confirmado' and p_nuevo in ('atendido','cancelado'))) then
    raise exception 'TRANSICION_INVALIDA';
  end if;
  update public.reservas r set estado = p_nuevo where r.id = p_id;
end $$;
revoke execute on function public.admin_cambiar_estado(uuid,text) from public;
grant execute on function public.admin_cambiar_estado(uuid,text) to authenticated;
