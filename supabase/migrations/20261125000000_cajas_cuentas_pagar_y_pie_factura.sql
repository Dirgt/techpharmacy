ALTER TABLE public.droguerias
  ADD COLUMN IF NOT EXISTS mensaje_pie_factura TEXT NULL;

ALTER TABLE public.caja_sesiones
  ADD COLUMN IF NOT EXISTS monto_esperado NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS diferencia NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS cerrado_por UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.cerrar_caja_tx(
  p_caja_id UUID,
  p_monto_cierre NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile RECORD;
  v_caja RECORD;
  v_ventas_contado NUMERIC := 0;
  v_abonos_efectivo NUMERIC := 0;
  v_gastos NUMERIC := 0;
  v_compras NUMERIC := 0;
  v_esperado NUMERIC := 0;
  v_diferencia NUMERIC := 0;
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

  SELECT * INTO v_caja
  FROM public.caja_sesiones
  WHERE id = p_caja_id
  FOR UPDATE;

  IF v_caja IS NULL THEN
    RAISE EXCEPTION 'Sesión de caja no encontrada';
  END IF;

  IF v_profile.role <> 'superadmin' AND v_caja.drogueria_id <> v_profile.drogueria_id THEN
    RAISE EXCEPTION 'No tienes permiso para cerrar cajas de otra droguería';
  END IF;

  IF v_caja.estado = 'cerrada' THEN
    RAISE EXCEPTION 'Esta caja ya se encuentra cerrada';
  END IF;

  SELECT COALESCE(SUM(total), 0) INTO v_ventas_contado
  FROM public.facturas
  WHERE caja_sesion_id = p_caja_id
    AND estado_pago = 'pagado'
    AND metodo_pago = 'efectivo'
    AND (tipo_venta = 'contado' OR COALESCE(monto_abonado, 0) = 0);

  SELECT COALESCE(SUM(monto), 0) INTO v_abonos_efectivo
  FROM public.factura_abonos
  WHERE caja_sesion_id = p_caja_id
    AND metodo_pago = 'efectivo';

  SELECT COALESCE(SUM(monto), 0) INTO v_gastos
  FROM public.gastos
  WHERE caja_sesion_id = p_caja_id;

  SELECT COALESCE(SUM(total), 0) INTO v_compras
  FROM public.compras
  WHERE caja_sesion_id = p_caja_id
    AND estado_pago = 'pagado'
    AND metodo_pago = 'efectivo';

  v_esperado := COALESCE(v_caja.monto_apertura, 0) + v_ventas_contado + v_abonos_efectivo - v_gastos - v_compras;
  v_diferencia := COALESCE(p_monto_cierre, 0) - v_esperado;

  UPDATE public.caja_sesiones
  SET estado = 'cerrada',
      monto_cierre = p_monto_cierre,
      monto_esperado = v_esperado,
      diferencia = v_diferencia,
      fecha_cierre = now(),
      cerrado_por = v_user_id
  WHERE id = p_caja_id;

  INSERT INTO public.logs_actividad (
    drogueria_id,
    usuario_id,
    accion,
    detalles,
    tipo_entidad,
    entidad_id
  ) VALUES (
    v_caja.drogueria_id,
    v_user_id,
    'CIERRE_CAJA',
    'Cierre de caja: contado $' || round(COALESCE(p_monto_cierre, 0), 0) || ' | esperado $' || round(v_esperado, 0) || ' | diferencia $' || round(v_diferencia, 0),
    'CAJA',
    p_caja_id::TEXT
  );

  RETURN jsonb_build_object(
    'id', p_caja_id,
    'monto_esperado', v_esperado,
    'monto_cierre', p_monto_cierre,
    'diferencia', v_diferencia
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cerrar_caja_tx(UUID, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cerrar_caja_tx(UUID, NUMERIC) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pagar_compra_tx(
  p_compra_id UUID,
  p_metodo_pago TEXT DEFAULT 'transferencia',
  p_caja_sesion_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile RECORD;
  v_compra RECORD;
  v_caja RECORD;
  v_metodo TEXT;
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

  IF v_profile.role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Solo un administrador puede pagar cuentas por pagar a proveedores';
  END IF;

  SELECT * INTO v_compra
  FROM public.compras
  WHERE id = p_compra_id
  FOR UPDATE;

  IF v_compra IS NULL THEN
    RAISE EXCEPTION 'Compra no encontrada';
  END IF;

  IF v_profile.role <> 'superadmin' AND v_compra.drogueria_id <> v_profile.drogueria_id THEN
    RAISE EXCEPTION 'No tienes permiso para pagar compras de otra droguería';
  END IF;

  IF v_compra.estado_pago = 'pagado' THEN
    RAISE EXCEPTION 'Esta factura de compra ya está pagada';
  END IF;

  v_metodo := COALESCE(NULLIF(trim(p_metodo_pago), ''), 'transferencia');

  IF v_metodo = 'efectivo' THEN
    IF p_caja_sesion_id IS NULL THEN
      RAISE EXCEPTION 'Debes abrir caja para pagar una compra en efectivo';
    END IF;
    SELECT * INTO v_caja
    FROM public.caja_sesiones
    WHERE id = p_caja_sesion_id
      AND drogueria_id = v_compra.drogueria_id
      AND estado IN ('abierta', 'abierto');
    IF v_caja IS NULL THEN
      RAISE EXCEPTION 'La caja seleccionada no está abierta para esta sede';
    END IF;
  END IF;

  UPDATE public.compras
  SET estado_pago = 'pagado',
      metodo_pago = v_metodo,
      caja_sesion_id = CASE WHEN v_metodo = 'efectivo' THEN p_caja_sesion_id ELSE caja_sesion_id END
  WHERE id = p_compra_id;

  INSERT INTO public.logs_actividad (
    drogueria_id,
    usuario_id,
    accion,
    detalles,
    tipo_entidad,
    entidad_id
  ) VALUES (
    v_compra.drogueria_id,
    v_user_id,
    'PAGO_COMPRA',
    'Pago de compra factura #' || v_compra.numero_factura || ' por $' || round(COALESCE(v_compra.total, 0), 0) || ' (' || v_metodo || ')',
    'COMPRA',
    p_compra_id::TEXT
  );

  RETURN jsonb_build_object(
    'id', p_compra_id,
    'estado_pago', 'pagado',
    'metodo_pago', v_metodo
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pagar_compra_tx(UUID, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pagar_compra_tx(UUID, TEXT, UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.actualizar_datos_fiscales_sede(
  p_nit TEXT DEFAULT NULL,
  p_regimen TEXT DEFAULT NULL,
  p_telefono TEXT DEFAULT NULL,
  p_direccion TEXT DEFAULT NULL,
  p_mensaje_pie TEXT DEFAULT NULL
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

  IF v_profile.role <> 'admin' OR v_profile.drogueria_id IS NULL THEN
    RAISE EXCEPTION 'Solo el administrador de la droguería puede editar estos datos fiscales';
  END IF;

  UPDATE public.droguerias
  SET nit = NULLIF(trim(COALESCE(p_nit, '')), ''),
      regimen = NULLIF(trim(COALESCE(p_regimen, '')), ''),
      telefono = NULLIF(trim(COALESCE(p_telefono, '')), ''),
      direccion = NULLIF(trim(COALESCE(p_direccion, '')), ''),
      mensaje_pie_factura = NULLIF(trim(COALESCE(p_mensaje_pie, '')), '')
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
    'Actualizó datos fiscales y mensaje de tirilla de la droguería',
    'DROGUERIA',
    v_profile.drogueria_id::TEXT
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.actualizar_datos_fiscales_sede(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actualizar_datos_fiscales_sede(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
