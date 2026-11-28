-- Aislamiento multi-tenant, privilegios mínimos y endurecimiento de Auth.
-- Escrita contra el esquema en vivo del 27-nov-2026. No modifica datos de negocio.

-- 0. Sobrecarga antigua sin aislamiento (no existe en producción; se deja por reproducibilidad).
DROP FUNCTION IF EXISTS public.upsert_inventario_tx(
  uuid, text, text, text, uuid, date, integer, integer, integer,
  numeric, numeric, numeric, numeric, numeric, numeric,
  text, text, text, text, integer, uuid
);

-- 1. Helpers de RLS: solo usuarios activos obtienen droguería y rol.
CREATE OR REPLACE FUNCTION public.get_current_drogueria_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.drogueria_id
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.status = 'activo'
$$;

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.role
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.status = 'activo'
$$;

-- 2. Trigger de Auth: nunca confía en el rol enviado en metadata.
-- Los usuarios internos se crean desde Server Actions con service_role,
-- que luego fijan rol y estado definitivos en profiles.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_raw_tenant text := NEW.raw_user_meta_data->>'drogueria_id';
  v_tenant uuid;
  v_username text;
BEGIN
  IF v_raw_tenant ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    SELECT d.id INTO v_tenant FROM public.droguerias d WHERE d.id = v_raw_tenant::uuid;
  END IF;

  -- Sin droguería válida no se crea perfil: la cuenta no puede entrar a la app.
  IF v_tenant IS NULL THEN
    RETURN NEW;
  END IF;

  v_username := COALESCE(
    NULLIF(trim(NEW.raw_user_meta_data->>'username'), ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    'usuario_' || left(NEW.id::text, 8)
  );

  INSERT INTO public.profiles (id, username, full_name, role, status, drogueria_id)
  VALUES (
    NEW.id,
    v_username,
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'full_name'), ''), 'Usuario Nuevo'),
    'vendedor',
    'inactivo',
    v_tenant
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 3. Límite de usuarios activos por plan, atómico en la base.
CREATE OR REPLACE FUNCTION public.enforce_tenant_user_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer;
  v_active integer;
BEGIN
  IF NEW.drogueria_id IS NULL OR NEW.status IS DISTINCT FROM 'activo' OR NEW.role = 'superadmin' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.drogueria_id IS NOT DISTINCT FROM NEW.drogueria_id
     AND OLD.status = 'activo' THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.drogueria_id::text, 0));

  SELECT d.max_usuarios INTO v_limit FROM public.droguerias d WHERE d.id = NEW.drogueria_id;
  IF v_limit IS NULL THEN
    RAISE EXCEPTION 'Droguería no encontrada';
  END IF;

  SELECT count(*) INTO v_active
  FROM public.profiles p
  WHERE p.drogueria_id = NEW.drogueria_id
    AND p.status = 'activo'
    AND p.role <> 'superadmin'
    AND p.id <> NEW.id;

  IF v_active >= v_limit THEN
    RAISE EXCEPTION 'Se alcanzó el límite de % usuarios activos del plan', v_limit;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_tenant_user_limit_trigger ON public.profiles;
CREATE TRIGGER enforce_tenant_user_limit_trigger
BEFORE INSERT OR UPDATE OF status, drogueria_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_user_limit();

-- 4. Reemplazar todas las políticas. Las políticas permisivas se combinan con OR,
-- por eso no basta con agregar políticas nuevas: hay que eliminar las anteriores.
DO $$
DECLARE
  v_table text;
  v_policy record;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'profiles', 'droguerias', 'caja_sesiones', 'facturas', 'factura_detalles',
    'factura_abonos', 'api_keys', 'productos', 'inventario', 'inventario_lotes',
    'laboratorios', 'clientes', 'proveedores', 'compras', 'compra_detalles',
    'gastos', 'cronogramas', 'auditoria_inventario', 'logs_actividad'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    FOR v_policy IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = v_table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_policy.policyname, v_table);
    END LOOP;
  END LOOP;
END $$;

