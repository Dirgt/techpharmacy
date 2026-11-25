-- Migración integral:
-- 1. Consecutivo independiente por droguería + base fiscal liviana (prefijo_factura, resolucion_dian)
-- 2. Pago mixto en mostrador (efectivo + tarjeta + transferencia) sincronizado con arqueo de caja
-- 3. Multi-lote FEFO (inventario_lotes) + Recepción Técnica en compras + Baja de lotes
-- 4. Destape / Fraccionamiento automático (Caja -> Blíster -> Unidad) en facturación
-- 5. Bloqueo sanitario de venta de lotes vencidos en POS

-- ============================================================================
-- 1. CONSECUTIVO PROPIO POR DROGUERÍA Y BASE FISCAL LIVIANA
-- ============================================================================
ALTER TABLE public.droguerias
  ADD COLUMN IF NOT EXISTS prefijo_factura TEXT NULL,
  ADD COLUMN IF NOT EXISTS resolucion_dian TEXT NULL,
  ADD COLUMN IF NOT EXISTS ultimo_consecutivo_factura INTEGER NOT NULL DEFAULT 0;

UPDATE public.droguerias d
SET ultimo_consecutivo_factura = COALESCE(
  (SELECT MAX(f.numero) FROM public.facturas f WHERE f.drogueria_id = d.id),
  0
);

ALTER TABLE public.facturas
  DROP CONSTRAINT IF EXISTS facturas_numero_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'facturas_drogueria_id_numero_key'
      AND conrelid = 'public.facturas'::regclass
  ) THEN
    ALTER TABLE public.facturas
      ADD CONSTRAINT facturas_drogueria_id_numero_key UNIQUE (drogueria_id, numero);
  END IF;
END $$;

-- ============================================================================
-- 2. PAGO MIXTO EN FACTURAS
-- ============================================================================
ALTER TABLE public.facturas
  DROP CONSTRAINT IF EXISTS facturas_metodo_pago_check;

ALTER TABLE public.facturas
  ADD CONSTRAINT facturas_metodo_pago_check
  CHECK (metodo_pago = ANY (ARRAY['efectivo'::text, 'tarjeta'::text, 'transferencia'::text, 'mixto'::text]));

ALTER TABLE public.facturas
  ADD COLUMN IF NOT EXISTS pago_efectivo NUMERIC NOT NULL DEFAULT 0 CHECK (pago_efectivo >= 0),
  ADD COLUMN IF NOT EXISTS pago_tarjeta NUMERIC NOT NULL DEFAULT 0 CHECK (pago_tarjeta >= 0),
  ADD COLUMN IF NOT EXISTS pago_transferencia NUMERIC NOT NULL DEFAULT 0 CHECK (pago_transferencia >= 0);

UPDATE public.facturas
SET pago_efectivo = CASE WHEN metodo_pago = 'efectivo' THEN COALESCE(total, 0) ELSE 0 END,
    pago_tarjeta = CASE WHEN metodo_pago = 'tarjeta' THEN COALESCE(total, 0) ELSE 0 END,
    pago_transferencia = CASE WHEN metodo_pago = 'transferencia' THEN COALESCE(total, 0) ELSE 0 END
WHERE estado_pago = 'pagado'
  AND tipo_venta = 'contado'
  AND COALESCE(pago_efectivo, 0) = 0
  AND COALESCE(pago_tarjeta, 0) = 0
  AND COALESCE(pago_transferencia, 0) = 0;

-- ============================================================================
-- 3. RECEPCIÓN TÉCNICA EN COMPRAS Y TABLA MULTI-LOTE FEFO (inventario_lotes)
-- ============================================================================
ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS estado_recepcion TEXT NULL DEFAULT 'conforme',
  ADD COLUMN IF NOT EXISTS observaciones_recepcion TEXT NULL;

ALTER TABLE public.compra_detalles
  ADD COLUMN IF NOT EXISTS lote TEXT NULL,
  ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE NULL;

CREATE TABLE IF NOT EXISTS public.inventario_lotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drogueria_id UUID NOT NULL DEFAULT public.get_current_drogueria_id() REFERENCES public.droguerias(id) ON DELETE CASCADE,
  inventario_id UUID NOT NULL REFERENCES public.inventario(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  lote TEXT NOT NULL DEFAULT 'SIN-LOTE',
  fecha_vencimiento DATE NULL,
  cajas INTEGER NOT NULL DEFAULT 0 CHECK (cajas >= 0),
  blisters INTEGER NOT NULL DEFAULT 0 CHECK (blisters >= 0),
  unidades INTEGER NOT NULL DEFAULT 0 CHECK (unidades >= 0),
  costo_caja NUMERIC NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventario_lotes_drogueria_id ON public.inventario_lotes(drogueria_id);
CREATE INDEX IF NOT EXISTS idx_inventario_lotes_inventario_id ON public.inventario_lotes(inventario_id);
CREATE INDEX IF NOT EXISTS idx_inventario_lotes_producto_id ON public.inventario_lotes(producto_id);

ALTER TABLE public.inventario_lotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Aislamiento Multi-Tenant inventario_lotes" ON public.inventario_lotes;
CREATE POLICY "Aislamiento Multi-Tenant inventario_lotes" ON public.inventario_lotes
  FOR ALL
  TO authenticated
  USING (drogueria_id = public.get_current_drogueria_id())
  WITH CHECK (drogueria_id = public.get_current_drogueria_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventario_lotes TO authenticated;
GRANT ALL ON public.inventario_lotes TO service_role;

INSERT INTO public.inventario_lotes (
  drogueria_id,
  inventario_id,
  producto_id,
  lote,
  fecha_vencimiento,
  cajas,
  blisters,
  unidades,
  costo_caja
)
SELECT
  i.drogueria_id,
  i.id,
  i.producto_id,
  COALESCE(NULLIF(trim(COALESCE(i.lote, '')), ''), 'LOTE-INICIAL'),
  i.fecha_vencimiento,
  GREATEST(COALESCE(i.cajas, 0), 0),
  GREATEST(COALESCE(i.blisters, 0), 0),
  GREATEST(COALESCE(i.unidades, 0), 0),
  i.precio_caja
FROM public.inventario i
WHERE NOT EXISTS (
  SELECT 1 FROM public.inventario_lotes l WHERE l.inventario_id = i.id
);

-- ============================================================================
-- 4. SINCRONIZACIÓN DE INVENTARIO DESDE LOTES (FEFO)
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
  SELECT
    COALESCE(SUM(cajas), 0),
    COALESCE(SUM(blisters), 0),
    COALESCE(SUM(unidades), 0)
  INTO v_sum_c, v_sum_b, v_sum_u
  FROM public.inventario_lotes
  WHERE inventario_id = p_inventario_id;

  -- Seleccionar lote representativo:
  -- 1) Lotes vigentes con stock > 0 ordenados FEFO (vencimiento más próximo)
  -- 2) Si no hay vigentes con stock, lote con stock > 0 más próximo/antiguo (para alertas)
  -- 3) Si no hay stock en ningún lote, último lote registrado
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

