-- ============================================================
-- 0002_apellido_obligatorio.sql — Nombre y apellido obligatorios
-- ------------------------------------------------------------
-- CÓMO APLICAR (en orden):
-- PASO 1: correr solo esta consulta para ver filas viejas de una
-- palabra (creadas antes de esta regla). Si sale vacía, seguir.
--   select id, nombre, telefono from public.reservas
--   where nombre !~ '[^[:space:]]+[[:space:]]+[^[:space:]]+';
-- Si hay filas: pedir el apellido al cliente o cancelarlas desde
-- el dashboard. Recién después correr el PASO 2.
--
-- PASO 2: correr TODO este archivo en SQL Editor → Run.
-- Agrega un CHECK (formato estático: dos palabras mínimo) y
-- endurece crear_reserva con la misma regla (defensa en profundidad).
-- Las reglas dinámicas siguen en las RPC, como siempre.
-- ============================================================

-- PASO 2a: invariante estático a nivel tabla (dos o más palabras).
alter table public.reservas
  add constraint nombre_apellido
  check (nombre ~ '[^[:space:]]+[[:space:]]+[^[:space:]]+');

-- PASO 2b: misma regla en crear_reserva (error amable PAYLOAD_INVALIDO
-- antes de que la base rechace con check_violation).
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
     or p_nombre !~ '\S+\s+\S+'
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
            encode(digest(p_cancel_token::text, 'sha256'), 'hex'),
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