-- Perfiles: lectura propia y de la sede. Las escrituras pasan por Server Actions
-- con service_role después de validar rol y droguería.
CREATE POLICY profiles_select_tenant ON public.profiles
FOR SELECT TO authenticated
USING (
  id = (SELECT auth.uid())
  OR drogueria_id = (SELECT public.get_current_drogueria_id())
);

-- Droguerías: cada usuario solo ve la suya. La consola superadmin usa service_role.
CREATE POLICY droguerias_select_current ON public.droguerias
FOR SELECT TO authenticated
USING (id = (SELECT public.get_current_drogueria_id()));

-- Caja: lectura y apertura en la propia sede. El cierre solo pasa por cerrar_caja_tx.
CREATE POLICY caja_select_tenant ON public.caja_sesiones
FOR SELECT TO authenticated
USING (drogueria_id = (SELECT public.get_current_drogueria_id()));

CREATE POLICY caja_insert_tenant ON public.caja_sesiones
FOR INSERT TO authenticated
WITH CHECK (
  drogueria_id = (SELECT public.get_current_drogueria_id())
  AND abierto_por = (SELECT auth.uid())
);

-- Documentos de venta: solo lectura. Se escriben únicamente con las RPC atómicas.
CREATE POLICY facturas_select_tenant ON public.facturas
FOR SELECT TO authenticated
USING (drogueria_id = (SELECT public.get_current_drogueria_id()));

CREATE POLICY factura_detalles_select_tenant ON public.factura_detalles
FOR SELECT TO authenticated
USING (drogueria_id = (SELECT public.get_current_drogueria_id()));

CREATE POLICY factura_abonos_select_tenant ON public.factura_abonos
FOR SELECT TO authenticated
USING (drogueria_id = (SELECT public.get_current_drogueria_id()));

-- api_keys: sin políticas para authenticated; solo service_role (consola superadmin y API v1).

-- Catálogo, inventario y tesorería: lectura para la sede, escritura solo para administradores.
DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'productos', 'inventario', 'inventario_lotes', 'laboratorios',
    'proveedores', 'compras', 'compra_detalles', 'gastos', 'cronogramas'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
         USING (drogueria_id = (SELECT public.get_current_drogueria_id()))',
      v_table || '_select_tenant', v_table
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
         USING (drogueria_id = (SELECT public.get_current_drogueria_id())
                AND (SELECT public.get_current_user_role()) IN (''admin'', ''superadmin''))
         WITH CHECK (drogueria_id = (SELECT public.get_current_drogueria_id())
                AND (SELECT public.get_current_user_role()) IN (''admin'', ''superadmin''))',
      v_table || '_admin_mutate', v_table
    );
  END LOOP;
END $$;

-- Clientes: el POS permite alta rápida a cualquier usuario activo de la sede.
CREATE POLICY clientes_select_tenant ON public.clientes
FOR SELECT TO authenticated
USING (drogueria_id = (SELECT public.get_current_drogueria_id()));

CREATE POLICY clientes_insert_tenant ON public.clientes
FOR INSERT TO authenticated
WITH CHECK (drogueria_id = (SELECT public.get_current_drogueria_id()));

CREATE POLICY clientes_update_tenant ON public.clientes
FOR UPDATE TO authenticated
USING (drogueria_id = (SELECT public.get_current_drogueria_id()))
WITH CHECK (drogueria_id = (SELECT public.get_current_drogueria_id()));

-- Auditoría y bitácora: se pueden leer e insertar en la sede; nunca editar ni borrar.
CREATE POLICY auditoria_select_tenant ON public.auditoria_inventario
FOR SELECT TO authenticated
USING (drogueria_id = (SELECT public.get_current_drogueria_id()));

CREATE POLICY auditoria_insert_tenant ON public.auditoria_inventario
FOR INSERT TO authenticated
WITH CHECK (drogueria_id = (SELECT public.get_current_drogueria_id()));

CREATE POLICY logs_select_tenant ON public.logs_actividad
FOR SELECT TO authenticated
USING (drogueria_id = (SELECT public.get_current_drogueria_id()));

