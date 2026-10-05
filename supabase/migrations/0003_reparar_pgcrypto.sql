-- ============================================================
-- 0003_reparar_pgcrypto.sql — hotfix para Supabase alojado
-- ------------------------------------------------------------
-- Síntoma en GitHub Pages:
--   POST /rpc/crear_reserva -> 404 / PostgreSQL 42883
--   "function digest(text, unknown) does not exist"
--
-- pgcrypto vive en el esquema `extensions` de Supabase. Las funciones de
-- 0001/0002 tienen search_path vacío por seguridad, por lo que una llamada no
-- calificada a digest() no se encuentra. Este hotfix restaura reservas,
-- cancelaciones y cambios sin relajar el acceso a `public`.
-- ============================================================

begin;

alter function public.crear_reserva(date,time,varchar,varchar,uuid,uuid)
  set search_path = pg_catalog, extensions;

alter function public.cancelar_con_token(uuid,uuid)
  set search_path = pg_catalog, extensions;

alter function public.cambiar_con_token(uuid,uuid,date,time,uuid,uuid)
  set search_path = pg_catalog, extensions;

commit;
