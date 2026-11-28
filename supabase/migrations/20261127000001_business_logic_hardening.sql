-- Correcciones de lógica de negocio: caja, IVA por producto, precios exactos,
-- trazabilidad lote -> venta, unicidad por droguería e índices.
-- Escrita contra el esquema en vivo del 27-nov-2026.

-- 1. Columnas nuevas.
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS iva_porcentaje numeric NOT NULL DEFAULT 0;
ALTER TABLE public.productos DROP CONSTRAINT IF EXISTS productos_iva_porcentaje_check;
ALTER TABLE public.productos
  ADD CONSTRAINT productos_iva_porcentaje_check CHECK (iva_porcentaje IN (0, 5, 19));

ALTER TABLE public.factura_detalles
  ADD COLUMN IF NOT EXISTS iva_porcentaje numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iva_monto numeric NOT NULL DEFAULT 0;
ALTER TABLE public.factura_detalles DROP CONSTRAINT IF EXISTS factura_detalles_iva_porcentaje_check;
ALTER TABLE public.factura_detalles
  ADD CONSTRAINT factura_detalles_iva_porcentaje_check CHECK (iva_porcentaje IN (0, 5, 19));
ALTER TABLE public.factura_detalles DROP CONSTRAINT IF EXISTS factura_detalles_iva_monto_check;
ALTER TABLE public.factura_detalles
  ADD CONSTRAINT factura_detalles_iva_monto_check CHECK (iva_monto >= 0);

-- Facturas antiguas con IVA global: se reparte por línea con la misma tarifa.
UPDATE public.factura_detalles d
SET iva_porcentaje = f.iva_porcentaje,
    iva_monto = round(d.precio_unitario * f.iva_porcentaje / 100)
FROM public.facturas f
WHERE f.id = d.factura_id
  AND f.iva_porcentaje IN (5, 19)
  AND d.iva_porcentaje = 0;

-- Tope de descuento para vendedores, configurable por droguería.
ALTER TABLE public.droguerias
  ADD COLUMN IF NOT EXISTS descuento_max_vendedor numeric NOT NULL DEFAULT 10;
ALTER TABLE public.droguerias DROP CONSTRAINT IF EXISTS droguerias_descuento_max_vendedor_check;
ALTER TABLE public.droguerias
  ADD CONSTRAINT droguerias_descuento_max_vendedor_check
  CHECK (descuento_max_vendedor >= 0 AND descuento_max_vendedor <= 100);

-- 2. Consistencia de inventario. La app ya trata 0 como 1 en las conversiones;
-- se normaliza el dato antes de exigirlo.
UPDATE public.inventario SET blisters_por_caja = 1
WHERE blisters_por_caja IS NULL OR blisters_por_caja < 1;
UPDATE public.inventario SET unidades_por_blister = 1
WHERE unidades_por_blister IS NULL OR unidades_por_blister < 1;

UPDATE public.inventario SET cajas = 0 WHERE cajas IS NULL;
UPDATE public.inventario SET blisters = 0 WHERE blisters IS NULL;
UPDATE public.inventario SET unidades = 0 WHERE unidades IS NULL;
ALTER TABLE public.inventario
  ALTER COLUMN cajas SET NOT NULL,
  ALTER COLUMN blisters SET NOT NULL,
  ALTER COLUMN unidades SET NOT NULL,
  ALTER COLUMN blisters_por_caja SET NOT NULL,
  ALTER COLUMN unidades_por_blister SET NOT NULL;

ALTER TABLE public.inventario DROP CONSTRAINT IF EXISTS inventario_conversiones_positivas;
ALTER TABLE public.inventario
  ADD CONSTRAINT inventario_conversiones_positivas
  CHECK (blisters_por_caja >= 1 AND unidades_por_blister >= 1);

ALTER TABLE public.inventario DROP CONSTRAINT IF EXISTS inventario_stock_no_negativo;
ALTER TABLE public.inventario
  ADD CONSTRAINT inventario_stock_no_negativo
  CHECK (cajas >= 0 AND blisters >= 0 AND unidades >= 0);

-- 3. Unicidad por droguería. El código de barras y el laboratorio eran únicos en
-- toda la plataforma, lo que impedía que dos droguerías tuvieran el mismo producto.
ALTER TABLE public.productos DROP CONSTRAINT IF EXISTS productos_codigo_key;
CREATE UNIQUE INDEX IF NOT EXISTS ux_productos_tenant_codigo
  ON public.productos (drogueria_id, codigo);

ALTER TABLE public.laboratorios DROP CONSTRAINT IF EXISTS laboratorios_nombre_key;
CREATE UNIQUE INDEX IF NOT EXISTS ux_laboratorios_tenant_nombre
  ON public.laboratorios (drogueria_id, nombre);

