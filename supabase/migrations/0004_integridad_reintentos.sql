-- ============================================================
-- 0004_integridad_reintentos.sql — endurecimiento de producción
-- ------------------------------------------------------------
-- Aplicar DESPUÉS de 0001, 0002 y 0003.
-- Corrige:
--   * reintentos de crear/cambiar después de perder una respuesta;
--   * carreras que permitían superar el tope por teléfono;
--   * reservas locales obsoletas tras una cancelación del barbero;
--   * validación de nombres distinta entre navegador y base;
--   * ventana de fechas calculada fuera de la zona de Uruguay.
-- Todo el archivo corre en una transacción: ante un error no queda a medias.
-- ============================================================

begin;

-- Permite demostrar que una reserva nueva reemplaza exactamente a otra.
alter table public.reservas
  add column if not exists reprogramada_desde uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reservas_reprogramada_desde_fkey'
      and conrelid = 'public.reservas'::regclass
  ) then
    alter table public.reservas
      add constraint reservas_reprogramada_desde_fkey
      foreign key (reprogramada_desde) references public.reservas (id);
  end if;
end $$;

create unique index if not exists reservas_reprogramacion_unica
  on public.reservas (reprogramada_desde)
  where reprogramada_desde is not null;

-- La base aplica el mismo formato que la interfaz: letras, apóstrofe/guion,
-- espacios simples y al menos dos palabras. Si existen filas antiguas que no
-- cumplen, la transacción se detiene para que se corrijan antes de reintentar.
alter table public.reservas drop constraint if exists nombre_apellido;
alter table public.reservas drop constraint if exists nombre_persona_formato;
alter table public.reservas
  add constraint nombre_persona_formato check (
    nombre = btrim(nombre)
    and nombre ~ $nombre$^[[:alpha:]][[:alpha:]'-]*([ ][[:alpha:]][[:alpha:]'-]*)+$nombre$
  );

create or replace function public.slot_valido(p_fecha date, p_hora time)
returns void language plpgsql stable set search_path = '' as $$
declare
  v_ahora timestamp := now() at time zone 'America/Montevideo';
  v_hoy date := (now() at time zone 'America/Montevideo')::date;
begin
  if p_fecha is null or p_hora is null then
    raise exception 'PAYLOAD_INVALIDO';
  end if;
  if extract(isodow from p_fecha) = 7 then
    raise exception 'DOMINGO_CERRADO';
  end if;
  if (p_fecha + p_hora) <= v_ahora then
    raise exception 'FECHA_PASADA';
  end if;
  if p_hora not in ('08:00','09:00','10:00','11:00','12:00','13:00',
                    '14:00','15:00','16:00','17:00') then
    raise exception 'SLOT_NO_HABILITADO';
  end if;
  if p_fecha > v_hoy + 65 then
    raise exception 'FUERA_DE_VENTANA';
  end if;
end $$;
revoke execute on function public.slot_valido(date, time) from public;

create or replace function public.obtener_disponibilidad(dia date)
returns table (hora text, ocupado boolean)
language plpgsql stable security definer set search_path = '' as $$
declare h time;
begin
  if dia is null then
    raise exception 'PAYLOAD_INVALIDO';
  end if;
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

-- Crear es idempotente de verdad: request_id Y token deben repetirse juntos.
-- El advisory lock serializa el conteo por teléfono y cierra la carrera del tope.
create or replace function public.crear_reserva(
  p_fecha date, p_hora time, p_nombre varchar, p_telefono varchar,
  p_request_id uuid, p_cancel_token uuid
) returns table (o_id uuid, o_fecha date, o_hora time, o_estado text)
language plpgsql security definer set search_path = '' as $$
declare
  v_nombre varchar(60);
  v_fp text;
  v_e public.reservas%rowtype;
  v_c text;
  v_token_hash text;