-- ============================================================================
-- 5. ACTUALIZACIÓN DE DATOS FISCALES DE SEDE (PREFIJO + RESOLUCIÓN OPCIONAL)
-- ============================================================================
DROP FUNCTION IF EXISTS public.actualizar_datos_fiscales_sede(TEXT, TEXT, TEXT, TEXT, TEXT);

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

  IF v_profile.role <> 'admin' OR v_profile.drogueria_id IS NULL THEN
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

-- ============================================================================
-- 6. UPSERT INVENTARIO CON PRESERVACIÓN MULTI-LOTE
-- ============================================================================
CREATE OR REPLACE FUNCTION public.upsert_inventario_tx(
  p_producto_id uuid DEFAULT NULL::uuid,
  p_codigo text DEFAULT NULL::text,
  p_nombre text DEFAULT NULL::text,
  p_principio_activo text DEFAULT NULL::text,
  p_laboratorio_id uuid DEFAULT NULL::uuid,
  p_inventario_id uuid DEFAULT NULL::uuid,
  p_cajas integer DEFAULT 0,
  p_blisters integer DEFAULT 0,
  p_unidades integer DEFAULT 0,
  p_stock_minimo integer DEFAULT 2,
  p_precio_caja numeric DEFAULT 0,
  p_precio_blister numeric DEFAULT 0,
  p_precio_unidad numeric DEFAULT 0,
  p_porcentaje_ganancia numeric DEFAULT 0,
  p_margen_blister numeric DEFAULT 0,
  p_margen_unidad numeric DEFAULT 0,
  p_fecha_vencimiento text DEFAULT NULL::text,
  p_lote text DEFAULT NULL::text,
  p_registro_invima text DEFAULT NULL::text,
  p_seccion text DEFAULT NULL::text,
  p_ubicacion text DEFAULT NULL::text,
  p_blisters_por_caja integer DEFAULT 1,
  p_unidades_por_blister integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_final_producto_id UUID;
  v_old_data RECORD;
  v_new_inventario RECORD;
  v_diff_cajas INTEGER;
  v_diff_blisters INTEGER;
  v_diff_unidades INTEGER;
  v_accion TEXT;
  v_detalles TEXT := '';
  v_user_id UUID;
  v_operador_real TEXT;
  v_fecha_vencimiento DATE := NULL;
  v_lote_clean TEXT;
  v_lotes_activos INTEGER := 0;
  v_lotes_total INTEGER := 0;
  v_target_lote_id UUID;
BEGIN
  IF p_fecha_vencimiento IS NOT NULL AND p_fecha_vencimiento <> '' THEN
     v_fecha_vencimiento := p_fecha_vencimiento::DATE;
  END IF;

  v_lote_clean := COALESCE(NULLIF(trim(COALESCE(p_lote, '')), ''), 'LOTE-INICIAL');
  v_final_producto_id := p_producto_id;

  IF v_final_producto_id IS NULL THEN
    SELECT id INTO v_final_producto_id FROM public.productos WHERE codigo = p_codigo LIMIT 1;
    IF v_final_producto_id IS NOT NULL THEN
      UPDATE public.productos
      SET principio_activo = p_principio_activo,
          nombre = p_nombre,
          laboratorio_id = COALESCE(p_laboratorio_id, laboratorio_id)
      WHERE id = v_final_producto_id;
    ELSE
      INSERT INTO public.productos (codigo, nombre, principio_activo, laboratorio_id)
      VALUES (p_codigo, p_nombre, p_principio_activo, p_laboratorio_id)
      RETURNING id INTO v_final_producto_id;
    END IF;
  ELSE
    UPDATE public.productos
    SET principio_activo = p_principio_activo,
        nombre = p_nombre,
        laboratorio_id = COALESCE(p_laboratorio_id, laboratorio_id)
    WHERE id = v_final_producto_id;
  END IF;

  IF p_inventario_id IS NOT NULL THEN
    SELECT * INTO v_old_data FROM public.inventario WHERE id = p_inventario_id;
  ELSE
    SELECT * INTO v_old_data FROM public.inventario WHERE producto_id = v_final_producto_id LIMIT 1;
    IF v_old_data IS NOT NULL THEN
       p_inventario_id := v_old_data.id;
    END IF;
  END IF;

  IF p_inventario_id IS NOT NULL THEN
    UPDATE public.inventario SET
      fecha_vencimiento = v_fecha_vencimiento,
      cajas = p_cajas,
      blisters = p_blisters,
      unidades = p_unidades,
      stock_minimo = p_stock_minimo,
      precio_caja = p_precio_caja,
      precio_blister = p_precio_blister,
      precio_unidad = p_precio_unidad,
      porcentaje_ganancia = p_porcentaje_ganancia,
      margen_blister = p_margen_blister,
      margen_unidad = p_margen_unidad,
      lote = v_lote_clean,
      registro_invima = p_registro_invima,
      seccion = p_seccion,
      ubicacion = p_ubicacion,
      blisters_por_caja = p_blisters_por_caja,
      unidades_por_blister = p_unidades_por_blister,
      updated_at = NOW()
    WHERE id = p_inventario_id
    RETURNING * INTO v_new_inventario;
  ELSE
    INSERT INTO public.inventario (
      producto_id, fecha_vencimiento, cajas, blisters, unidades, stock_minimo,
      precio_caja, precio_blister, precio_unidad, porcentaje_ganancia,
      margen_blister, margen_unidad, lote, registro_invima, seccion, ubicacion,
      blisters_por_caja, unidades_por_blister
    ) VALUES (
      v_final_producto_id, v_fecha_vencimiento, p_cajas, p_blisters, p_unidades, p_stock_minimo,
      p_precio_caja, p_precio_blister, p_precio_unidad, p_porcentaje_ganancia,
      p_margen_blister, p_margen_unidad, v_lote_clean, p_registro_invima, p_seccion, p_ubicacion,
      p_blisters_por_caja, p_unidades_por_blister
    ) RETURNING * INTO v_new_inventario;
  END IF;

  v_diff_cajas := p_cajas - COALESCE(v_old_data.cajas, 0);
  v_diff_blisters := p_blisters - COALESCE(v_old_data.blisters, 0);
  v_diff_unidades := p_unidades - COALESCE(v_old_data.unidades, 0);

  -- Sincronizar inventario_lotes sin destruir lotes existentes
  SELECT
    COUNT(*) FILTER (WHERE (cajas + blisters + unidades) > 0),
    COUNT(*)
  INTO v_lotes_activos, v_lotes_total
  FROM public.inventario_lotes
  WHERE inventario_id = v_new_inventario.id;

  IF v_lotes_total = 0 THEN
    INSERT INTO public.inventario_lotes (
      drogueria_id, inventario_id, producto_id, lote, fecha_vencimiento,
      cajas, blisters, unidades, costo_caja
    ) VALUES (
      v_new_inventario.drogueria_id, v_new_inventario.id, v_final_producto_id,
      v_lote_clean, v_fecha_vencimiento, p_cajas, p_blisters, p_unidades, p_precio_caja
    );
  ELSIF v_lotes_activos <= 1 THEN
    SELECT id INTO v_target_lote_id
    FROM public.inventario_lotes
    WHERE inventario_id = v_new_inventario.id
    ORDER BY (cajas + blisters + unidades) DESC, created_at ASC
    LIMIT 1;

    UPDATE public.inventario_lotes
    SET lote = v_lote_clean,
        fecha_vencimiento = v_fecha_vencimiento,
        cajas = GREATEST(0, p_cajas),
        blisters = GREATEST(0, p_blisters),
        unidades = GREATEST(0, p_unidades),
        costo_caja = p_precio_caja,
        updated_at = NOW()
    WHERE id = v_target_lote_id;
  ELSE
    -- Con múltiples lotes activos: si no cambió el stock total, conservar intactos todos los lotes
    IF v_diff_cajas = 0 AND v_diff_blisters = 0 AND v_diff_unidades = 0 THEN
      PERFORM public.sync_inventario_from_lotes(v_new_inventario.id);
      SELECT * INTO v_new_inventario FROM public.inventario WHERE id = v_new_inventario.id;
    ELSE
      -- Si se ajustó el stock manualmente, reflejar diferencia sobre lote coincidente o nuevo lote
      SELECT id INTO v_target_lote_id
      FROM public.inventario_lotes
      WHERE inventario_id = v_new_inventario.id
        AND lote = v_lote_clean
        AND fecha_vencimiento IS NOT DISTINCT FROM v_fecha_vencimiento
      LIMIT 1;

      IF v_target_lote_id IS NOT NULL THEN
        UPDATE public.inventario_lotes
        SET cajas = GREATEST(0, cajas + v_diff_cajas),
            blisters = GREATEST(0, blisters + v_diff_blisters),
            unidades = GREATEST(0, unidades + v_diff_unidades),
            costo_caja = p_precio_caja,
            updated_at = NOW()
        WHERE id = v_target_lote_id;
      ELSIF v_diff_cajas >= 0 AND v_diff_blisters >= 0 AND v_diff_unidades >= 0 THEN
        INSERT INTO public.inventario_lotes (
          drogueria_id, inventario_id, producto_id, lote, fecha_vencimiento,
          cajas, blisters, unidades, costo_caja
        ) VALUES (
          v_new_inventario.drogueria_id, v_new_inventario.id, v_final_producto_id,
          v_lote_clean, v_fecha_vencimiento, v_diff_cajas, v_diff_blisters, v_diff_unidades, p_precio_caja
        );
      ELSE
        SELECT id INTO v_target_lote_id
        FROM public.inventario_lotes
        WHERE inventario_id = v_new_inventario.id
          AND (cajas + blisters + unidades) > 0
        ORDER BY fecha_vencimiento ASC NULLS LAST, created_at ASC
        LIMIT 1;
        IF v_target_lote_id IS NOT NULL THEN
          UPDATE public.inventario_lotes
          SET cajas = GREATEST(0, cajas + v_diff_cajas),
              blisters = GREATEST(0, blisters + v_diff_blisters),
              unidades = GREATEST(0, unidades + v_diff_unidades),
              updated_at = NOW()
          WHERE id = v_target_lote_id;
        END IF;
      END IF;
      PERFORM public.sync_inventario_from_lotes(v_new_inventario.id);
      SELECT * INTO v_new_inventario FROM public.inventario WHERE id = v_new_inventario.id;
    END IF;
  END IF;

  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT full_name INTO v_operador_real FROM public.profiles WHERE id = v_user_id;
    IF v_operador_real IS NULL THEN
      v_operador_real := 'Admin';
    END IF;
  ELSE
    v_operador_real := 'Sistema';
  END IF;

  IF v_old_data IS NULL THEN
    v_accion := 'NUEVO INGRESO';
  ELSIF v_diff_cajas > 0 OR v_diff_blisters > 0 OR v_diff_unidades > 0 THEN
    v_accion := 'ENTRADA';
  ELSIF v_diff_cajas < 0 OR v_diff_blisters < 0 OR v_diff_unidades < 0 THEN
    v_accion := 'AJUSTE NEGATIVO';
  ELSE
    v_accion := 'ACTUALIZACIÓN';
  END IF;

  v_detalles := 'Operación: ' || v_accion || ' en ' || p_nombre || '. ';

  IF v_diff_cajas <> 0 OR v_diff_blisters <> 0 OR v_diff_unidades <> 0 THEN
    v_detalles := v_detalles || 'Stock: ';
    IF v_diff_cajas <> 0 THEN v_detalles := v_detalles || 'Cajas: ' || COALESCE(v_old_data.cajas, 0) || ' → ' || p_cajas || ' | '; END IF;
    IF v_diff_blisters <> 0 THEN v_detalles := v_detalles || 'Blísters: ' || COALESCE(v_old_data.blisters, 0) || ' → ' || p_blisters || ' | '; END IF;
    IF v_diff_unidades <> 0 THEN v_detalles := v_detalles || 'Unidades: ' || COALESCE(v_old_data.unidades, 0) || ' → ' || p_unidades || ' | '; END IF;
  END IF;

  INSERT INTO public.auditoria_inventario (
    drogueria_id, inventario_id, operador, accion, valor_anterior, valor_nuevo, detalles
  ) VALUES (
    v_new_inventario.drogueria_id,
    v_new_inventario.id,
    v_operador_real,
    v_accion,
    COALESCE(to_jsonb(v_old_data)::text, '{}'),
    to_jsonb(v_new_inventario)::text,
    v_detalles
  );

  RETURN to_jsonb(v_new_inventario);
END;
$function$;

-- ============================================================================
-- 7. DAR DE BAJA UN LOTE ESPECÍFICO (SIN BORRAR LOS LOTES NUEVOS)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.dar_baja_lote_tx(
  p_lote_id UUID,
  p_motivo TEXT DEFAULT 'Baja por vencimiento o deterioro'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile RECORD;
  v_lote RECORD;
  v_prod_nombre TEXT;
  v_motivo_clean TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  SELECT role, status, drogueria_id, full_name INTO v_profile
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_profile IS NULL OR v_profile.status <> 'activo' THEN
    RAISE EXCEPTION 'Cuenta inactiva o sin perfil';
  END IF;

  IF v_profile.role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Solo un administrador puede dar de baja lotes';
  END IF;

  SELECT * INTO v_lote
  FROM public.inventario_lotes
  WHERE id = p_lote_id
  FOR UPDATE;

  IF v_lote IS NULL THEN
    RAISE EXCEPTION 'Lote no encontrado';
  END IF;

  IF v_profile.role <> 'superadmin' AND v_lote.drogueria_id <> v_profile.drogueria_id THEN
    RAISE EXCEPTION 'No tienes permiso sobre lotes de otra droguería';
  END IF;

  IF (v_lote.cajas + v_lote.blisters + v_lote.unidades) = 0 THEN
    RAISE EXCEPTION 'Este lote ya se encuentra en cero';
  END IF;

  SELECT nombre INTO v_prod_nombre FROM public.productos WHERE id = v_lote.producto_id;
  v_motivo_clean := COALESCE(NULLIF(trim(COALESCE(p_motivo, '')), ''), 'Baja por vencimiento o deterioro');

  UPDATE public.inventario_lotes
  SET cajas = 0,
      blisters = 0,
      unidades = 0,
      updated_at = now()
  WHERE id = p_lote_id;

  PERFORM public.sync_inventario_from_lotes(v_lote.inventario_id);

  INSERT INTO public.auditoria_inventario (
    drogueria_id, inventario_id, operador, accion, campo_modificado, valor_anterior, valor_nuevo, detalles
  ) VALUES (
    v_lote.drogueria_id,
    v_lote.inventario_id,
    COALESCE(v_profile.full_name, 'Admin'),
    'BAJA_LOTE',
    'lote',
    jsonb_build_object('lote', v_lote.lote, 'cajas', v_lote.cajas, 'blisters', v_lote.blisters, 'unidades', v_lote.unidades)::text,
    '{"cajas":0,"blisters":0,"unidades":0}',
    'Baja lote ' || v_lote.lote || ' de ' || COALESCE(v_prod_nombre, 'producto') || ' — ' || v_motivo_clean
  );

  INSERT INTO public.logs_actividad (
    drogueria_id, usuario_id, accion, detalles, tipo_entidad, entidad_id
  ) VALUES (
    v_lote.drogueria_id,
    v_user_id,
    'BAJA_LOTE',
    'Baja lote ' || v_lote.lote || ' (' || COALESCE(v_prod_nombre, 'producto') || '): ' ||
      v_lote.cajas || 'C ' || v_lote.blisters || 'B ' || v_lote.unidades || 'U — ' || v_motivo_clean,
    'INVENTARIO',
    v_lote.inventario_id::TEXT
  );

  RETURN jsonb_build_object('success', true, 'lote_id', p_lote_id);
END;
$$;

REVOKE ALL ON FUNCTION public.dar_baja_lote_tx(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dar_baja_lote_tx(UUID, TEXT) TO authenticated, service_role;

-- ============================================================================
-- 8. COMPRAS CON RECEPCIÓN TÉCNICA, MULTI-LOTE Y RECÁLCULO DE COSTOS
-- ============================================================================
DROP TYPE IF EXISTS public.compra_detalle_input CASCADE;
CREATE TYPE public.compra_detalle_input AS (
  producto_id UUID,
  cantidad INTEGER,
  costo_unitario NUMERIC,
  lote TEXT,
  fecha_vencimiento TEXT
);

CREATE OR REPLACE FUNCTION public.registrar_compra_tx(
  p_proveedor_id UUID,
  p_numero_factura TEXT,
  p_total NUMERIC,
  p_estado_pago TEXT,
  p_metodo_pago TEXT,
  p_caja_sesion_id UUID,
  p_detalles public.compra_detalle_input[],
  p_user_id UUID,
  p_estado_recepcion TEXT DEFAULT 'conforme',
  p_observaciones_recepcion TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := COALESCE(auth.uid(), p_user_id);
  v_profile RECORD;
  v_compra_id UUID;
  v_detalle public.compra_detalle_input;
  v_inv RECORD;
  v_lote_clean TEXT;
  v_fecha_venc DATE;
  v_existing_lote RECORD;
  v_bpc INTEGER;
  v_upb INTEGER;
  v_new_pb NUMERIC;
  v_new_pu NUMERIC;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  SELECT role, status, drogueria_id, full_name INTO v_profile
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_profile IS NULL OR v_profile.status <> 'activo' THEN
    RAISE EXCEPTION 'Cuenta inactiva o sin perfil';
  END IF;

  IF v_profile.role NOT IN ('admin', 'superadmin') OR v_profile.drogueria_id IS NULL THEN
    RAISE EXCEPTION 'Solo un administrador de sede puede registrar compras';
  END IF;

  IF COALESCE(array_length(p_detalles, 1), 0) = 0 THEN
    RAISE EXCEPTION 'La compra debe incluir al menos un producto';
  END IF;

  INSERT INTO public.compras (
    drogueria_id,
    proveedor_id,
    numero_factura,
    total,
    estado_pago,
    metodo_pago,
    caja_sesion_id,
    estado_recepcion,
    observaciones_recepcion
  ) VALUES (
    v_profile.drogueria_id,
    p_proveedor_id,
    p_numero_factura,
    p_total,
    p_estado_pago,
    p_metodo_pago,
    p_caja_sesion_id,
    COALESCE(NULLIF(trim(COALESCE(p_estado_recepcion, '')), ''), 'conforme'),
    NULLIF(trim(COALESCE(p_observaciones_recepcion, '')), '')
  )
  RETURNING id INTO v_compra_id;

  FOREACH v_detalle IN ARRAY p_detalles LOOP
    IF COALESCE(v_detalle.cantidad, 0) <= 0 THEN
      RAISE EXCEPTION 'La cantidad comprada debe ser mayor a cero';
    END IF;

    v_fecha_venc := NULL;
    IF v_detalle.fecha_vencimiento IS NOT NULL AND trim(v_detalle.fecha_vencimiento) <> '' THEN
      v_fecha_venc := trim(v_detalle.fecha_vencimiento)::DATE;
    END IF;

    v_lote_clean := COALESCE(NULLIF(trim(COALESCE(v_detalle.lote, '')), ''), 'COMPRA-' || p_numero_factura);

    INSERT INTO public.compra_detalles (
      drogueria_id,
      compra_id,
      producto_id,
      cantidad,
      costo_unitario,
      subtotal,
      lote,
      fecha_vencimiento
    ) VALUES (
      v_profile.drogueria_id,
      v_compra_id,
      v_detalle.producto_id,
      v_detalle.cantidad,
      v_detalle.costo_unitario,
      (v_detalle.cantidad * v_detalle.costo_unitario),
      v_lote_clean,
      v_fecha_venc
    );

    SELECT * INTO v_inv
    FROM public.inventario
    WHERE producto_id = v_detalle.producto_id
      AND drogueria_id = v_profile.drogueria_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Producto % no encontrado en inventario de esta droguería', v_detalle.producto_id;
    END IF;

    -- Asegurar que el stock existente previo quede respaldado en inventario_lotes si aún no existía
    IF NOT EXISTS (SELECT 1 FROM public.inventario_lotes WHERE inventario_id = v_inv.id) THEN
      INSERT INTO public.inventario_lotes (
        drogueria_id, inventario_id, producto_id, lote, fecha_vencimiento,
        cajas, blisters, unidades, costo_caja
      ) VALUES (
        v_profile.drogueria_id,
        v_inv.id,
        v_detalle.producto_id,
        COALESCE(NULLIF(trim(COALESCE(v_inv.lote, '')), ''), 'LOTE-INICIAL'),
        v_inv.fecha_vencimiento,
        GREATEST(COALESCE(v_inv.cajas, 0), 0),
        GREATEST(COALESCE(v_inv.blisters, 0), 0),
        GREATEST(COALESCE(v_inv.unidades, 0), 0),
        v_inv.precio_caja
      );
    END IF;

    -- Si ya existe exactamente ese mismo lote y fecha de vencimiento, sumar allí; si es nuevo, crear fila nueva
    SELECT * INTO v_existing_lote
    FROM public.inventario_lotes
    WHERE inventario_id = v_inv.id
      AND lote = v_lote_clean
      AND fecha_vencimiento IS NOT DISTINCT FROM v_fecha_venc
    FOR UPDATE
    LIMIT 1;

    IF FOUND THEN
      UPDATE public.inventario_lotes
      SET cajas = cajas + v_detalle.cantidad,
          costo_caja = CASE WHEN v_detalle.costo_unitario > 0 THEN v_detalle.costo_unitario ELSE costo_caja END,
          updated_at = now()
      WHERE id = v_existing_lote.id;
    ELSE
      INSERT INTO public.inventario_lotes (
        drogueria_id, inventario_id, producto_id, lote, fecha_vencimiento,
        cajas, blisters, unidades, costo_caja
      ) VALUES (
        v_profile.drogueria_id,
        v_inv.id,
        v_detalle.producto_id,
        v_lote_clean,
        v_fecha_venc,
        v_detalle.cantidad,
        0,
        0,
        CASE WHEN v_detalle.costo_unitario > 0 THEN v_detalle.costo_unitario ELSE v_inv.precio_caja END
      );
    END IF;

    -- Recalcular costos proporcionales de caja, blíster y unidad si llegó costo actualizado
    IF COALESCE(v_detalle.costo_unitario, 0) > 0 THEN
      v_bpc := GREATEST(COALESCE(v_inv.blisters_por_caja, 1), 1);
      v_upb := GREATEST(COALESCE(v_inv.unidades_por_blister, 1), 1);
      v_new_pb := ROUND(v_detalle.costo_unitario / v_bpc, 2);
      v_new_pu := ROUND(v_new_pb / v_upb, 2);

      UPDATE public.inventario
      SET precio_caja = v_detalle.costo_unitario,
          precio_blister = v_new_pb,
          precio_unidad = v_new_pu,
          updated_at = now()
      WHERE id = v_inv.id;
    END IF;

    PERFORM public.sync_inventario_from_lotes(v_inv.id);

    INSERT INTO public.auditoria_inventario (
      drogueria_id, inventario_id, accion, operador, valor_anterior, valor_nuevo, detalles
    ) VALUES (
      v_profile.drogueria_id,
      v_inv.id,
      'ENTRADA_COMPRA',
      COALESCE(v_profile.full_name, v_user_id::text),
      COALESCE(v_inv.cajas, 0)::text,
      (COALESCE(v_inv.cajas, 0) + v_detalle.cantidad)::text,
      'Compra Fac #' || p_numero_factura || ' | Lote: ' || v_lote_clean || COALESCE(' | FV: ' || v_fecha_venc::text, '')
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'compra_id', v_compra_id);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_compra_tx(UUID, TEXT, NUMERIC, TEXT, TEXT, UUID, public.compra_detalle_input[], UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_compra_tx(UUID, TEXT, NUMERIC, TEXT, TEXT, UUID, public.compra_detalle_input[], UUID, TEXT, TEXT) TO authenticated, service_role;

-- ============================================================================
-- 9. FACTURACIÓN POS: CONSECUTIVO PROPIO, DESTAPE AUTOMÁTICO, BLOQUEO DE VENCIDOS, FEFO Y PAGO MIXTO
-- ============================================================================
DROP FUNCTION IF EXISTS public.crear_factura_tx(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, NUMERIC, NUMERIC, UUID, UUID, public.factura_item_input[]);

CREATE OR REPLACE FUNCTION public.crear_factura_tx(
  p_cliente_nombre TEXT,
  p_cliente_documento TEXT,
  p_metodo_pago TEXT,
  p_tipo_venta TEXT,
  p_condicion_pago_dias INTEGER,
  p_orden_compra TEXT,
  p_descuento_porcentaje NUMERIC,
  p_iva_porcentaje NUMERIC,
  p_vendedor_id UUID,
  p_caja_sesion_id UUID,
  p_items public.factura_item_input[],
  p_pago_efectivo NUMERIC DEFAULT NULL,
  p_pago_tarjeta NUMERIC DEFAULT NULL,
  p_pago_transferencia NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile RECORD;
  v_drogueria_id UUID;
  v_operator_name TEXT;
  v_caja RECORD;
  v_factura_id UUID;
  v_factura_numero INTEGER;
  v_fecha_venc DATE := NULL;
  v_estado_pago TEXT;
  v_descuento_pct NUMERIC;
  v_iva_pct NUMERIC;
  v_subtotal_bruto NUMERIC := 0;
  v_subtotal_neto NUMERIC := 0;
  v_descuento_monto NUMERIC := 0;
  v_iva_total NUMERIC := 0;
  v_total NUMERIC := 0;
  v_item public.factura_item_input;
  v_inv RECORD;
  v_prod_nombre TEXT;
  v_pvp_caja NUMERIC;
  v_pvp_blister NUMERIC;
  v_pvp_unidad NUMERIC;
  v_line_base NUMERIC;
  v_line_net NUMERIC;
  v_bpc INTEGER;
  v_upb INTEGER;
  v_avail_c INTEGER;
  v_avail_b INTEGER;
  v_avail_u INTEGER;
  v_expired_units INTEGER;
  v_rc INTEGER;
  v_rb INTEGER;
  v_ru INTEGER;
  v_rem_c INTEGER;
  v_rem_b INTEGER;
  v_rem_u INTEGER;
  v_lot RECORD;
  v_take INTEGER;
  v_need_b INTEGER;
  v_open_b INTEGER;
  v_need_c INTEGER;
  v_open_c INTEGER;
  v_today DATE := (now() AT TIME ZONE 'America/Bogota')::date;
  v_inv_after RECORD;
  v_doc_clean TEXT;
  v_pe NUMERIC := 0;
  v_pt NUMERIC := 0;
  v_ptr NUMERIC := 0;
  v_metodo_final TEXT;
  v_active_methods INTEGER := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  SELECT id, role, status, drogueria_id, full_name INTO v_profile
  FROM public.profiles
  WHERE id = v_user_id;

  IF v_profile IS NULL OR v_profile.status <> 'activo' THEN
    RAISE EXCEPTION 'Cuenta inactiva o sin perfil';
  END IF;

  v_drogueria_id := v_profile.drogueria_id;
  IF v_drogueria_id IS NULL THEN
    RAISE EXCEPTION 'El usuario no pertenece a ninguna droguería';
  END IF;

  IF COALESCE(array_length(p_items, 1), 0) = 0 THEN
    RAISE EXCEPTION 'La factura debe tener al menos un producto';
  END IF;

  SELECT * INTO v_caja
  FROM public.caja_sesiones
  WHERE id = p_caja_sesion_id
    AND drogueria_id = v_drogueria_id;

  IF v_caja IS NULL OR v_caja.estado NOT IN ('abierta', 'abierto') THEN
    RAISE EXCEPTION 'La caja no está abierta para esta droguería';
  END IF;

  SELECT full_name INTO v_operator_name
  FROM public.profiles
  WHERE id = COALESCE(p_vendedor_id, v_user_id)
    AND drogueria_id = v_drogueria_id;

  IF v_operator_name IS NULL THEN
    v_operator_name := COALESCE(v_profile.full_name, 'Vendedor');
  END IF;

  -- Incremento atómico del consecutivo propio e independiente de esta droguería
  UPDATE public.droguerias
  SET ultimo_consecutivo_factura = GREATEST(
    ultimo_consecutivo_factura,
    COALESCE((SELECT MAX(numero) FROM public.facturas WHERE drogueria_id = v_drogueria_id), 0)
  ) + 1
  WHERE id = v_drogueria_id
  RETURNING ultimo_consecutivo_factura INTO v_factura_numero;

  v_descuento_pct := GREATEST(0, LEAST(100, COALESCE(p_descuento_porcentaje, 0)));
  v_iva_pct := GREATEST(0, LEAST(100, COALESCE(p_iva_porcentaje, 0)));

  IF p_tipo_venta = 'credito' AND COALESCE(p_condicion_pago_dias, 0) > 0 THEN
    v_fecha_venc := v_today + p_condicion_pago_dias;
  END IF;

  v_estado_pago := CASE WHEN p_tipo_venta = 'contado' THEN 'pagado' ELSE 'pendiente' END;
  v_doc_clean := NULLIF(TRIM(COALESCE(p_cliente_documento, '')), '');
  IF v_doc_clean IS NULL OR v_doc_clean = '000000000' THEN
    v_doc_clean := '222222222222';
  END IF;

  INSERT INTO public.facturas (
    drogueria_id,
    numero,
    cliente_nombre,
    cliente_documento,
    metodo_pago,
    tipo_venta,
    condicion_pago_dias,
    fecha_vencimiento,
    orden_compra,
    subtotal_bruto,
    descuento_porcentaje,
    descuento_monto,
    iva_porcentaje,
    iva_total,
    total,
    estado_pago,
    vendedor_id,
    caja_sesion_id
  ) VALUES (
    v_drogueria_id,
    v_factura_numero,
    COALESCE(NULLIF(TRIM(p_cliente_nombre), ''), 'Consumidor Final'),
    v_doc_clean,
    CASE WHEN p_metodo_pago IN ('efectivo','tarjeta','transferencia','mixto') THEN p_metodo_pago ELSE 'efectivo' END,
    p_tipo_venta,
    COALESCE(p_condicion_pago_dias, 0),
    v_fecha_venc,
    NULLIF(TRIM(COALESCE(p_orden_compra, '')), ''),
    0,
    v_descuento_pct,
    0,
    v_iva_pct,
    0,
    0,
    v_estado_pago,
    COALESCE(p_vendedor_id, v_user_id),
    p_caja_sesion_id
  )
  RETURNING id INTO v_factura_id;

  FOREACH v_item IN ARRAY p_items LOOP
    v_rc := COALESCE(v_item.cantidad_cajas, 0);
    v_rb := COALESCE(v_item.cantidad_blisters, 0);
    v_ru := COALESCE(v_item.cantidad_unidades, 0);

    IF v_rc < 0 OR v_rb < 0 OR v_ru < 0 OR (v_rc + v_rb + v_ru) <= 0 THEN
      RAISE EXCEPTION 'Cantidades inválidas en la factura';
    END IF;

    SELECT i.*, p.nombre AS producto_nombre
    INTO v_inv
    FROM public.inventario i
    JOIN public.productos p ON p.id = i.producto_id
    WHERE i.producto_id = v_item.producto_id
      AND i.drogueria_id = v_drogueria_id
    FOR UPDATE OF i;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Producto % no encontrado en inventario', v_item.producto_id;
    END IF;

    v_prod_nombre := v_inv.producto_nombre;
    v_bpc := GREATEST(COALESCE(v_inv.blisters_por_caja, 1), 1);
    v_upb := GREATEST(COALESCE(v_inv.unidades_por_blister, 1), 1);

    -- Respaldo automático en inventario_lotes si no hubiera filas aún
    IF NOT EXISTS (SELECT 1 FROM public.inventario_lotes WHERE inventario_id = v_inv.id) THEN
      INSERT INTO public.inventario_lotes (
        drogueria_id, inventario_id, producto_id, lote, fecha_vencimiento,
        cajas, blisters, unidades, costo_caja
      ) VALUES (
        v_drogueria_id,
        v_inv.id,
        v_inv.producto_id,
        COALESCE(NULLIF(trim(COALESCE(v_inv.lote, '')), ''), 'LOTE-INICIAL'),
        v_inv.fecha_vencimiento,
        GREATEST(COALESCE(v_inv.cajas, 0), 0),
        GREATEST(COALESCE(v_inv.blisters, 0), 0),
        GREATEST(COALESCE(v_inv.unidades, 0), 0),
        v_inv.precio_caja
      );
    END IF;

    -- Bloquear filas de lotes de este producto y calcular stock VIGENTE
    PERFORM 1 FROM public.inventario_lotes WHERE inventario_id = v_inv.id FOR UPDATE;

    SELECT
      COALESCE(SUM(cajas), 0),
      COALESCE(SUM(blisters), 0),
      COALESCE(SUM(unidades), 0)
    INTO v_avail_c, v_avail_b, v_avail_u
    FROM public.inventario_lotes
    WHERE inventario_id = v_inv.id
      AND (fecha_vencimiento IS NULL OR fecha_vencimiento >= v_today);

    SELECT COALESCE(SUM(cajas + blisters + unidades), 0)
    INTO v_expired_units
    FROM public.inventario_lotes
    WHERE inventario_id = v_inv.id
      AND fecha_vencimiento IS NOT NULL
      AND fecha_vencimiento < v_today;

    -- Validación de stock vigente con fraccionamiento hacia abajo (Caja -> Blíster -> Unidad)
    IF v_rc > v_avail_c
       OR (v_rc * v_bpc + v_rb) > (v_avail_c * v_bpc + v_avail_b)
       OR ((v_rc * v_bpc + v_rb) * v_upb + v_ru) > ((v_avail_c * v_bpc + v_avail_b) * v_upb + v_avail_u) THEN
      IF v_expired_units > 0 THEN
        RAISE EXCEPTION 'No se puede vender %: lote vencido bloqueado o stock vigente insuficiente', v_prod_nombre;
      ELSE
        RAISE EXCEPTION 'Stock insuficiente para %', v_prod_nombre;
      END IF;
    END IF;

    v_pvp_caja := CASE
      WHEN COALESCE(v_inv.precio_caja, 0) <= 0 THEN 0
      WHEN COALESCE(v_inv.porcentaje_ganancia, 0) > 0 AND v_inv.porcentaje_ganancia < 100
        THEN ROUND(v_inv.precio_caja / (1 - (v_inv.porcentaje_ganancia / 100.0)))
      ELSE ROUND(v_inv.precio_caja)
    END;

    v_pvp_blister := CASE
      WHEN COALESCE(v_inv.precio_blister, 0) <= 0 THEN 0
      WHEN COALESCE(v_inv.margen_blister, 0) > 0 AND v_inv.margen_blister < 100
        THEN ROUND(v_inv.precio_blister / (1 - (v_inv.margen_blister / 100.0)))
      ELSE ROUND(v_inv.precio_blister)
    END;

    v_pvp_unidad := CASE
      WHEN COALESCE(v_inv.precio_unidad, 0) <= 0 THEN 0
      WHEN COALESCE(v_inv.margen_unidad, 0) > 0 AND v_inv.margen_unidad < 100
        THEN ROUND(v_inv.precio_unidad / (1 - (v_inv.margen_unidad / 100.0)))
      ELSE ROUND(v_inv.precio_unidad)
    END;

    v_line_base := (v_pvp_caja * v_rc) + (v_pvp_blister * v_rb) + (v_pvp_unidad * v_ru);
    v_line_net := ROUND(v_line_base * (1 - (v_descuento_pct / 100.0)), 2);

    v_subtotal_bruto := v_subtotal_bruto + v_line_base;
    v_subtotal_neto := v_subtotal_neto + v_line_net;

    INSERT INTO public.factura_detalles (
      drogueria_id,
      factura_id,
      producto_id,
      cantidad_cajas,
      cantidad_blisters,
      cantidad_unidades,
      precio_unitario
    ) VALUES (
      v_drogueria_id,
      v_factura_id,
      v_item.producto_id,
      v_rc,
      v_rb,
      v_ru,
      v_line_net
    );

    -- Descuento FEFO sobre lotes vigentes con destape automático
    -- Paso 1: Cajas cerradas
    v_rem_c := v_rc;
    IF v_rem_c > 0 THEN
      FOR v_lot IN
        SELECT * FROM public.inventario_lotes
        WHERE inventario_id = v_inv.id
          AND (fecha_vencimiento IS NULL OR fecha_vencimiento >= v_today)
          AND cajas > 0
        ORDER BY fecha_vencimiento ASC NULLS LAST, created_at ASC
      LOOP
        EXIT WHEN v_rem_c <= 0;
        v_take := LEAST(v_lot.cajas, v_rem_c);
        UPDATE public.inventario_lotes
        SET cajas = cajas - v_take, updated_at = now()
        WHERE id = v_lot.id;
        v_rem_c := v_rem_c - v_take;
      END LOOP;
    END IF;

    -- Paso 2: Blísters (destapando cajas si hace falta)
    v_rem_b := v_rb;
    IF v_rem_b > 0 THEN
      FOR v_lot IN
        SELECT * FROM public.inventario_lotes
        WHERE inventario_id = v_inv.id
          AND (fecha_vencimiento IS NULL OR fecha_vencimiento >= v_today)
          AND (blisters > 0 OR cajas > 0)
        ORDER BY fecha_vencimiento ASC NULLS LAST, created_at ASC
      LOOP
        EXIT WHEN v_rem_b <= 0;
        IF v_lot.blisters < v_rem_b AND v_lot.cajas > 0 THEN
          v_need_b := v_rem_b - v_lot.blisters;
          v_open_c := LEAST(v_lot.cajas, CEIL(v_need_b::NUMERIC / v_bpc)::INTEGER);
          v_lot.cajas := v_lot.cajas - v_open_c;
          v_lot.blisters := v_lot.blisters + (v_open_c * v_bpc);
        END IF;
        v_take := LEAST(v_lot.blisters, v_rem_b);
        v_lot.blisters := v_lot.blisters - v_take;
        v_rem_b := v_rem_b - v_take;

        UPDATE public.inventario_lotes
        SET cajas = v_lot.cajas, blisters = v_lot.blisters, updated_at = now()
        WHERE id = v_lot.id;
      END LOOP;
    END IF;

    -- Paso 3: Unidades (destapando blísters y/o cajas si hace falta)
    v_rem_u := v_ru;
    IF v_rem_u > 0 THEN
      FOR v_lot IN
        SELECT * FROM public.inventario_lotes
        WHERE inventario_id = v_inv.id
          AND (fecha_vencimiento IS NULL OR fecha_vencimiento >= v_today)
          AND (unidades > 0 OR blisters > 0 OR cajas > 0)
        ORDER BY fecha_vencimiento ASC NULLS LAST, created_at ASC
      LOOP
        EXIT WHEN v_rem_u <= 0;

        v_take := LEAST(v_lot.unidades, v_rem_u);
        v_lot.unidades := v_lot.unidades - v_take;
        v_rem_u := v_rem_u - v_take;

        IF v_rem_u > 0 AND v_lot.blisters > 0 THEN
          v_need_b := CEIL(v_rem_u::NUMERIC / v_upb)::INTEGER;
          v_open_b := LEAST(v_lot.blisters, v_need_b);
          v_lot.blisters := v_lot.blisters - v_open_b;
          v_lot.unidades := v_lot.unidades + (v_open_b * v_upb);
          v_take := LEAST(v_lot.unidades, v_rem_u);
          v_lot.unidades := v_lot.unidades - v_take;
          v_rem_u := v_rem_u - v_take;
        END IF;

        IF v_rem_u > 0 AND v_lot.cajas > 0 THEN
          v_need_c := CEIL(v_rem_u::NUMERIC / (v_bpc * v_upb))::INTEGER;
          v_open_c := LEAST(v_lot.cajas, v_need_c);
          v_lot.cajas := v_lot.cajas - v_open_c;
          v_lot.blisters := v_lot.blisters + (v_open_c * v_bpc);

          v_need_b := CEIL(v_rem_u::NUMERIC / v_upb)::INTEGER;
          v_open_b := LEAST(v_lot.blisters, v_need_b);
          v_lot.blisters := v_lot.blisters - v_open_b;
          v_lot.unidades := v_lot.unidades + (v_open_b * v_upb);

          v_take := LEAST(v_lot.unidades, v_rem_u);
          v_lot.unidades := v_lot.unidades - v_take;
          v_rem_u := v_rem_u - v_take;
        END IF;

        UPDATE public.inventario_lotes
        SET cajas = v_lot.cajas,
            blisters = v_lot.blisters,
            unidades = v_lot.unidades,
            updated_at = now()
        WHERE id = v_lot.id;
      END LOOP;
    END IF;

    IF v_rem_c > 0 OR v_rem_b > 0 OR v_rem_u > 0 THEN
      RAISE EXCEPTION 'Stock vigente insuficiente para %', v_prod_nombre;
    END IF;

    PERFORM public.sync_inventario_from_lotes(v_inv.id);
    SELECT cajas, blisters, unidades INTO v_inv_after FROM public.inventario WHERE id = v_inv.id;

    INSERT INTO public.auditoria_inventario (
      drogueria_id,
      inventario_id,
      operador,
      accion,
      campo_modificado,
      valor_anterior,
      valor_nuevo,
      detalles
    ) VALUES (
      v_drogueria_id,
      v_inv.id,
      v_operator_name,
      'VENTA',
      'stock',
      jsonb_build_object('cajas', v_inv.cajas, 'blisters', v_inv.blisters, 'unidades', v_inv.unidades)::text,
      jsonb_build_object('cajas', v_inv_after.cajas, 'blisters', v_inv_after.blisters, 'unidades', v_inv_after.unidades)::text,
      'Venta Factura #' || v_factura_numero || ' — ' || COALESCE(p_cliente_nombre, 'Consumidor Final') || ' (' || p_tipo_venta || ')'
    );
  END LOOP;

  v_descuento_monto := ROUND(v_subtotal_bruto - v_subtotal_neto, 2);
  v_iva_total := ROUND(v_subtotal_neto * (v_iva_pct / 100.0));
  v_total := v_subtotal_neto + v_iva_total;

  -- Validación exacta y normalización de Pago Mixto
  IF p_tipo_venta = 'credito' THEN
    v_pe := 0;
    v_pt := 0;
    v_ptr := 0;
    v_metodo_final := CASE
      WHEN p_metodo_pago IN ('efectivo', 'tarjeta', 'transferencia') THEN p_metodo_pago
      ELSE 'efectivo'
    END;
  ELSIF p_metodo_pago = 'mixto' THEN
    v_pe := GREATEST(0, COALESCE(p_pago_efectivo, 0));
    v_pt := GREATEST(0, COALESCE(p_pago_tarjeta, 0));
    v_ptr := GREATEST(0, COALESCE(p_pago_transferencia, 0));

    IF COALESCE(p_pago_efectivo, 0) < 0 OR COALESCE(p_pago_tarjeta, 0) < 0 OR COALESCE(p_pago_transferencia, 0) < 0 THEN
      RAISE EXCEPTION 'Los montos del pago mixto no pueden ser negativos';
    END IF;

    IF ABS((v_pe + v_pt + v_ptr) - v_total) > 1 THEN
      RAISE EXCEPTION 'La suma del pago mixto ($%) no coincide con el total de la factura ($%)', ROUND(v_pe + v_pt + v_ptr, 0), ROUND(v_total, 0);
    END IF;

    v_active_methods := (CASE WHEN v_pe > 0 THEN 1 ELSE 0 END)
                      + (CASE WHEN v_pt > 0 THEN 1 ELSE 0 END)
                      + (CASE WHEN v_ptr > 0 THEN 1 ELSE 0 END);

    IF v_active_methods <= 1 THEN
      IF v_pt > 0 THEN v_metodo_final := 'tarjeta';
      ELSIF v_ptr > 0 THEN v_metodo_final := 'transferencia';
      ELSE v_metodo_final := 'efectivo';
      END IF;
    ELSE
      v_metodo_final := 'mixto';
    END IF;
  ELSE
    v_metodo_final := CASE
      WHEN p_metodo_pago IN ('efectivo', 'tarjeta', 'transferencia') THEN p_metodo_pago
      ELSE 'efectivo'
    END;
    v_pe := CASE WHEN v_metodo_final = 'efectivo' THEN v_total ELSE 0 END;
    v_pt := CASE WHEN v_metodo_final = 'tarjeta' THEN v_total ELSE 0 END;
    v_ptr := CASE WHEN v_metodo_final = 'transferencia' THEN v_total ELSE 0 END;
  END IF;

  UPDATE public.facturas
  SET subtotal_bruto = v_subtotal_bruto,
      descuento_monto = v_descuento_monto,
      iva_total = v_iva_total,
      total = v_total,
      metodo_pago = v_metodo_final,
      pago_efectivo = v_pe,
      pago_tarjeta = v_pt,
      pago_transferencia = v_ptr
  WHERE id = v_factura_id;

  RETURN jsonb_build_object(
    'id', v_factura_id,
    'numero', v_factura_numero,
    'total', v_total,
    'metodo_pago', v_metodo_final,
    'pago_efectivo', v_pe,
    'pago_tarjeta', v_pt,
    'pago_transferencia', v_ptr
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crear_factura_tx(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, NUMERIC, NUMERIC, UUID, UUID, public.factura_item_input[], NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_factura_tx(TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, NUMERIC, NUMERIC, UUID, UUID, public.factura_item_input[], NUMERIC, NUMERIC, NUMERIC) TO authenticated, service_role;

-- ============================================================================
-- 10. ANULACIÓN DE FACTURAS SINCRONIZADA CON LOTES
-- ============================================================================
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
  v_lote RECORD;
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

      SELECT * INTO v_lote
      FROM public.inventario_lotes
      WHERE inventario_id = v_inv.id
      ORDER BY
        CASE WHEN fecha_vencimiento IS NULL OR fecha_vencimiento >= (now() AT TIME ZONE 'America/Bogota')::date THEN 0 ELSE 1 END ASC,
        fecha_vencimiento ASC NULLS LAST,
        created_at DESC
      LIMIT 1
      FOR UPDATE;

      IF FOUND THEN
        v_new_unidades := COALESCE(v_lote.unidades, 0) + COALESCE(v_det.cantidad_unidades, 0);
        v_new_blisters := COALESCE(v_lote.blisters, 0) + COALESCE(v_det.cantidad_blisters, 0);
        v_new_cajas := COALESCE(v_lote.cajas, 0) + COALESCE(v_det.cantidad_cajas, 0);

        IF v_upb > 1 AND v_new_unidades >= v_upb THEN
          v_new_blisters := v_new_blisters + (v_new_unidades / v_upb);
          v_new_unidades := v_new_unidades % v_upb;
        END IF;

        IF v_bpc > 1 AND v_new_blisters >= v_bpc THEN
          v_new_cajas := v_new_cajas + (v_new_blisters / v_bpc);
          v_new_blisters := v_new_blisters % v_bpc;
        END IF;

        UPDATE public.inventario_lotes
        SET cajas = v_new_cajas,
            blisters = v_new_blisters,
            unidades = v_new_unidades,
            updated_at = now()
        WHERE id = v_lote.id;

        PERFORM public.sync_inventario_from_lotes(v_inv.id);
      ELSE
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

-- ============================================================================
-- 11. CIERRE DE CAJA CON SOPORTE EXACTO DE PAGO MIXTO
-- ============================================================================
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

  SELECT COALESCE(SUM(
    CASE
      WHEN metodo_pago = 'mixto' THEN COALESCE(pago_efectivo, 0)
      WHEN metodo_pago = 'efectivo' THEN COALESCE(NULLIF(pago_efectivo, 0), total, 0)
      ELSE 0
    END
  ), 0) INTO v_ventas_contado
  FROM public.facturas
  WHERE caja_sesion_id = p_caja_id
    AND estado_pago = 'pagado'
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