CREATE UNIQUE INDEX IF NOT EXISTS ux_cronograma_tenant_usuario_fecha
  ON public.cronogramas (drogueria_id, usuario_id, fecha);

-- Una sola caja abierta por droguería, también con solicitudes simultáneas.
CREATE UNIQUE INDEX IF NOT EXISTS ux_caja_abierta_por_tenant
  ON public.caja_sesiones (drogueria_id)
  WHERE estado IN ('abierta', 'abierto');

-- 4. Índices de rutas críticas (cierre de caja, reportes, FEFO).
CREATE INDEX IF NOT EXISTS idx_facturas_tenant_created_at ON public.facturas (drogueria_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_facturas_caja_sesion_id ON public.facturas (caja_sesion_id);
CREATE INDEX IF NOT EXISTS idx_factura_abonos_caja_sesion_id ON public.factura_abonos (caja_sesion_id);
CREATE INDEX IF NOT EXISTS idx_gastos_caja_sesion_id ON public.gastos (caja_sesion_id);
CREATE INDEX IF NOT EXISTS idx_compras_caja_sesion_id ON public.compras (caja_sesion_id);
CREATE INDEX IF NOT EXISTS idx_compra_detalles_compra_id ON public.compra_detalles (compra_id);
CREATE INDEX IF NOT EXISTS idx_compra_detalles_producto_id ON public.compra_detalles (producto_id);
CREATE INDEX IF NOT EXISTS idx_inventario_lotes_fefo ON public.inventario_lotes (inventario_id, fecha_vencimiento, created_at);
CREATE INDEX IF NOT EXISTS idx_logs_tenant_created_at ON public.logs_actividad (drogueria_id, created_at DESC);
-- Duplicado exacto del índice UNIQUE api_keys_key_hash_key.
DROP INDEX IF EXISTS public.idx_api_keys_key_hash;

-- 5. Cartera: fecha de Colombia y total sin descuento coherente con IVA por línea.
CREATE OR REPLACE VIEW public.vista_cartera WITH (security_invoker = true) AS
SELECT f.id,
       f.numero,
       f.created_at,
       f.fecha_vencimiento,
       f.tipo_venta,
       f.condicion_pago_dias,
       f.orden_compra,
       f.subtotal_bruto,
       f.descuento_porcentaje,
       f.descuento_monto,
       f.iva_total,
       f.total AS total_con_descuento,
       round(
         COALESCE(f.subtotal_bruto, 0)
         + COALESCE(
             COALESCE(f.iva_total, 0) * f.subtotal_bruto
               / NULLIF(f.subtotal_bruto - COALESCE(f.descuento_monto, 0), 0),
             COALESCE(f.iva_total, 0)
           )
       ) AS total_sin_descuento,
       f.estado_pago,
       f.metodo_pago,
       f.cliente_nombre,
       f.cliente_documento,
       p.full_name AS vendedor,
       CASE
         WHEN f.fecha_vencimiento IS NULL THEN 'contado'
         WHEN f.fecha_vencimiento >= (now() AT TIME ZONE 'America/Bogota')::date THEN 'vigente'
         ELSE 'vencido'
       END AS estado_plazo,
       f.fecha_vencimiento - (now() AT TIME ZONE 'America/Bogota')::date AS dias_restantes,
       -- Columnas nuevas al final (CREATE OR REPLACE VIEW solo permite agregar al final):
       -- el POS lee la cartera en una sola consulta sin cruzar con facturas.
       COALESCE(f.monto_abonado, 0) AS monto_abonado,
       GREATEST(COALESCE(f.total, 0) - COALESCE(f.monto_abonado, 0), 0) AS saldo_pendiente
FROM public.facturas f
LEFT JOIN public.profiles p ON f.vendedor_id = p.id
WHERE f.tipo_venta = 'credito';

-- 6. Precio de venta idéntico al del POS (src/lib/utils.ts -> calculatePV).
CREATE OR REPLACE FUNCTION public.pos_precio_venta(p_costo numeric, p_margen numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN COALESCE(p_costo, 0) <= 0 THEN 0
    WHEN COALESCE(p_margen, 0) >= 100 THEN 0
    WHEN COALESCE(p_margen, 0) <= 0 THEN round(p_costo)
    ELSE round(round(p_costo * 100) / (100 - p_margen))
  END
$$;

-- 7. Inventario: valida rol, droguería y laboratorio; bloquea filas antes de escribir.
CREATE OR REPLACE FUNCTION public.upsert_inventario_v2_tx(
  p_producto_id uuid DEFAULT NULL,
  p_codigo text DEFAULT NULL,
  p_nombre text DEFAULT NULL,
  p_principio_activo text DEFAULT NULL,
  p_laboratorio_id uuid DEFAULT NULL,
  p_inventario_id uuid DEFAULT NULL,
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
  p_fecha_vencimiento text DEFAULT NULL,
  p_lote text DEFAULT NULL,
  p_registro_invima text DEFAULT NULL,
  p_seccion text DEFAULT NULL,
  p_ubicacion text DEFAULT NULL,
  p_blisters_por_caja integer DEFAULT 1,
  p_unidades_por_blister integer DEFAULT 1,
  -- NULL = no cambiar. Antes se guardaban con un UPDATE aparte que podía fallar
  -- después de guardar el inventario.
  p_iva_porcentaje numeric DEFAULT NULL,
  p_requiere_formula boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile record;
  v_product_id uuid := p_producto_id;
  v_inventory_id uuid := p_inventario_id;
  v_codigo text := trim(COALESCE(p_codigo, ''));
  v_nombre text := trim(COALESCE(p_nombre, ''));
  v_result jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF;

  SELECT role, status, drogueria_id INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND OR v_profile.status <> 'activo'
     OR v_profile.role NOT IN ('admin', 'superadmin')
     OR v_profile.drogueria_id IS NULL THEN
    RAISE EXCEPTION 'Solo un administrador de sede puede modificar inventario';
  END IF;

  IF v_codigo = '' OR v_nombre = '' THEN
    RAISE EXCEPTION 'Código y nombre son obligatorios';
  END IF;
  IF COALESCE(p_cajas, 0) < 0 OR COALESCE(p_blisters, 0) < 0 OR COALESCE(p_unidades, 0) < 0
     OR COALESCE(p_stock_minimo, 0) < 0
     OR COALESCE(p_blisters_por_caja, 1) < 1 OR COALESCE(p_unidades_por_blister, 1) < 1
     OR COALESCE(p_precio_caja, 0) < 0 OR COALESCE(p_precio_blister, 0) < 0 OR COALESCE(p_precio_unidad, 0) < 0
     OR COALESCE(p_porcentaje_ganancia, 0) < 0 OR COALESCE(p_porcentaje_ganancia, 0) >= 100
     OR COALESCE(p_margen_blister, 0) < 0 OR COALESCE(p_margen_blister, 0) >= 100
     OR COALESCE(p_margen_unidad, 0) < 0 OR COALESCE(p_margen_unidad, 0) >= 100 THEN
    RAISE EXCEPTION 'Cantidades, precios, conversiones o márgenes inválidos';
  END IF;
  IF p_iva_porcentaje IS NOT NULL AND p_iva_porcentaje NOT IN (0, 5, 19) THEN
    RAISE EXCEPTION 'La tarifa de IVA debe ser 0%%, 5%% o 19%%';
  END IF;

  IF p_laboratorio_id IS NOT NULL THEN
    PERFORM 1 FROM public.laboratorios
    WHERE id = p_laboratorio_id AND drogueria_id = v_profile.drogueria_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Laboratorio no encontrado en esta droguería'; END IF;
  END IF;

  IF v_product_id IS NOT NULL THEN
    PERFORM 1 FROM public.productos
    WHERE id = v_product_id AND drogueria_id = v_profile.drogueria_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado en esta droguería'; END IF;

    -- Edición del código de barras (antes se ignoraba sin avisar).
    IF EXISTS (
      SELECT 1 FROM public.productos
      WHERE drogueria_id = v_profile.drogueria_id AND codigo = v_codigo AND id <> v_product_id
    ) THEN
      RAISE EXCEPTION 'Ya existe otro producto con el código %', v_codigo;
    END IF;
    UPDATE public.productos SET codigo = v_codigo
    WHERE id = v_product_id AND codigo IS DISTINCT FROM v_codigo;
  ELSE
    SELECT id INTO v_product_id
    FROM public.productos
    WHERE drogueria_id = v_profile.drogueria_id AND codigo = v_codigo
    FOR UPDATE;

    IF v_product_id IS NULL THEN
      INSERT INTO public.productos (drogueria_id, codigo, nombre, principio_activo, laboratorio_id)
      VALUES (v_profile.drogueria_id, v_codigo, v_nombre, p_principio_activo, p_laboratorio_id)
      RETURNING id INTO v_product_id;
    END IF;
  END IF;

  IF v_inventory_id IS NULL THEN
    SELECT id INTO v_inventory_id
    FROM public.inventario
    WHERE drogueria_id = v_profile.drogueria_id AND producto_id = v_product_id
    FOR UPDATE;
  ELSE
    PERFORM 1 FROM public.inventario
    WHERE id = v_inventory_id
      AND drogueria_id = v_profile.drogueria_id
      AND producto_id = v_product_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Inventario no encontrado en esta droguería'; END IF;
  END IF;

  IF v_inventory_id IS NOT NULL THEN
    PERFORM 1 FROM public.inventario_lotes WHERE inventario_id = v_inventory_id
    ORDER BY fecha_vencimiento NULLS LAST, created_at, id
    FOR UPDATE;
  END IF;

  v_result := public.upsert_inventario_tx(
    v_product_id, v_codigo, v_nombre, p_principio_activo, p_laboratorio_id,
    v_inventory_id, COALESCE(p_cajas, 0), COALESCE(p_blisters, 0), COALESCE(p_unidades, 0),
    COALESCE(p_stock_minimo, 2), COALESCE(p_precio_caja, 0), COALESCE(p_precio_blister, 0),
    COALESCE(p_precio_unidad, 0), COALESCE(p_porcentaje_ganancia, 0), COALESCE(p_margen_blister, 0),
    COALESCE(p_margen_unidad, 0), p_fecha_vencimiento, p_lote, p_registro_invima, p_seccion,
    p_ubicacion, COALESCE(p_blisters_por_caja, 1), COALESCE(p_unidades_por_blister, 1)
  );

  IF p_iva_porcentaje IS NOT NULL OR p_requiere_formula IS NOT NULL THEN
    UPDATE public.productos
    SET iva_porcentaje = COALESCE(p_iva_porcentaje, iva_porcentaje),
        requiere_formula = COALESCE(p_requiere_formula, requiere_formula)
    WHERE id = v_product_id
      AND (iva_porcentaje IS DISTINCT FROM COALESCE(p_iva_porcentaje, iva_porcentaje)
           OR requiere_formula IS DISTINCT FROM COALESCE(p_requiere_formula, requiere_formula));
  END IF;

  RETURN v_result;
END;
$$;

-- 8-10. Venta y anulación V2: ver 20261127000002_free_tier_architecture.sql (versión
-- liviana con traza de lotes en factura_detalles.lotes_consumidos).

-- 10b. Baja de lote: mismo orden de bloqueo que las ventas (inventario y luego lote)
-- para evitar bloqueos mutuos, y validación de droguería antes de bloquear.
CREATE OR REPLACE FUNCTION public.dar_baja_lote_tx(
  p_lote_id uuid,
  p_motivo text DEFAULT 'Baja por vencimiento o deterioro'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile record;
  v_inventario_id uuid;
  v_lote record;
  v_prod_nombre text;
  v_motivo_clean text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF;

  SELECT role, status, drogueria_id, full_name INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND OR v_profile.status <> 'activo' THEN RAISE EXCEPTION 'Cuenta inactiva o sin perfil'; END IF;
  IF v_profile.role NOT IN ('admin', 'superadmin') OR v_profile.drogueria_id IS NULL THEN
    RAISE EXCEPTION 'Solo un administrador puede dar de baja lotes';
  END IF;

  SELECT inventario_id INTO v_inventario_id
  FROM public.inventario_lotes
  WHERE id = p_lote_id AND drogueria_id = v_profile.drogueria_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote no encontrado en esta droguería'; END IF;

  PERFORM 1 FROM public.inventario WHERE id = v_inventario_id FOR UPDATE;
  SELECT * INTO v_lote FROM public.inventario_lotes WHERE id = p_lote_id FOR UPDATE;

  IF (v_lote.cajas + v_lote.blisters + v_lote.unidades) = 0 THEN
    RAISE EXCEPTION 'Este lote ya se encuentra en cero';
  END IF;

  SELECT nombre INTO v_prod_nombre FROM public.productos WHERE id = v_lote.producto_id;
  v_motivo_clean := COALESCE(NULLIF(trim(COALESCE(p_motivo, '')), ''), 'Baja por vencimiento o deterioro');

  UPDATE public.inventario_lotes
  SET cajas = 0, blisters = 0, unidades = 0, updated_at = now()
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
    v_lote.inventario_id::text
  );

  RETURN jsonb_build_object('success', true, 'lote_id', p_lote_id);
END;
$$;

-- 11. Gasto: monto positivo y caja abierta de la misma droguería.
CREATE OR REPLACE FUNCTION public.registrar_gasto_tx(
  p_caja_sesion_id uuid,
  p_concepto text,
  p_monto numeric,
  p_tipo text,
  p_comprobante text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile record;
  v_gasto_id uuid;
  v_tipo text := COALESCE(NULLIF(trim(COALESCE(p_tipo, '')), ''), 'operativo');
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF;
  SELECT role, status, drogueria_id INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND OR v_profile.status <> 'activo' OR v_profile.drogueria_id IS NULL THEN
    RAISE EXCEPTION 'Cuenta inactiva o sin droguería';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor a cero'; END IF;
  IF NULLIF(trim(COALESCE(p_concepto, '')), '') IS NULL THEN RAISE EXCEPTION 'El concepto es obligatorio'; END IF;
  IF v_tipo NOT IN ('caja_chica', 'operativo', 'nomina') THEN RAISE EXCEPTION 'Tipo de gasto inválido'; END IF;

  PERFORM 1 FROM public.caja_sesiones
  WHERE id = p_caja_sesion_id
    AND drogueria_id = v_profile.drogueria_id
    AND estado IN ('abierta', 'abierto')
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La caja no está abierta para esta droguería'; END IF;

  INSERT INTO public.gastos (drogueria_id, caja_sesion_id, concepto, monto, tipo, comprobante)
  VALUES (
    v_profile.drogueria_id, p_caja_sesion_id, trim(p_concepto), p_monto, v_tipo,
    NULLIF(trim(COALESCE(p_comprobante, '')), '')
  )
  RETURNING id INTO v_gasto_id;

  RETURN jsonb_build_object('success', true, 'gasto_id', v_gasto_id);
END;
$$;

-- 12. Abono: método válido, factura y caja de la misma droguería, caja abierta.
CREATE OR REPLACE FUNCTION public.registrar_abono_factura_tx(
  p_factura_id uuid,
  p_caja_sesion_id uuid,
  p_monto numeric,
  p_metodo_pago text DEFAULT 'efectivo',
  p_notas text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile record;
  v_factura record;
  v_saldo numeric;
  v_nuevo_abonado numeric;
  v_nuevo_estado text;
  v_metodo text := COALESCE(NULLIF(trim(COALESCE(p_metodo_pago, '')), ''), 'efectivo');
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF;
  SELECT role, status, drogueria_id INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND OR v_profile.status <> 'activo' OR v_profile.drogueria_id IS NULL THEN
    RAISE EXCEPTION 'Cuenta inactiva o sin droguería';
  END IF;
  -- El POS llama esta RPC directo desde el navegador: la suspensión se valida aquí.
  IF v_profile.role <> 'superadmin' AND EXISTS (
    SELECT 1 FROM public.droguerias d
    WHERE d.id = v_profile.drogueria_id
      AND (d.estado = 'suspendido'
           OR (d.fecha_vencimiento IS NOT NULL
               AND d.fecha_vencimiento < (now() AT TIME ZONE 'America/Bogota')::date))
  ) THEN
    RAISE EXCEPTION 'El servicio de la droguería está suspendido o vencido';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 THEN RAISE EXCEPTION 'El monto del abono debe ser mayor a cero'; END IF;
  IF p_monto > 999999999999 THEN RAISE EXCEPTION 'El monto del abono no es válido'; END IF;
  IF length(COALESCE(p_notas, '')) > 300 THEN RAISE EXCEPTION 'Las notas admiten máximo 300 caracteres'; END IF;
  IF v_metodo NOT IN ('efectivo', 'tarjeta', 'transferencia') THEN RAISE EXCEPTION 'Método de pago inválido'; END IF;

  SELECT * INTO v_factura FROM public.facturas
  WHERE id = p_factura_id AND drogueria_id = v_profile.drogueria_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Factura no encontrada en esta droguería'; END IF;
  IF v_factura.estado_pago <> 'pendiente' THEN
    RAISE EXCEPTION 'Solo se pueden registrar abonos a facturas pendientes';
  END IF;

  PERFORM 1 FROM public.caja_sesiones
  WHERE id = p_caja_sesion_id
    AND drogueria_id = v_profile.drogueria_id
    AND estado IN ('abierta', 'abierto')
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La caja no está abierta para esta droguería'; END IF;

  v_saldo := GREATEST(COALESCE(v_factura.total, 0) - COALESCE(v_factura.monto_abonado, 0), 0);
  IF p_monto > v_saldo + 0.01 THEN RAISE EXCEPTION 'El abono supera el saldo pendiente'; END IF;

  v_nuevo_abonado := LEAST(COALESCE(v_factura.total, 0), COALESCE(v_factura.monto_abonado, 0) + p_monto);
  v_nuevo_estado := CASE WHEN v_nuevo_abonado >= COALESCE(v_factura.total, 0) - 0.01 THEN 'pagado' ELSE 'pendiente' END;

  INSERT INTO public.factura_abonos (
    drogueria_id, factura_id, caja_sesion_id, monto, metodo_pago, notas, registrado_por
  ) VALUES (
    v_profile.drogueria_id, p_factura_id, p_caja_sesion_id, p_monto, v_metodo,
    NULLIF(trim(COALESCE(p_notas, '')), ''), v_user_id
  );

  UPDATE public.facturas
  SET monto_abonado = v_nuevo_abonado,
      estado_pago = v_nuevo_estado,
      metodo_pago = CASE WHEN v_nuevo_estado = 'pagado' THEN v_metodo ELSE metodo_pago END,
      caja_sesion_id = CASE WHEN v_nuevo_estado = 'pagado' THEN p_caja_sesion_id ELSE caja_sesion_id END
  WHERE id = p_factura_id;

  INSERT INTO public.logs_actividad (
    drogueria_id, usuario_id, accion, detalles, tipo_entidad, entidad_id
  ) VALUES (
    v_profile.drogueria_id, v_user_id, 'ABONO_FACTURA',
    'Abono de $' || round(p_monto) || ' a la venta #' || v_factura.numero || ' (' || v_metodo || ')',
    'FACTURA', p_factura_id::text
  );

  RETURN jsonb_build_object(
    'factura_id', p_factura_id,
    'monto_abonado', v_nuevo_abonado,
    'saldo_pendiente', GREATEST(COALESCE(v_factura.total, 0) - v_nuevo_abonado, 0),
    'estado_pago', v_nuevo_estado
  );
END;
$$;

-- 13. Cierre de caja: escribe 'cerrado' (lo que exige la restricción de la tabla;
-- antes escribía 'cerrada' y el cierre fallaba) y filtra todas las sumas por droguería.
CREATE OR REPLACE FUNCTION public.cerrar_caja_tx(
  p_caja_id uuid,
  p_monto_cierre numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile record;
  v_caja record;
  v_ventas numeric := 0;
  v_abonos numeric := 0;
  v_gastos numeric := 0;
  v_compras numeric := 0;
  v_esperado numeric := 0;
  v_diferencia numeric := 0;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF;
  IF p_monto_cierre IS NULL OR p_monto_cierre < 0 THEN RAISE EXCEPTION 'Monto de cierre inválido'; END IF;

  SELECT role, status, drogueria_id INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND OR v_profile.status <> 'activo' OR v_profile.drogueria_id IS NULL THEN
    RAISE EXCEPTION 'Cuenta inactiva o sin droguería';
  END IF;

  SELECT * INTO v_caja FROM public.caja_sesiones
  WHERE id = p_caja_id AND drogueria_id = v_profile.drogueria_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Caja no encontrada en esta droguería'; END IF;
  IF v_caja.estado NOT IN ('abierta', 'abierto') THEN RAISE EXCEPTION 'Esta caja ya se encuentra cerrada'; END IF;

  SELECT COALESCE(sum(CASE
           WHEN metodo_pago = 'mixto' THEN COALESCE(pago_efectivo, 0)
           WHEN metodo_pago = 'efectivo' THEN COALESCE(NULLIF(pago_efectivo, 0), total, 0)
           ELSE 0
         END), 0)
  INTO v_ventas
  FROM public.facturas
  WHERE caja_sesion_id = p_caja_id
    AND drogueria_id = v_caja.drogueria_id
    AND estado_pago = 'pagado'
    AND (tipo_venta = 'contado' OR COALESCE(monto_abonado, 0) = 0);

  SELECT COALESCE(sum(a.monto), 0) INTO v_abonos
  FROM public.factura_abonos a
  JOIN public.facturas f ON f.id = a.factura_id
  WHERE a.caja_sesion_id = p_caja_id
    AND a.drogueria_id = v_caja.drogueria_id
    AND a.metodo_pago = 'efectivo'
    AND f.estado_pago <> 'anulada';

  SELECT COALESCE(sum(monto), 0) INTO v_gastos
  FROM public.gastos
  WHERE caja_sesion_id = p_caja_id AND drogueria_id = v_caja.drogueria_id;

  SELECT COALESCE(sum(total), 0) INTO v_compras
  FROM public.compras
  WHERE caja_sesion_id = p_caja_id
    AND drogueria_id = v_caja.drogueria_id
    AND estado_pago = 'pagado'
    AND metodo_pago = 'efectivo';

  v_esperado := COALESCE(v_caja.monto_apertura, 0) + v_ventas + v_abonos - v_gastos - v_compras;
  v_diferencia := p_monto_cierre - v_esperado;

  UPDATE public.caja_sesiones
  SET estado = 'cerrado',
      monto_cierre = p_monto_cierre,
      monto_esperado = v_esperado,
      diferencia = v_diferencia,
      fecha_cierre = now(),
      cerrado_por = v_user_id
  WHERE id = p_caja_id;

  INSERT INTO public.logs_actividad (
    drogueria_id, usuario_id, accion, detalles, tipo_entidad, entidad_id
  ) VALUES (
    v_caja.drogueria_id, v_user_id, 'CIERRE_CAJA',
    'Cierre de caja: contado $' || round(p_monto_cierre) || ' | esperado $' || round(v_esperado)
      || ' | diferencia $' || round(v_diferencia),
    'CAJA', p_caja_id::text
  );

  RETURN jsonb_build_object(
    'id', p_caja_id,
    'monto_esperado', v_esperado,
    'monto_cierre', p_monto_cierre,
    'diferencia', v_diferencia
  );
END;
$$;

-- 14. Compra V2: total calculado desde los detalles, proveedor y caja de la sede.
CREATE OR REPLACE FUNCTION public.registrar_compra_v2_tx(
  p_proveedor_id uuid,
  p_numero_factura text,
  p_estado_pago text,
  p_metodo_pago text,
  p_caja_sesion_id uuid,
  p_detalles public.compra_detalle_input[],
  p_estado_recepcion text DEFAULT 'conforme',
  p_observaciones_recepcion text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile record;
  v_detail public.compra_detalle_input;
  v_total numeric := 0;
  v_caja uuid := NULL;
  v_product_ids uuid[];
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF;
  SELECT role, status, drogueria_id INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND OR v_profile.status <> 'activo'
     OR v_profile.role NOT IN ('admin', 'superadmin') OR v_profile.drogueria_id IS NULL THEN
    RAISE EXCEPTION 'Solo un administrador de sede puede registrar compras';
  END IF;

  IF NULLIF(trim(COALESCE(p_numero_factura, '')), '') IS NULL THEN
    RAISE EXCEPTION 'El número de factura del proveedor es obligatorio';
  END IF;
  IF p_estado_pago IS NULL OR p_estado_pago NOT IN ('pagado', 'pendiente', 'credito') THEN
    RAISE EXCEPTION 'Estado de pago inválido';
  END IF;
  IF p_metodo_pago IS NULL OR p_metodo_pago NOT IN ('efectivo', 'transferencia', 'tarjeta') THEN
    RAISE EXCEPTION 'Método de pago inválido';
  END IF;
  IF COALESCE(p_estado_recepcion, 'conforme') NOT IN ('conforme', 'observacion') THEN
    RAISE EXCEPTION 'Estado de recepción inválido';
  END IF;
  IF COALESCE(array_length(p_detalles, 1), 0) < 1 OR array_length(p_detalles, 1) > 500 THEN
    RAISE EXCEPTION 'La compra debe tener entre 1 y 500 productos';
  END IF;

  PERFORM 1 FROM public.proveedores
  WHERE id = p_proveedor_id AND drogueria_id = v_profile.drogueria_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proveedor no encontrado en esta droguería'; END IF;

  FOREACH v_detail IN ARRAY p_detalles LOOP
    IF v_detail.producto_id IS NULL OR COALESCE(v_detail.cantidad, 0) <= 0
       OR COALESCE(v_detail.costo_unitario, 0) < 0 THEN
      RAISE EXCEPTION 'Producto, cantidad o costo de compra inválido';
    END IF;
    v_total := v_total + round(v_detail.cantidad * v_detail.costo_unitario, 2);
  END LOOP;

  IF p_estado_pago = 'pagado' AND p_metodo_pago = 'efectivo' THEN
    PERFORM 1 FROM public.caja_sesiones
    WHERE id = p_caja_sesion_id
      AND drogueria_id = v_profile.drogueria_id
      AND estado IN ('abierta', 'abierto')
    FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La caja no está abierta para esta droguería'; END IF;
    v_caja := p_caja_sesion_id;
  END IF;

  v_product_ids := ARRAY(SELECT (x).producto_id FROM unnest(p_detalles) x);
  PERFORM 1 FROM public.inventario
  WHERE drogueria_id = v_profile.drogueria_id AND producto_id = ANY (v_product_ids)
  ORDER BY id
  FOR UPDATE;

  RETURN public.registrar_compra_tx(
    p_proveedor_id, trim(p_numero_factura), v_total, p_estado_pago, p_metodo_pago,
    v_caja, p_detalles, v_user_id, COALESCE(p_estado_recepcion, 'conforme'), p_observaciones_recepcion
  );
END;
$$;

-- 15. Ventas agregadas por producto en el periodo (top del dashboard, reportes y
-- pedido sugerido). SECURITY INVOKER: RLS limita a la droguería del usuario.
CREATE OR REPLACE FUNCTION public.ventas_por_producto(
  p_desde timestamptz,
  p_limite integer DEFAULT NULL,
  p_orden text DEFAULT 'ingresos'
)
RETURNS TABLE (
  producto_id uuid,
  nombre text,
  unidades_equivalentes numeric,
  cajas_equivalentes numeric,
  ingresos numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT agg.producto_id, agg.nombre, agg.unidades_equivalentes, agg.cajas_equivalentes, agg.ingresos
  FROM (
    SELECT d.producto_id,
           max(p.nombre) AS nombre,
           sum(COALESCE(d.cantidad_cajas, 0) * COALESCE(i.blisters_por_caja, 1) * COALESCE(i.unidades_por_blister, 1)
               + COALESCE(d.cantidad_blisters, 0) * COALESCE(i.unidades_por_blister, 1)
               + COALESCE(d.cantidad_unidades, 0))::numeric AS unidades_equivalentes,
           round(sum(COALESCE(d.cantidad_cajas, 0)
               + COALESCE(d.cantidad_blisters, 0)::numeric / COALESCE(i.blisters_por_caja, 1)
               + COALESCE(d.cantidad_unidades, 0)::numeric
                 / (COALESCE(i.blisters_por_caja, 1) * COALESCE(i.unidades_por_blister, 1))), 2) AS cajas_equivalentes,
           sum(d.precio_unitario) AS ingresos
    FROM public.factura_detalles d
    JOIN public.facturas f ON f.id = d.factura_id
    JOIN public.productos p ON p.id = d.producto_id
    LEFT JOIN public.inventario i ON i.producto_id = d.producto_id AND i.drogueria_id = d.drogueria_id
    WHERE f.estado_pago <> 'anulada'
      AND f.created_at >= p_desde
    GROUP BY d.producto_id
  ) agg
  ORDER BY
    CASE WHEN p_orden = 'cantidad' THEN agg.cajas_equivalentes ELSE agg.ingresos END DESC,
    agg.unidades_equivalentes DESC,
    agg.producto_id
  LIMIT CASE WHEN p_limite IS NULL THEN NULL ELSE GREATEST(1, LEAST(p_limite, 1000)) END
$$;

-- 16. Métricas por droguería para la consola superadmin (solo service_role).
CREATE OR REPLACE FUNCTION public.platform_tenant_metrics()
RETURNS TABLE (
  drogueria_id uuid,
  productos_count bigint,
  facturas_count bigint,
  clientes_count bigint,
  compras_count bigint,
  cajas_abiertas bigint,
  volumen_facturado numeric,
  ultima_factura_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT d.id,
         (SELECT count(*) FROM public.productos x WHERE x.drogueria_id = d.id),
         (SELECT count(*) FROM public.facturas x WHERE x.drogueria_id = d.id AND x.estado_pago <> 'anulada'),
         (SELECT count(*) FROM public.clientes x WHERE x.drogueria_id = d.id),
         (SELECT count(*) FROM public.compras x WHERE x.drogueria_id = d.id),
         (SELECT count(*) FROM public.caja_sesiones x WHERE x.drogueria_id = d.id AND x.estado IN ('abierta', 'abierto')),
         (SELECT COALESCE(sum(x.total), 0) FROM public.facturas x WHERE x.drogueria_id = d.id AND x.estado_pago <> 'anulada'),
         (SELECT max(x.created_at) FROM public.facturas x WHERE x.drogueria_id = d.id AND x.estado_pago <> 'anulada')
  FROM public.droguerias d
$$;

-- 17. Permisos de ejecución de las RPC nuevas. Las RPC heredadas (crear_factura_tx,
-- anular_factura_tx, registrar_compra_tx, upsert_inventario_tx) se retiran a
-- authenticated en 20261127000003, después de desplegar la app que usa las V2.
REVOKE ALL ON FUNCTION public.pos_precio_venta(numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_precio_venta(numeric, numeric) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.upsert_inventario_v2_tx(
  uuid, text, text, text, uuid, uuid, integer, integer, integer, integer,
  numeric, numeric, numeric, numeric, numeric, numeric, text, text, text, text, text, integer, integer,
  numeric, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_inventario_v2_tx(
  uuid, text, text, text, uuid, uuid, integer, integer, integer, integer,
  numeric, numeric, numeric, numeric, numeric, numeric, text, text, text, text, text, integer, integer,
  numeric, boolean
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.registrar_gasto_tx(uuid, text, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_gasto_tx(uuid, text, numeric, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.registrar_abono_factura_tx(uuid, uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_abono_factura_tx(uuid, uuid, numeric, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.cerrar_caja_tx(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cerrar_caja_tx(uuid, numeric) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.registrar_compra_v2_tx(
  uuid, text, text, text, uuid, public.compra_detalle_input[], text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_compra_v2_tx(
  uuid, text, text, text, uuid, public.compra_detalle_input[], text, text
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.ventas_por_producto(timestamptz, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ventas_por_producto(timestamptz, integer, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.platform_tenant_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_tenant_metrics() TO service_role;