begin
  if p_request_id is null or p_cancel_token is null or p_nombre is null
     or p_telefono is null then
    raise exception 'PAYLOAD_INVALIDO';
  end if;

  v_nombre := regexp_replace(btrim(p_nombre), ' +', ' ', 'g');
  if char_length(v_nombre) not between 2 and 60
     or v_nombre !~ $nombre$^[[:alpha:]][[:alpha:]'-]*([ ][[:alpha:]][[:alpha:]'-]*)+$nombre$
     or p_telefono !~ '^09[0-9]{7}$' then
    raise exception 'PAYLOAD_INVALIDO';
  end if;

  v_fp := md5(p_fecha::text || '|' || p_hora::text || '|' || v_nombre || '|' || p_telefono);
  v_token_hash := encode(extensions.digest(p_cancel_token::text, 'sha256'), 'hex');

  -- Se consulta antes de reglas dependientes del tiempo/tope: un reintento debe
  -- devolver el resultado original aunque el slot ya haya pasado o el tope cambie.
  select * into v_e from public.reservas r where r.request_id = p_request_id;
  if found then
    if v_e.request_fp <> v_fp or v_e.cancel_token_hash <> v_token_hash
       or v_e.reprogramada_desde is not null then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;
    o_id := v_e.id; o_fecha := v_e.slot_fecha;
    o_hora := v_e.slot_hora; o_estado := v_e.estado;
    return next; return;
  end if;

  perform public.slot_valido(p_fecha, p_hora);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_telefono, 0));
  if (select count(*) from public.reservas r
      where r.telefono = p_telefono and r.estado <> 'cancelado') >= 3 then
    raise exception 'TOPE_POR_TELEFONO';
  end if;

  begin
    insert into public.reservas
      (slot_fecha, slot_hora, nombre, telefono, estado,
       cancel_token_hash, request_id, request_fp)
    values (p_fecha, p_hora, v_nombre, p_telefono, 'pendiente',
            v_token_hash, p_request_id, v_fp)
    returning id, slot_fecha, slot_hora, estado
      into o_id, o_fecha, o_hora, o_estado;
    return next;
  exception when unique_violation then
    get stacked diagnostics v_c = constraint_name;
    if v_c = 'reservas_request_id_key' then
      select * into v_e from public.reservas r where r.request_id = p_request_id;
      if found and v_e.request_fp = v_fp and v_e.cancel_token_hash = v_token_hash
         and v_e.reprogramada_desde is null then
        o_id := v_e.id; o_fecha := v_e.slot_fecha;
        o_hora := v_e.slot_hora; o_estado := v_e.estado;
        return next; return;
      end if;
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;
    raise exception 'SLOT_OCUPADO';
  end;
end $$;
revoke execute on function public.crear_reserva(date,time,varchar,varchar,uuid,uuid) from public;
grant execute on function public.crear_reserva(date,time,varchar,varchar,uuid,uuid) to anon, authenticated;

-- Un reintento de cambio encuentra la reserva nueva por request_id, incluso si
-- la anterior ya quedó cancelada. El vínculo evita confundir crear con cambiar.
create or replace function public.cambiar_con_token(
  p_id uuid, p_token uuid, p_nueva_fecha date, p_nueva_hora time,
  p_request_id uuid, p_new_cancel_token uuid
) returns table (o_id uuid, o_fecha date, o_hora time, o_estado text)
language plpgsql security definer set search_path = '' as $$
declare
  v_orig public.reservas%rowtype;
  v_e public.reservas%rowtype;
  v_fp text;
  v_c text;
  v_new_token_hash text;
