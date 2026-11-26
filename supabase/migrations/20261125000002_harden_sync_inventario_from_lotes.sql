-- ============================================================================
-- Hardening multi-tenant de sync_inventario_from_lotes y soporte SuperAdmin
-- en actualizar_datos_fiscales_sede
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_inventario_from_lotes(p_inventario_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sum_c INTEGER := 0;
  v_sum_b INTEGER := 0;
  v_sum_u INTEGER := 0;
  v_rep_lote TEXT;
  v_rep_fv DATE;
  v_today DATE := (now() AT TIME ZONE 'America/Bogota')::date;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.inventario i
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE i.id = p_inventario_id
        AND p.status = 'activo'
        AND (i.drogueria_id = p.drogueria_id OR p.role = 'superadmin')
    ) THEN
      RAISE EXCEPTION 'No tienes permiso para sincronizar lotes de otra droguería';
    END IF;
  END IF;

  SELECT
    COALESCE(SUM(cajas), 0),
    COALESCE(SUM(blisters), 0),
    COALESCE(SUM(unidades), 0)
  INTO v_sum_c, v_sum_b, v_sum_u
  FROM public.inventario_lotes
  WHERE inventario_id = p_inventario_id;

  SELECT l.lote, l.fecha_vencimiento
  INTO v_rep_lote, v_rep_fv
  FROM public.inventario_lotes l
  WHERE l.inventario_id = p_inventario_id
  ORDER BY
    CASE
      WHEN (l.cajas + l.blisters + l.unidades) > 0 AND (l.fecha_vencimiento IS NULL OR l.fecha_vencimiento >= v_today) THEN 0
      WHEN (l.cajas + l.blisters + l.unidades) > 0 THEN 1
      ELSE 2
    END ASC,
    l.fecha_vencimiento ASC NULLS LAST,
    l.created_at ASC
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.inventario
    SET cajas = v_sum_c,
        blisters = v_sum_b,
        unidades = v_sum_u,
        lote = v_rep_lote,
        fecha_vencimiento = v_rep_fv,
        updated_at = now()
    WHERE id = p_inventario_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_inventario_from_lotes(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_inventario_from_lotes(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.actualizar_datos_fiscales_sede(
  p_nit TEXT DEFAULT NULL,
  p_regimen TEXT DEFAULT NULL,
  p_telefono TEXT DEFAULT NULL,
  p_direccion TEXT DEFAULT NULL,
  p_mensaje_pie TEXT DEFAULT NULL,
  p_prefijo_factura TEXT DEFAULT NULL,
  p_resolucion_dian TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  SELECT role, status, drogueria_id INTO v_profile
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_profile IS NULL OR v_profile.status <> 'activo' THEN
    RAISE EXCEPTION 'Cuenta inactiva o sin perfil';
  END IF;

  IF v_profile.role NOT IN ('admin', 'superadmin') OR v_profile.drogueria_id IS NULL THEN
    RAISE EXCEPTION 'Solo el administrador de la droguería puede editar estos datos fiscales';
  END IF;

  UPDATE public.droguerias
  SET nit = NULLIF(trim(COALESCE(p_nit, '')), ''),
      regimen = NULLIF(trim(COALESCE(p_regimen, '')), ''),
      telefono = NULLIF(trim(COALESCE(p_telefono, '')), ''),
      direccion = NULLIF(trim(COALESCE(p_direccion, '')), ''),
      mensaje_pie_factura = NULLIF(trim(COALESCE(p_mensaje_pie, '')), ''),
      prefijo_factura = NULLIF(upper(trim(COALESCE(p_prefijo_factura, ''))), ''),
      resolucion_dian = NULLIF(trim(COALESCE(p_resolucion_dian, '')), '')
  WHERE id = v_profile.drogueria_id;

  INSERT INTO public.logs_actividad (
    drogueria_id,
    usuario_id,
    accion,
    detalles,
    tipo_entidad,
    entidad_id
  ) VALUES (
    v_profile.drogueria_id,
    v_user_id,
    'CONFIGURAR_SEDE',
    'Actualizó datos fiscales, prefijo de factura y pie de tirilla de la droguería',
    'DROGUERIA',
    v_profile.drogueria_id::TEXT
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.actualizar_datos_fiscales_sede(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actualizar_datos_fiscales_sede(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