CREATE POLICY logs_insert_tenant ON public.logs_actividad
FOR INSERT TO authenticated
WITH CHECK (
  drogueria_id = (SELECT public.get_current_drogueria_id())
  AND usuario_id = (SELECT auth.uid())
);

-- 5. Privilegios de tabla mínimos (defensa en profundidad además de RLS).
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.droguerias FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.facturas, public.factura_detalles, public.factura_abonos FROM authenticated;
REVOKE UPDATE, DELETE ON public.caja_sesiones FROM authenticated;
REVOKE UPDATE, DELETE ON public.auditoria_inventario, public.logs_actividad FROM authenticated;
REVOKE DELETE ON public.clientes FROM authenticated;
REVOKE ALL ON public.api_keys FROM authenticated;

-- La app no usa acceso anónimo a tablas; solo la RPC pública de resolución de sede.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- 6. Funciones: nadie anónimo ejecuta RPC salvo la resolución pública de sede.
-- (Las funciones nuevas creadas por postgres en public siguen recibiendo EXECUTE para
-- PUBLIC por defecto de PostgreSQL; cada migración debe revocarlo explícitamente.)
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;

GRANT EXECUTE ON FUNCTION public.get_current_drogueria_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE ALL ON FUNCTION public.enforce_tenant_user_limit() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_tenant_user_limit() TO service_role;

-- sync_inventario_from_lotes: la app desplegada todavía la usa a través de
-- upsert_inventario_tx (SECURITY INVOKER). Se retira a authenticated en
-- 20261127000003, cuando la app ya usa solo las RPC V2.
GRANT EXECUTE ON FUNCTION public.sync_inventario_from_lotes(uuid) TO service_role;

-- Transición: la versión desplegada de la app todavía llama upsert_inventario_tx
-- directamente (solo tenía permiso vía PUBLIC). Se mantiene para authenticated
-- (es SECURITY INVOKER y RLS ya limita la escritura a administradores de la sede)
-- y se retira en 20261127000003 cuando la app use upsert_inventario_v2_tx.
GRANT EXECUTE ON FUNCTION public.upsert_inventario_tx(
  uuid, text, text, text, uuid, uuid, integer, integer, integer, integer,
  numeric, numeric, numeric, numeric, numeric, numeric, text, text, text, text, text, integer, integer
) TO authenticated, service_role;