begin
  if p_id is null or p_token is null or p_nueva_fecha is null
     or p_nueva_hora is null or p_request_id is null
     or p_new_cancel_token is null then
    raise exception 'PAYLOAD_INVALIDO';
  end if;
  v_new_token_hash := encode(extensions.digest(p_new_cancel_token::text, 'sha256'), 'hex');

  -- Camino rápido para el reintento posterior a una respuesta perdida.
  select * into v_e from public.reservas r where r.request_id = p_request_id;
  if found then
    if v_e.reprogramada_desde is distinct from p_id
       or v_e.slot_fecha is distinct from p_nueva_fecha
       or v_e.slot_hora is distinct from p_nueva_hora
       or v_e.cancel_token_hash <> v_new_token_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;
    o_id := v_e.id; o_fecha := v_e.slot_fecha;
    o_hora := v_e.slot_hora; o_estado := v_e.estado;
    return next; return;
  end if;

  select * into v_orig from public.reservas r where r.id = p_id for update;
  if not found then
    raise exception 'RESERVA_INEXISTENTE';
  end if;
  if v_orig.cancel_token_hash <> encode(extensions.digest(p_token::text, 'sha256'), 'hex') then
    raise exception 'TOKEN_INVALIDO_O_ESTADO_FINAL';
  end if;

  -- Revisión bajo el lock: cubre dos solicitudes simultáneas con el mismo id.
  select * into v_e from public.reservas r where r.request_id = p_request_id;
  if found then
    if v_e.reprogramada_desde is distinct from p_id
       or v_e.slot_fecha is distinct from p_nueva_fecha
       or v_e.slot_hora is distinct from p_nueva_hora
       or v_e.cancel_token_hash <> v_new_token_hash then
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;
    o_id := v_e.id; o_fecha := v_e.slot_fecha;
    o_hora := v_e.slot_hora; o_estado := v_e.estado;
    return next; return;
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
      (slot_fecha, slot_hora, nombre, telefono, estado, cancel_token_hash,
       request_id, request_fp, reprogramada_desde)
    values (p_nueva_fecha, p_nueva_hora, v_orig.nombre, v_orig.telefono,
            'pendiente', v_new_token_hash, p_request_id, v_fp, p_id)
    returning id, slot_fecha, slot_hora, estado
      into o_id, o_fecha, o_hora, o_estado;
  exception when unique_violation then
    get stacked diagnostics v_c = constraint_name;
    if v_c = 'reservas_request_id_key' then
      select * into v_e from public.reservas r where r.request_id = p_request_id;
      if found and v_e.reprogramada_desde = p_id
         and v_e.slot_fecha = p_nueva_fecha and v_e.slot_hora = p_nueva_hora
         and v_e.cancel_token_hash = v_new_token_hash then
        o_id := v_e.id; o_fecha := v_e.slot_fecha;
        o_hora := v_e.slot_hora; o_estado := v_e.estado;
        return next; return;
      end if;
      raise exception 'IDEMPOTENCY_KEY_REUSED';
    end if;
    raise exception 'SLOT_OCUPADO';
  end;

  update public.reservas r set estado = 'cancelado' where r.id = p_id;
  return next;
end $$;
revoke execute on function public.cambiar_con_token(uuid,uuid,date,time,uuid,uuid) from public;
grant execute on function public.cambiar_con_token(uuid,uuid,date,time,uuid,uuid) to anon, authenticated;

-- Consulta privada del propio turno. No expone nombre ni teléfono y exige token.
create or replace function public.obtener_reserva_con_token(p_id uuid, p_token uuid)
returns table (o_id uuid, o_fecha date, o_hora text, o_estado text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_id is null or p_token is null then
    raise exception 'TOKEN_INVALIDO';
  end if;
  return query
    select r.id, r.slot_fecha, to_char(r.slot_hora, 'HH24:MI'), r.estado
    from public.reservas r
    where r.id = p_id
      and r.cancel_token_hash = encode(extensions.digest(p_token::text, 'sha256'), 'hex');
  if not found then
    raise exception 'TOKEN_INVALIDO';
  end if;
end $$;
revoke execute on function public.obtener_reserva_con_token(uuid,uuid) from public;
grant execute on function public.obtener_reserva_con_token(uuid,uuid) to anon, authenticated;

commit;
