ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS motivo_anulacion TEXT NULL,
  ADD COLUMN IF NOT EXISTS anulada_por UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS anulada_at TIMESTAMPTZ NULL;

CREATE OR REPLACE FUNCTION public.anular_factura_tx(
  p_factura_id UUID,
  p_motivo TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile RECORD;
  v_factura RECORD;
  v_det RECORD;
  v_inv RECORD;
  v_bpc INTEGER;
  v_upb INTEGER;
  v_new_unidades INTEGER;
  v_new_blisters INTEGER;
  v_new_cajas INTEGER;
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
    RAISE EXCEPTION 'Solo un administrador puede anular facturas';
  END IF;

  SELECT * INTO v_factura
  FROM public.facturas
  WHERE id = p_factura_id
  FOR UPDATE;

  IF v_factura IS NULL THEN
    RAISE EXCEPTION 'Factura no encontrada';
  END IF;

  IF v_profile.role <> 'superadmin' AND v_factura.drogueria_id <> v_profile.drogueria_id THEN
    RAISE EXCEPTION 'No tienes permiso para anular facturas de otra droguería';
  END IF;

  IF v_factura.estado_pago = 'anulada' THEN
    RAISE EXCEPTION 'Esta factura ya se encuentra anulada';
  END IF;

  FOR v_det IN
    SELECT producto_id, cantidad_cajas, cantidad_blisters, cantidad_unidades
    FROM public.factura_detalles
    WHERE factura_id = p_factura_id
  LOOP
    SELECT * INTO v_inv
    FROM public.inventario
    WHERE producto_id = v_det.producto_id
      AND drogueria_id = v_factura.drogueria_id
    FOR UPDATE;

    IF v_inv IS NOT NULL THEN
      v_bpc := GREATEST(COALESCE(v_inv.blisters_por_caja, 1), 1);
      v_upb := GREATEST(COALESCE(v_inv.unidades_por_blister, 1), 1);

      v_new_unidades := COALESCE(v_inv.unidades, 0) + COALESCE(v_det.cantidad_unidades, 0);
      v_new_blisters := COALESCE(v_inv.blisters, 0) + COALESCE(v_det.cantidad_blisters, 0);
      v_new_cajas := COALESCE(v_inv.cajas, 0) + COALESCE(v_det.cantidad_cajas, 0);

      IF v_upb > 1 AND v_new_unidades >= v_upb THEN
        v_new_blisters := v_new_blisters + (v_new_unidades / v_upb);
        v_new_unidades := v_new_unidades % v_upb;
      END IF;

      IF v_bpc > 1 AND v_new_blisters >= v_bpc THEN
        v_new_cajas := v_new_cajas + (v_new_blisters / v_bpc);
        v_new_blisters := v_new_blisters % v_bpc;
      END IF;

      UPDATE public.inventario
      SET cajas = v_new_cajas,
          blisters = v_new_blisters,
          unidades = v_new_unidades,
          updated_at = now(),
          usuario_id = v_user_id
      WHERE id = v_inv.id;
    END IF;
  END LOOP;

  UPDATE public.facturas
  SET estado_pago = 'anulada',
      motivo_anulacion = NULLIF(trim(COALESCE(p_motivo, '')), ''),
      anulada_por = v_user_id,
      anulada_at = now()
  WHERE id = p_factura_id;

  INSERT INTO public.logs_actividad (
    drogueria_id,
    usuario_id,
    accion,
    detalles,
    tipo_entidad,
    entidad_id
  ) VALUES (
    v_factura.drogueria_id,
    v_user_id,
    'ANULAR_FACTURA',
    'Se anuló la factura #' || v_factura.numero || COALESCE(' — Motivo: ' || NULLIF(trim(COALESCE(p_motivo, '')), ''), ''),
    'FACTURA',
    p_factura_id::TEXT
  );

  RETURN jsonb_build_object(
    'id', v_factura.id,
    'numero', v_factura.numero,
    'estado_pago', 'anulada'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.anular_factura_tx(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anular_factura_tx(UUID, TEXT) TO authenticated, service_role;
