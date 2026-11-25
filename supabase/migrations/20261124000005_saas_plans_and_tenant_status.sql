ALTER TABLE public.droguerias
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'activo',
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'basico',
  ADD COLUMN IF NOT EXISTS max_usuarios INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE NULL,
  ADD COLUMN IF NOT EXISTS motivo_suspension TEXT NULL;

ALTER TABLE public.droguerias
  DROP CONSTRAINT IF EXISTS droguerias_estado_check,
  ADD CONSTRAINT droguerias_estado_check CHECK (estado IN ('activo', 'prueba', 'suspendido'));

ALTER TABLE public.droguerias
  DROP CONSTRAINT IF EXISTS droguerias_plan_check,
  ADD CONSTRAINT droguerias_plan_check CHECK (plan IN ('basico', 'pro', 'enterprise'));

ALTER TABLE public.droguerias
  DROP CONSTRAINT IF EXISTS droguerias_max_usuarios_check,
  ADD CONSTRAINT droguerias_max_usuarios_check CHECK (max_usuarios >= 1 AND max_usuarios <= 1000);

CREATE OR REPLACE FUNCTION public.get_public_tenant_by_host(
  p_subdominio TEXT DEFAULT NULL,
  p_host TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  nombre TEXT,
  subdominio TEXT,
  estado TEXT,
  fecha_vencimiento DATE,
  motivo_suspension TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id, d.nombre, d.subdominio, d.estado, d.fecha_vencimiento, d.motivo_suspension
  FROM public.droguerias d
  WHERE (p_subdominio IS NOT NULL AND lower(d.subdominio) = lower(p_subdominio))
     OR (
       p_host IS NOT NULL
       AND d.url_personalizada IS NOT NULL
       AND lower(d.url_personalizada) LIKE '%//' || lower(p_host) || '%'
     )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_tenant_by_host(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_tenant_by_host(TEXT, TEXT) TO anon, authenticated, service_role;
