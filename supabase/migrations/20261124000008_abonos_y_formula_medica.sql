ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS requiere_formula BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS monto_abonado NUMERIC NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.factura_abonos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drogueria_id UUID NOT NULL REFERENCES public.droguerias(id) ON DELETE CASCADE,
  factura_id UUID NOT NULL REFERENCES public.facturas(id) ON DELETE CASCADE,
  caja_sesion_id UUID NULL REFERENCES public.caja_sesiones(id) ON DELETE SET NULL,
  monto NUMERIC NOT NULL CHECK (monto > 0),
  metodo_pago TEXT NOT NULL DEFAULT 'efectivo',
  notas TEXT NULL,
  registrado_por UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_factura_abonos_factura_id ON public.factura_abonos(factura_id);
CREATE INDEX IF NOT EXISTS idx_factura_abonos_drogueria_id ON public.factura_abonos(drogueria_id);

ALTER TABLE public.factura_abonos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Aislamiento Multi-Tenant factura_abonos" ON public.factura_abonos;
CREATE POLICY "Aislamiento Multi-Tenant factura_abonos" ON public.factura_abonos
  FOR ALL
  TO authenticated
  USING (drogueria_id = public.get_current_drogueria_id())
  WITH CHECK (drogueria_id = public.get_current_drogueria_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.factura_abonos TO authenticated;
GRANT ALL ON public.factura_abonos TO service_role;

CREATE OR REPLACE FUNCTION public.registrar_abono_factura_tx(
  p_factura_id UUID,
  p_caja_sesion_id UUID,
  p_monto NUMERIC,
  p_metodo_pago TEXT DEFAULT 'efectivo',
  p_notas TEXT DEFAULT ''
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
  v_saldo NUMERIC;
  v_nuevo_abonado NUMERIC;
  v_nuevo_estado TEXT;
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

  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'El monto del abono debe ser mayor a cero';
  END IF;

  SELECT * INTO v_factura
  FROM public.facturas
  WHERE id = p_factura_id
  FOR UPDATE;

  IF v_factura IS NULL THEN
    RAISE EXCEPTION 'Factura no encontrada';
  END IF;

  IF v_profile.role <> 'superadmin' AND v_factura.drogueria_id <> v_profile.drogueria_id THEN
    RAISE EXCEPTION 'No tienes permiso para abonar facturas de otra droguería';
  END IF;

  IF v_factura.estado_pago <> 'pendiente' THEN
    RAISE EXCEPTION 'Solo se pueden registrar abonos a facturas pendientes';
  END IF;

  v_saldo := GREATEST(COALESCE(v_factura.total, 0) - COALESCE(v_factura.monto_abonado, 0), 0);
  IF p_monto > v_saldo + 0.01 THEN
    RAISE EXCEPTION 'El abono supera el saldo pendiente';
  END IF;

  v_nuevo_abonado := LEAST(COALESCE(v_factura.total, 0), COALESCE(v_factura.monto_abonado, 0) + p_monto);
  v_nuevo_estado := CASE
    WHEN v_nuevo_abonado >= COALESCE(v_factura.total, 0) - 0.01 THEN 'pagado'
    ELSE 'pendiente'
  END;

  INSERT INTO public.factura_abonos (
    drogueria_id,
    factura_id,
    caja_sesion_id,
    monto,
    metodo_pago,
    notas,
    registrado_por
  ) VALUES (
    v_factura.drogueria_id,
    p_factura_id,
    p_caja_sesion_id,
    p_monto,
    COALESCE(NULLIF(trim(p_metodo_pago), ''), 'efectivo'),
    NULLIF(trim(COALESCE(p_notas, '')), ''),
    v_user_id
  );

  UPDATE public.facturas
  SET monto_abonado = v_nuevo_abonado,
      estado_pago = v_nuevo_estado,
      metodo_pago = CASE WHEN v_nuevo_estado = 'pagado' THEN COALESCE(NULLIF(trim(p_metodo_pago), ''), metodo_pago) ELSE metodo_pago END,
      caja_sesion_id = CASE WHEN v_nuevo_estado = 'pagado' AND p_caja_sesion_id IS NOT NULL THEN p_caja_sesion_id ELSE caja_sesion_id END
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
    'ABONO_FACTURA',
    'Abono de $' || round(p_monto, 0) || ' a factura #' || v_factura.numero || ' (' || COALESCE(NULLIF(trim(p_metodo_pago), ''), 'efectivo') || ')',
    'FACTURA',
    p_factura_id::TEXT
  );

  RETURN jsonb_build_object(
    'factura_id', p_factura_id,
    'monto_abonado', v_nuevo_abonado,
    'saldo_pendiente', GREATEST(COALESCE(v_factura.total, 0) - v_nuevo_abonado, 0),
    'estado_pago', v_nuevo_estado
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_abono_factura_tx(UUID, UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_abono_factura_tx(UUID, UUID, NUMERIC, TEXT, TEXT) TO authenticated, service_role;