-- 7. Resolución pública de sede: comparación exacta de host (sin comodines LIKE)
-- y sin exponer el motivo de suspensión a menos que la sede esté suspendida.
CREATE OR REPLACE FUNCTION public.get_public_tenant_by_host(
  p_subdominio text DEFAULT NULL,
  p_host text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  nombre text,
  subdominio text,
  estado text,
  fecha_vencimiento date,
  motivo_suspension text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT d.id, d.nombre, d.subdominio, d.estado, d.fecha_vencimiento,
         CASE WHEN d.estado = 'suspendido' THEN d.motivo_suspension ELSE NULL END
  FROM public.droguerias d
  WHERE (p_subdominio IS NOT NULL AND lower(d.subdominio) = lower(trim(p_subdominio)))
     OR (
       p_host IS NOT NULL
       AND d.url_personalizada IS NOT NULL
       AND lower(split_part(split_part(regexp_replace(trim(d.url_personalizada), '^https?://', '', 'i'), '/', 1), ':', 1))
           = lower(trim(p_host))
     )
  ORDER BY (p_subdominio IS NOT NULL AND lower(d.subdominio) = lower(trim(p_subdominio))) DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_tenant_by_host(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_tenant_by_host(text, text) TO anon, authenticated, service_role;

-- 8. Vistas con permisos del usuario que consulta (ya activo en producción; idempotente).
ALTER VIEW public.vista_cartera SET (security_invoker = true);
ALTER VIEW public.vista_inventario_completo SET (security_invoker = true);

-- 9. Rate limit de login compartido entre instancias de Vercel.
CREATE TABLE IF NOT EXISTS public.login_rate_limits (
  key_hash text PRIMARY KEY,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.login_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.login_rate_limits FROM anon, authenticated;
GRANT ALL ON public.login_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.check_login_rate_limit(p_key_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_blocked_until timestamptz;
BEGIN
  SELECT r.blocked_until INTO v_blocked_until
  FROM public.login_rate_limits r
  WHERE r.key_hash = p_key_hash;

  IF v_blocked_until IS NULL OR v_blocked_until <= now() THEN
    RETURN jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
  END IF;

  RETURN jsonb_build_object(
    'allowed', false,
    'retry_after_seconds', GREATEST(1, ceil(extract(epoch FROM (v_blocked_until - now()))))::integer
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_login_failure(p_key_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row record;
  v_attempts integer;
  v_window timestamptz;
  v_blocked timestamptz;
BEGIN
  -- Limpieza ocasional de llaves viejas para que la tabla no crezca sin control.
  IF random() < 0.05 THEN
    DELETE FROM public.login_rate_limits WHERE updated_at < now() - interval '1 day';
  END IF;

  INSERT INTO public.login_rate_limits (key_hash) VALUES (p_key_hash)
  ON CONFLICT (key_hash) DO NOTHING;

  SELECT * INTO v_row FROM public.login_rate_limits WHERE key_hash = p_key_hash FOR UPDATE;

  IF v_row.window_started_at <= now() - interval '15 minutes' THEN
    v_attempts := 1;
    v_window := now();
  ELSE
    v_attempts := v_row.attempts + 1;
    v_window := v_row.window_started_at;
  END IF;

  v_blocked := CASE WHEN v_attempts >= 8 THEN now() + interval '15 minutes' ELSE NULL END;

  UPDATE public.login_rate_limits
  SET attempts = v_attempts,
      window_started_at = v_window,
      blocked_until = v_blocked,
      updated_at = now()
  WHERE key_hash = p_key_hash;

  RETURN jsonb_build_object(
    'allowed', v_blocked IS NULL,
    'retry_after_seconds', CASE WHEN v_blocked IS NULL THEN 0 ELSE 900 END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_login_rate_limit(p_key_hash text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM public.login_rate_limits WHERE key_hash = p_key_hash;
$$;

REVOKE ALL ON FUNCTION public.check_login_rate_limit(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_login_failure(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clear_login_rate_limit(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_login_rate_limit(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_login_failure(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_login_rate_limit(text) TO service_role;

-- 10. Rate limit de la API v1 compartido entre instancias.
CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  api_key_id uuid PRIMARY KEY REFERENCES public.api_keys(id) ON DELETE CASCADE,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.api_rate_limits FROM anon, authenticated;
GRANT ALL ON public.api_rate_limits TO service_role;

CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(
  p_api_key_id uuid,
  p_limit integer DEFAULT 120
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row record;
  v_count integer;
  v_window timestamptz;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION 'Límite inválido';
  END IF;

  INSERT INTO public.api_rate_limits (api_key_id) VALUES (p_api_key_id)
  ON CONFLICT (api_key_id) DO NOTHING;

  SELECT * INTO v_row FROM public.api_rate_limits WHERE api_key_id = p_api_key_id FOR UPDATE;

  IF v_row.window_started_at <= now() - interval '1 minute' THEN
    v_count := 1;
    v_window := now();
  ELSE
    v_count := v_row.request_count + 1;
    v_window := v_row.window_started_at;
  END IF;

  UPDATE public.api_rate_limits
  SET request_count = v_count, window_started_at = v_window, updated_at = now()
  WHERE api_key_id = p_api_key_id;

  RETURN jsonb_build_object(
    'allowed', v_count <= p_limit,
    'limit', p_limit,
    'remaining', GREATEST(0, p_limit - v_count),
    'reset_at', floor(extract(epoch FROM (v_window + interval '1 minute')) * 1000)::bigint
  );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_api_rate_limit(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(uuid, integer) TO service_role;
