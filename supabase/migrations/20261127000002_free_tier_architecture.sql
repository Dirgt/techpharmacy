-- Arquitectura para capa gratuita (Supabase Free + Vercel Hobby).
--  * Catálogo local en el navegador con sincronización incremental (catalogo_sync).
--  * Venta y anulación V2 livianas: una escritura por lote, sin filas de auditoría
--    por venta; la traza de lotes vive en factura_detalles.lotes_consumidos.
--  * Agregados en SQL para dashboard y reportes (se envían KB, no el inventario).
--  * Índices: se agregan los que usan las consultas y se eliminan los redundantes.
-- Escrita contra el esquema en vivo del 27-nov-2026. Requiere 20261127000001.

-- 1. Traza FEFO por línea vendida: [{"l": lote_id, "u": unidades equivalentes}].
ALTER TABLE public.factura_detalles
  ADD COLUMN IF NOT EXISTS lotes_consumidos jsonb;
COMMENT ON COLUMN public.factura_detalles.lotes_consumidos IS
  'Unidades que salieron de cada lote: [{"l": lote_id, "u": unidades}]. NULL en ventas anteriores a la V2.';

-- 2. updated_at confiable: la sincronización incremental del catálogo depende de él.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at_productos ON public.productos;
CREATE TRIGGER set_updated_at_productos
BEFORE UPDATE ON public.productos
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_inventario ON public.inventario;
CREATE TRIGGER set_updated_at_inventario
BEFORE UPDATE ON public.inventario
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at_inventario_lotes ON public.inventario_lotes;
CREATE TRIGGER set_updated_at_inventario_lotes
BEFORE UPDATE ON public.inventario_lotes
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION public.set_updated_at();

-- 3. Índices.
CREATE INDEX IF NOT EXISTS idx_inventario_tenant_updated ON public.inventario (drogueria_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_productos_tenant_updated ON public.productos (drogueria_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_inventario_lotes_tenant_updated ON public.inventario_lotes (drogueria_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_facturas_pendientes
  ON public.facturas (drogueria_id, fecha_vencimiento)
  WHERE estado_pago = 'pendiente';

-- Redundantes: los cubre un índice compuesto con la misma columna inicial, o ninguna
-- consulta filtra por esa columna sola. Cada índice ocupa espacio por cada fila.
DROP INDEX IF EXISTS public.idx_facturas_created_at;          -- idx_facturas_tenant_created_at
DROP INDEX IF EXISTS public.idx_facturas_drogueria_id;        -- facturas_drogueria_id_numero_key
DROP INDEX IF EXISTS public.idx_facturas_estado_pago;         -- idx_facturas_pendientes
DROP INDEX IF EXISTS public.idx_facturas_tipo_venta;          -- sin uso selectivo
DROP INDEX IF EXISTS public.idx_facturas_fecha_venc;          -- idx_facturas_pendientes
DROP INDEX IF EXISTS public.idx_factura_detalles_drogueria_id; -- se consulta por factura_id / producto_id
DROP INDEX IF EXISTS public.idx_inventario_lotes_inventario_id; -- idx_inventario_lotes_fefo
DROP INDEX IF EXISTS public.idx_inventario_lotes_drogueria_id;  -- idx_inventario_lotes_tenant_updated
DROP INDEX IF EXISTS public.idx_inventario_drogueria_id;       -- idx_inventario_tenant_updated
DROP INDEX IF EXISTS public.idx_productos_drogueria_id;        -- ux_productos_tenant_codigo
DROP INDEX IF EXISTS public.idx_productos_nombre;              -- la búsqueda es local en el navegador
DROP INDEX IF EXISTS public.idx_productos_principio_activo;    -- la búsqueda es local en el navegador
DROP INDEX IF EXISTS public.idx_auditoria_created_at;          -- se consulta por inventario_id
DROP INDEX IF EXISTS public.idx_logs_actividad_drogueria_id;   -- idx_logs_tenant_created_at

-- 4. Auditoría compacta en upsert_inventario_tx: guarda solo los campos que cambiaron
-- (antes guardaba las dos filas completas como texto en cada edición o importación).
-- El resto de la función es idéntico a la versión en producción.
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
SET search_path TO 'public'
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
  v_antes jsonb := '{}'::jsonb;
  v_despues jsonb := '{}'::jsonb;
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
    -- FOUND y no "v_old_data IS NOT NULL": en PostgreSQL un registro solo es
    -- NOT NULL si todas sus columnas lo son, y lote/sección/ubicación suelen ir vacías.
    IF FOUND THEN
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

  -- Solo los campos que cambiaron (sin identificadores ni marcas de tiempo).
  IF v_old_data IS NULL THEN
    SELECT COALESCE(jsonb_object_agg(n.key, n.value), '{}'::jsonb)
    INTO v_despues
    FROM jsonb_each(
      to_jsonb(v_new_inventario)
      - ARRAY['id', 'drogueria_id', 'producto_id', 'created_at', 'updated_at', 'usuario_id']
    ) n
    WHERE n.value <> 'null'::jsonb;
  ELSE
    SELECT COALESCE(jsonb_object_agg(n.key, o.value), '{}'::jsonb),
           COALESCE(jsonb_object_agg(n.key, n.value), '{}'::jsonb)
    INTO v_antes, v_despues
    FROM jsonb_each(
      to_jsonb(v_new_inventario)
      - ARRAY['id', 'drogueria_id', 'producto_id', 'created_at', 'updated_at', 'usuario_id']
    ) n
    LEFT JOIN jsonb_each(to_jsonb(v_old_data)) o ON o.key = n.key
    WHERE o.value IS DISTINCT FROM n.value;
  END IF;

  INSERT INTO public.auditoria_inventario (
    drogueria_id, inventario_id, operador, accion, valor_anterior, valor_nuevo, detalles
  ) VALUES (
    v_new_inventario.drogueria_id,
    v_new_inventario.id,
    v_operador_real,
    v_accion,
    v_antes::text,
    v_despues::text,
    v_detalles
  );

  RETURN to_jsonb(v_new_inventario);
END;
$function$;

-- 5. Venta V2 liviana. Valida todo en la base (el navegador la llama directo),
-- calcula precios con la misma fórmula del POS, descuenta FEFO con destape en
-- memoria (una escritura por lote tocado) y guarda factura y detalle con sus
-- valores finales en un solo INSERT cada uno. No escribe auditoría por venta:
-- la bitácora la reconstruye bitacora_inventario() desde factura_detalles.
CREATE OR REPLACE FUNCTION public.crear_factura_v2_tx(
  p_cliente_nombre text,
  p_cliente_documento text,
  p_metodo_pago text,
  p_tipo_venta text,
  p_condicion_pago_dias integer,
  p_orden_compra text,
  p_descuento_porcentaje numeric,
  p_vendedor_id uuid,
  p_caja_sesion_id uuid,
  p_items public.factura_item_input[],
  p_pago_efectivo numeric DEFAULT NULL,
  p_pago_tarjeta numeric DEFAULT NULL,
  p_pago_transferencia numeric DEFAULT NULL,
  -- Total que vio el cajero. Si difiere del real en más de $1 (catálogo local
  -- desactualizado), la venta no se registra.
  p_total_cliente numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile record;
  v_tenant record;
  v_today date := (now() AT TIME ZONE 'America/Bogota')::date;
  v_discount numeric := COALESCE(p_descuento_porcentaje, 0);
  v_nombre text := COALESCE(NULLIF(trim(COALESCE(p_cliente_nombre, '')), ''), 'Consumidor Final');
  v_documento text := NULLIF(trim(COALESCE(p_cliente_documento, '')), '');
  v_orden text := NULLIF(trim(COALESCE(p_orden_compra, '')), '');
  v_plazo integer := CASE WHEN p_tipo_venta = 'credito' THEN COALESCE(p_condicion_pago_dias, 0) ELSE 0 END;
  v_item public.factura_item_input;
  v_product_ids uuid[];
  v_seller_id uuid;
  v_numero integer;
  v_factura_id uuid;
  v_inv record;
  v_ids uuid[];
  v_c integer[];
  v_b integer[];
  v_u integer[];
  v_c0 integer[];
  v_b0 integer[];
  v_u0 integer[];
  v_n integer;
  k integer;
  v_bpc integer;
  v_upb integer;
  v_rc integer;
  v_rb integer;
  v_ru integer;
  v_rem integer;
  v_take integer;
  v_open integer;
  v_need integer;
  v_avail_c bigint;
  v_avail_b bigint;
  v_avail_u bigint;
  v_expired bigint;
  v_unidades bigint;
  v_unidades_linea bigint;
  v_consumo jsonb;
  v_tasa numeric;
  v_base numeric;
  v_neto numeric;
  v_iva_linea numeric;
  d_producto uuid[] := '{}';
  d_cajas integer[] := '{}';
  d_blisters integer[] := '{}';
  d_unidades integer[] := '{}';
  d_precio numeric[] := '{}';
  d_tasa numeric[] := '{}';
  d_iva numeric[] := '{}';
  d_lotes jsonb[] := '{}';
  v_tasas numeric[] := '{}';
  v_bruto numeric := 0;
  v_neto_total numeric := 0;
  v_iva numeric := 0;
  v_total numeric := 0;
  v_metodo text;
  v_pe numeric := 0;
  v_pt numeric := 0;
  v_ptr numeric := 0;
  v_active integer := 0;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF;

  SELECT id, role, status, drogueria_id INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND OR v_profile.status IS DISTINCT FROM 'activo' OR v_profile.drogueria_id IS NULL THEN
    RAISE EXCEPTION 'Cuenta inactiva o sin droguería';
  END IF;

  SELECT estado, fecha_vencimiento, descuento_max_vendedor INTO v_tenant
  FROM public.droguerias WHERE id = v_profile.drogueria_id;
  IF v_profile.role IS DISTINCT FROM 'superadmin'
     AND (v_tenant.estado = 'suspendido'
          OR (v_tenant.fecha_vencimiento IS NOT NULL AND v_tenant.fecha_vencimiento < v_today)) THEN
    RAISE EXCEPTION 'El servicio de la droguería está suspendido o vencido';
  END IF;

  IF p_tipo_venta IS NULL OR p_tipo_venta NOT IN ('contado', 'credito') THEN
    RAISE EXCEPTION 'Tipo de venta inválido';
  END IF;
  IF p_metodo_pago IS NULL OR p_metodo_pago NOT IN ('efectivo', 'tarjeta', 'transferencia', 'mixto') THEN
    RAISE EXCEPTION 'Método de pago inválido';
  END IF;
  IF v_plazo < 0 OR v_plazo > 365 THEN RAISE EXCEPTION 'Plazo de crédito inválido'; END IF;
  IF v_discount < 0 OR v_discount > 100 THEN
    RAISE EXCEPTION 'El descuento debe estar entre 0%% y 100%%';
  END IF;
  IF v_profile.role = 'vendedor' AND v_discount > v_tenant.descuento_max_vendedor THEN
    RAISE EXCEPTION 'Tu rol permite un descuento máximo de %', v_tenant.descuento_max_vendedor || '%';
  END IF;
  IF length(v_nombre) > 180 OR length(COALESCE(v_documento, '')) > 40 OR length(COALESCE(v_orden, '')) > 120 THEN
    RAISE EXCEPTION 'El nombre, el documento o la orden de compra son demasiado largos';
  END IF;
  IF v_documento IS NULL OR v_documento = '000000000' THEN
    v_documento := '222222222222';
  END IF;
  IF (p_total_cliente IS NOT NULL AND (p_total_cliente < 0 OR p_total_cliente > 999999999999))
     OR COALESCE(p_pago_efectivo, 0) > 999999999999
     OR COALESCE(p_pago_tarjeta, 0) > 999999999999
     OR COALESCE(p_pago_transferencia, 0) > 999999999999 THEN
    RAISE EXCEPTION 'Montos de pago inválidos';
  END IF;

  IF COALESCE(array_length(p_items, 1), 0) < 1 OR array_length(p_items, 1) > 200 THEN
    RAISE EXCEPTION 'La venta debe tener entre 1 y 200 productos';
  END IF;
  FOREACH v_item IN ARRAY p_items LOOP
    IF v_item.producto_id IS NULL
       OR COALESCE(v_item.cantidad_cajas, 0) < 0
       OR COALESCE(v_item.cantidad_blisters, 0) < 0
       OR COALESCE(v_item.cantidad_unidades, 0) < 0
       OR COALESCE(v_item.cantidad_cajas, 0) > 100000
       OR COALESCE(v_item.cantidad_blisters, 0) > 100000
       OR COALESCE(v_item.cantidad_unidades, 0) > 100000
       OR COALESCE(v_item.cantidad_cajas, 0) + COALESCE(v_item.cantidad_blisters, 0)
          + COALESCE(v_item.cantidad_unidades, 0) <= 0 THEN
      RAISE EXCEPTION 'Cantidades inválidas en la venta';
    END IF;
  END LOOP;

  v_product_ids := ARRAY(SELECT (x).producto_id FROM unnest(p_items) x);
  IF cardinality(v_product_ids) <> (SELECT count(DISTINCT u) FROM unnest(v_product_ids) u) THEN
    RAISE EXCEPTION 'Un producto no puede aparecer dos veces en la misma venta';
  END IF;

  -- Caja propia y abierta; FOR SHARE impide que se cierre mientras se registra la venta.
  PERFORM 1 FROM public.caja_sesiones
  WHERE id = p_caja_sesion_id
    AND drogueria_id = v_profile.drogueria_id
    AND estado IN ('abierta', 'abierto')
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La caja no está abierta para esta droguería'; END IF;

  -- Vendedor: usuario activo de la misma droguería; si no, se registra quien vende.
  SELECT id INTO v_seller_id FROM public.profiles
  WHERE id = p_vendedor_id AND drogueria_id = v_profile.drogueria_id AND status = 'activo';
  v_seller_id := COALESCE(v_seller_id, v_user_id);

  -- Consecutivo primero: serializa las ventas de la sede y fija el orden de bloqueos
  -- (droguería -> inventario por id -> lotes), igual que en todas las RPC de stock.
  UPDATE public.droguerias
  SET ultimo_consecutivo_factura = GREATEST(
    ultimo_consecutivo_factura,
    COALESCE((SELECT max(numero) FROM public.facturas WHERE drogueria_id = v_profile.drogueria_id), 0)
  ) + 1
  WHERE id = v_profile.drogueria_id
  RETURNING ultimo_consecutivo_factura INTO v_numero;

  PERFORM 1 FROM public.inventario
  WHERE drogueria_id = v_profile.drogueria_id AND producto_id = ANY (v_product_ids)
  ORDER BY id
  FOR UPDATE;

  IF (SELECT count(*) FROM public.inventario
      WHERE drogueria_id = v_profile.drogueria_id AND producto_id = ANY (v_product_ids))
     <> cardinality(v_product_ids) THEN
    RAISE EXCEPTION 'Uno o más productos no existen en el inventario de esta droguería';
  END IF;

  -- Inventarios antiguos sin lotes: el stock de la fila pasa a un lote inicial.
  INSERT INTO public.inventario_lotes (
    drogueria_id, inventario_id, producto_id, lote, fecha_vencimiento,
    cajas, blisters, unidades, costo_caja
  )
  SELECT i.drogueria_id, i.id, i.producto_id,
         COALESCE(NULLIF(trim(COALESCE(i.lote, '')), ''), 'LOTE-INICIAL'),
         i.fecha_vencimiento,
         GREATEST(COALESCE(i.cajas, 0), 0),
         GREATEST(COALESCE(i.blisters, 0), 0),
         GREATEST(COALESCE(i.unidades, 0), 0),
         i.precio_caja
  FROM public.inventario i
  WHERE i.drogueria_id = v_profile.drogueria_id
    AND i.producto_id = ANY (v_product_ids)
    AND NOT EXISTS (SELECT 1 FROM public.inventario_lotes l WHERE l.inventario_id = i.id);

  PERFORM 1
  FROM public.inventario_lotes l
  WHERE l.drogueria_id = v_profile.drogueria_id
    AND l.inventario_id IN (
      SELECT i.id FROM public.inventario i
      WHERE i.drogueria_id = v_profile.drogueria_id AND i.producto_id = ANY (v_product_ids)
    )
  ORDER BY l.inventario_id, l.fecha_vencimiento NULLS LAST, l.created_at, l.id
  FOR UPDATE;

  FOREACH v_item IN ARRAY p_items LOOP
    v_rc := COALESCE(v_item.cantidad_cajas, 0);
    v_rb := COALESCE(v_item.cantidad_blisters, 0);
    v_ru := COALESCE(v_item.cantidad_unidades, 0);

    SELECT i.id, i.precio_caja, i.precio_blister, i.precio_unidad,
           i.porcentaje_ganancia, i.margen_blister, i.margen_unidad,
           GREATEST(COALESCE(i.blisters_por_caja, 1), 1) AS bpc,
           GREATEST(COALESCE(i.unidades_por_blister, 1), 1) AS upb,
           p.nombre, p.iva_porcentaje
    INTO v_inv
    FROM public.inventario i
    JOIN public.productos p ON p.id = i.producto_id
    WHERE i.drogueria_id = v_profile.drogueria_id AND i.producto_id = v_item.producto_id;

    v_bpc := v_inv.bpc;
    v_upb := v_inv.upb;

    -- Lotes vigentes en orden FEFO.
    SELECT COALESCE(array_agg(l.id ORDER BY l.fecha_vencimiento ASC NULLS LAST, l.created_at ASC, l.id), '{}'),
           COALESCE(array_agg(l.cajas ORDER BY l.fecha_vencimiento ASC NULLS LAST, l.created_at ASC, l.id), '{}'),
           COALESCE(array_agg(l.blisters ORDER BY l.fecha_vencimiento ASC NULLS LAST, l.created_at ASC, l.id), '{}'),
           COALESCE(array_agg(l.unidades ORDER BY l.fecha_vencimiento ASC NULLS LAST, l.created_at ASC, l.id), '{}')
    INTO v_ids, v_c, v_b, v_u
    FROM public.inventario_lotes l
    WHERE l.inventario_id = v_inv.id
      AND (l.fecha_vencimiento IS NULL OR l.fecha_vencimiento >= v_today);

    v_n := COALESCE(array_length(v_ids, 1), 0);
    v_avail_c := 0;
    v_avail_b := 0;
    v_avail_u := 0;
    FOR k IN 1..v_n LOOP
      v_avail_c := v_avail_c + v_c[k];
      v_avail_b := v_avail_b + v_b[k];
      v_avail_u := v_avail_u + v_u[k];
    END LOOP;

    -- Stock vigente con fraccionamiento hacia abajo (caja -> blíster -> unidad).
    IF v_rc > v_avail_c
       OR (v_rc::bigint * v_bpc + v_rb) > (v_avail_c * v_bpc + v_avail_b)
       OR ((v_rc::bigint * v_bpc + v_rb) * v_upb + v_ru) > ((v_avail_c * v_bpc + v_avail_b) * v_upb + v_avail_u) THEN
      SELECT COALESCE(sum(l.cajas + l.blisters + l.unidades), 0) INTO v_expired
      FROM public.inventario_lotes l
      WHERE l.inventario_id = v_inv.id
        AND l.fecha_vencimiento IS NOT NULL
        AND l.fecha_vencimiento < v_today;
      IF v_expired > 0 THEN
        RAISE EXCEPTION 'No se puede vender %: lote vencido bloqueado o stock vigente insuficiente', v_inv.nombre;
      END IF;
      RAISE EXCEPTION 'Stock insuficiente para %', v_inv.nombre;
    END IF;

    v_c0 := v_c;
    v_b0 := v_b;
    v_u0 := v_u;

    -- Paso 1: cajas cerradas.
    v_rem := v_rc;
    FOR k IN 1..v_n LOOP
      EXIT WHEN v_rem <= 0;
      v_take := LEAST(v_c[k], v_rem);
      v_c[k] := v_c[k] - v_take;
      v_rem := v_rem - v_take;
    END LOOP;
    IF v_rem > 0 THEN RAISE EXCEPTION 'Stock vigente insuficiente para %', v_inv.nombre; END IF;

    -- Paso 2: blísteres, destapando cajas del mismo lote si hace falta.
    v_rem := v_rb;
    FOR k IN 1..v_n LOOP
      EXIT WHEN v_rem <= 0;
      IF v_b[k] < v_rem AND v_c[k] > 0 THEN
        v_need := v_rem - v_b[k];
        v_open := LEAST(v_c[k], CEIL(v_need::numeric / v_bpc)::integer);
        v_c[k] := v_c[k] - v_open;
        v_b[k] := v_b[k] + v_open * v_bpc;
      END IF;
      v_take := LEAST(v_b[k], v_rem);
      v_b[k] := v_b[k] - v_take;
      v_rem := v_rem - v_take;
    END LOOP;
    IF v_rem > 0 THEN RAISE EXCEPTION 'Stock vigente insuficiente para %', v_inv.nombre; END IF;

    -- Paso 3: unidades, destapando blísteres y luego cajas del mismo lote.
    v_rem := v_ru;
    FOR k IN 1..v_n LOOP
      EXIT WHEN v_rem <= 0;
      v_take := LEAST(v_u[k], v_rem);
      v_u[k] := v_u[k] - v_take;
      v_rem := v_rem - v_take;

      IF v_rem > 0 AND v_b[k] > 0 THEN
        v_need := CEIL(v_rem::numeric / v_upb)::integer;
        v_open := LEAST(v_b[k], v_need);
        v_b[k] := v_b[k] - v_open;
        v_u[k] := v_u[k] + v_open * v_upb;
        v_take := LEAST(v_u[k], v_rem);
        v_u[k] := v_u[k] - v_take;
        v_rem := v_rem - v_take;
      END IF;

      IF v_rem > 0 AND v_c[k] > 0 THEN
        v_need := CEIL(v_rem::numeric / (v_bpc * v_upb))::integer;
        v_open := LEAST(v_c[k], v_need);
        v_c[k] := v_c[k] - v_open;
        v_b[k] := v_b[k] + v_open * v_bpc;

        v_need := CEIL(v_rem::numeric / v_upb)::integer;
        v_open := LEAST(v_b[k], v_need);
        v_b[k] := v_b[k] - v_open;
        v_u[k] := v_u[k] + v_open * v_upb;

        v_take := LEAST(v_u[k], v_rem);
        v_u[k] := v_u[k] - v_take;
        v_rem := v_rem - v_take;
      END IF;
    END LOOP;
    IF v_rem > 0 THEN RAISE EXCEPTION 'Stock vigente insuficiente para %', v_inv.nombre; END IF;

    -- Una escritura por lote tocado y traza de unidades por lote.
    v_consumo := '[]'::jsonb;
    v_unidades_linea := 0;
    FOR k IN 1..v_n LOOP
      IF v_c[k] <> v_c0[k] OR v_b[k] <> v_b0[k] OR v_u[k] <> v_u0[k] THEN
        UPDATE public.inventario_lotes
        SET cajas = v_c[k], blisters = v_b[k], unidades = v_u[k], updated_at = now()
        WHERE id = v_ids[k];

        v_unidades := (v_c0[k] - v_c[k])::bigint * v_bpc * v_upb
                    + (v_b0[k] - v_b[k])::bigint * v_upb
                    + (v_u0[k] - v_u[k]);
        IF v_unidades > 0 THEN
          v_consumo := v_consumo || jsonb_build_array(jsonb_build_object('l', v_ids[k], 'u', v_unidades));
          v_unidades_linea := v_unidades_linea + v_unidades;
        END IF;
      END IF;
    END LOOP;

    IF v_unidades_linea <> (v_rc::bigint * v_bpc + v_rb) * v_upb + v_ru THEN
      RAISE EXCEPTION 'Inconsistencia de inventario al descontar %; la venta no se registró', v_inv.nombre;
    END IF;

    PERFORM public.sync_inventario_from_lotes(v_inv.id);

    -- Precio con la misma fórmula del POS (calculatePV) e IVA por producto.
    v_tasa := CASE WHEN v_inv.iva_porcentaje IN (5, 19) THEN v_inv.iva_porcentaje ELSE 0 END;
    v_base := public.pos_precio_venta(v_inv.precio_caja, v_inv.porcentaje_ganancia::numeric) * v_rc
            + public.pos_precio_venta(v_inv.precio_blister, v_inv.margen_blister::numeric) * v_rb
            + public.pos_precio_venta(v_inv.precio_unidad, v_inv.margen_unidad::numeric) * v_ru;
    v_neto := round(v_base * (100 - v_discount) / 100);
    v_iva_linea := round(v_neto * v_tasa / 100);

    v_bruto := v_bruto + v_base;
    v_neto_total := v_neto_total + v_neto;
    v_iva := v_iva + v_iva_linea;
    IF NOT (v_tasa = ANY (v_tasas)) THEN
      v_tasas := array_append(v_tasas, v_tasa);
    END IF;

    d_producto := array_append(d_producto, v_item.producto_id);
    d_cajas := array_append(d_cajas, v_rc);
    d_blisters := array_append(d_blisters, v_rb);
    d_unidades := array_append(d_unidades, v_ru);
    d_precio := array_append(d_precio, v_neto);
    d_tasa := array_append(d_tasa, v_tasa);
    d_iva := array_append(d_iva, v_iva_linea);
    d_lotes := array_append(d_lotes, v_consumo);
  END LOOP;

  v_total := v_neto_total + v_iva;

  IF p_total_cliente IS NOT NULL AND abs(p_total_cliente - v_total) > 1 THEN
    RAISE EXCEPTION 'Los precios cambiaron: el total real es $% y la pantalla mostraba $%. Revisa el carrito actualizado y vuelve a cobrar.',
      round(v_total), round(p_total_cliente);
  END IF;

  -- Pago validado contra el total calculado por la base.
  IF p_tipo_venta = 'credito' THEN
    v_metodo := CASE WHEN p_metodo_pago IN ('tarjeta', 'transferencia') THEN p_metodo_pago ELSE 'efectivo' END;
  ELSIF p_metodo_pago = 'mixto' THEN
    IF COALESCE(p_pago_efectivo, 0) < 0 OR COALESCE(p_pago_tarjeta, 0) < 0 OR COALESCE(p_pago_transferencia, 0) < 0 THEN
      RAISE EXCEPTION 'Los montos del pago mixto no pueden ser negativos';
    END IF;
    v_pe := COALESCE(p_pago_efectivo, 0);
    v_pt := COALESCE(p_pago_tarjeta, 0);
    v_ptr := COALESCE(p_pago_transferencia, 0);
    IF abs((v_pe + v_pt + v_ptr) - v_total) > 1 THEN
      RAISE EXCEPTION 'La suma del pago mixto ($%) no coincide con el total ($%)',
        round(v_pe + v_pt + v_ptr), round(v_total);
    END IF;
    v_active := (CASE WHEN v_pe > 0 THEN 1 ELSE 0 END)
              + (CASE WHEN v_pt > 0 THEN 1 ELSE 0 END)
              + (CASE WHEN v_ptr > 0 THEN 1 ELSE 0 END);
    v_metodo := CASE
      WHEN v_active > 1 THEN 'mixto'
      WHEN v_pt > 0 THEN 'tarjeta'
      WHEN v_ptr > 0 THEN 'transferencia'
      ELSE 'efectivo'
    END;
  ELSE
    v_metodo := p_metodo_pago;
    v_pe := CASE WHEN v_metodo = 'efectivo' THEN v_total ELSE 0 END;
    v_pt := CASE WHEN v_metodo = 'tarjeta' THEN v_total ELSE 0 END;
    v_ptr := CASE WHEN v_metodo = 'transferencia' THEN v_total ELSE 0 END;
  END IF;

  INSERT INTO public.facturas (
    drogueria_id, numero, cliente_nombre, cliente_documento, metodo_pago, tipo_venta,
    condicion_pago_dias, fecha_vencimiento, orden_compra, subtotal_bruto, descuento_porcentaje,
    descuento_monto, iva_porcentaje, iva_total, total, estado_pago, vendedor_id, caja_sesion_id,
    pago_efectivo, pago_tarjeta, pago_transferencia
  ) VALUES (
    v_profile.drogueria_id, v_numero, v_nombre, v_documento, v_metodo, p_tipo_venta,
    v_plazo,
    CASE WHEN p_tipo_venta = 'credito' AND v_plazo > 0 THEN v_today + v_plazo ELSE NULL END,
    v_orden, v_bruto, v_discount, v_bruto - v_neto_total,
    CASE WHEN cardinality(v_tasas) = 1 THEN v_tasas[1] ELSE NULL END,
    v_iva, v_total,
    CASE WHEN p_tipo_venta = 'contado' THEN 'pagado' ELSE 'pendiente' END,
    v_seller_id, p_caja_sesion_id, v_pe, v_pt, v_ptr
  )
  RETURNING id INTO v_factura_id;

  INSERT INTO public.factura_detalles (
    drogueria_id, factura_id, producto_id, cantidad_cajas, cantidad_blisters, cantidad_unidades,
    precio_unitario, iva_porcentaje, iva_monto, lotes_consumidos
  )
  SELECT v_profile.drogueria_id, v_factura_id, x.producto_id, x.cajas, x.blisters, x.unidades,
         x.precio, x.tasa, x.iva, x.lotes
  FROM unnest(d_producto, d_cajas, d_blisters, d_unidades, d_precio, d_tasa, d_iva, d_lotes)
       AS x(producto_id, cajas, blisters, unidades, precio, tasa, iva, lotes);

  RETURN jsonb_build_object(
    'id', v_factura_id,
    'numero', v_numero,
    'total', v_total,
    'iva_total', v_iva,
    'metodo_pago', v_metodo,
    'pago_efectivo', v_pe,
    'pago_tarjeta', v_pt,
    'pago_transferencia', v_ptr
  );
END;
$$;

-- 6a. Anulación heredada (respaldo para ventas sin traza). Corrige un error en
-- producción: "IF v_inv IS NOT NULL" es falso si cualquier columna del inventario
-- es NULL (lote, sección, ubicación...), y entonces el stock no se devolvía.
-- Única diferencia con la versión en vivo: se usa FOUND.
CREATE OR REPLACE FUNCTION public.anular_factura_tx(p_factura_id uuid, p_motivo text DEFAULT ''::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile RECORD;
  v_factura RECORD;
  v_det RECORD;
  v_inv RECORD;
  v_inv_found BOOLEAN;
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

  IF NOT FOUND OR v_profile.status IS DISTINCT FROM 'activo' THEN
    RAISE EXCEPTION 'Cuenta inactiva o sin perfil';
  END IF;

  IF v_profile.role NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Solo un administrador puede anular facturas';
  END IF;

  SELECT * INTO v_factura
  FROM public.facturas
  WHERE id = p_factura_id
  FOR UPDATE;

  IF NOT FOUND THEN
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
    v_inv_found := FOUND;

    IF v_inv_found THEN
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
$function$;

-- 6. Anulación V2: devuelve a cada lote exactamente las unidades que salieron de él.
-- Ventas sin traza (anteriores a la V2) usan anular_factura_tx.
CREATE OR REPLACE FUNCTION public.anular_factura_v2_tx(
  p_factura_id uuid,
  p_motivo text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_profile record;
  v_invoice record;
  v_det record;
  v_inv record;
  v_mov record;
  v_motivo text := trim(COALESCE(p_motivo, ''));
  v_box integer;
  v_rc integer;
  v_rb integer;
  v_ru integer;
  v_e integer;
  v_tc integer;
  v_tb integer;
  v_tu integer;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuario no autenticado'; END IF;

  SELECT role, status, drogueria_id, full_name INTO v_profile FROM public.profiles WHERE id = v_user_id;
  IF NOT FOUND OR v_profile.status IS DISTINCT FROM 'activo'
     OR v_profile.role NOT IN ('admin', 'superadmin') OR v_profile.drogueria_id IS NULL THEN
    RAISE EXCEPTION 'Solo un administrador puede anular ventas';
  END IF;
  IF v_profile.role <> 'superadmin' AND EXISTS (
    SELECT 1 FROM public.droguerias d
    WHERE d.id = v_profile.drogueria_id
      AND (d.estado = 'suspendido'
           OR (d.fecha_vencimiento IS NOT NULL
               AND d.fecha_vencimiento < (now() AT TIME ZONE 'America/Bogota')::date))
  ) THEN
    RAISE EXCEPTION 'El servicio de la droguería está suspendido o vencido';
  END IF;
  IF length(v_motivo) < 3 OR length(v_motivo) > 300 THEN
    RAISE EXCEPTION 'El motivo debe tener entre 3 y 300 caracteres';
  END IF;

  SELECT id, numero, estado_pago INTO v_invoice FROM public.facturas
  WHERE id = p_factura_id AND drogueria_id = v_profile.drogueria_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta no encontrada en esta droguería'; END IF;
  IF v_invoice.estado_pago = 'anulada' THEN RAISE EXCEPTION 'La venta ya está anulada'; END IF;

  -- Mismo orden de bloqueo que las ventas: inventario por id y luego lotes.
  PERFORM 1 FROM public.inventario i
  WHERE i.drogueria_id = v_profile.drogueria_id
    AND i.producto_id IN (SELECT d.producto_id FROM public.factura_detalles d WHERE d.factura_id = p_factura_id)
  ORDER BY i.id
  FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1 FROM public.factura_detalles
    WHERE factura_id = p_factura_id AND lotes_consumidos IS NOT NULL
  ) THEN
    RETURN public.anular_factura_tx(p_factura_id, v_motivo);
  END IF;

  PERFORM 1 FROM public.inventario_lotes l
  WHERE l.id IN (
    SELECT (e.value->>'l')::uuid
    FROM public.factura_detalles d
    CROSS JOIN LATERAL jsonb_array_elements(d.lotes_consumidos) e
    WHERE d.factura_id = p_factura_id AND d.lotes_consumidos IS NOT NULL
  )
  ORDER BY l.inventario_id, l.fecha_vencimiento NULLS LAST, l.created_at, l.id
  FOR UPDATE;

  FOR v_det IN
    SELECT d.id, d.producto_id,
           COALESCE(d.cantidad_cajas, 0) AS qc,
           COALESCE(d.cantidad_blisters, 0) AS qb,
           COALESCE(d.cantidad_unidades, 0) AS qu,
           COALESCE(d.lotes_consumidos, '[]'::jsonb) AS lotes
    FROM public.factura_detalles d
    WHERE d.factura_id = p_factura_id
    ORDER BY d.id
  LOOP
    SELECT i.id,
           GREATEST(COALESCE(i.blisters_por_caja, 1), 1) AS bpc,
           GREATEST(COALESCE(i.unidades_por_blister, 1), 1) AS upb
    INTO v_inv
    FROM public.inventario i
    WHERE i.producto_id = v_det.producto_id AND i.drogueria_id = v_profile.drogueria_id;
    CONTINUE WHEN NOT FOUND;

    v_box := v_inv.bpc * v_inv.upb;
    v_rc := v_det.qc;
    v_rb := v_det.qb;
    v_ru := v_det.qu;

    -- Se devuelven primero presentaciones cerradas (cajas, blísteres) hasta lo que se
    -- vendió de cada una; lo que salió destapado vuelve como unidades sueltas.
    FOR v_mov IN
      SELECT (t.e->>'l')::uuid AS lote_id, COALESCE((t.e->>'u')::integer, 0) AS u, l.id AS existe
      FROM jsonb_array_elements(v_det.lotes) WITH ORDINALITY AS t(e, ord)
      LEFT JOIN public.inventario_lotes l
        ON l.id = (t.e->>'l')::uuid AND l.inventario_id = v_inv.id
      ORDER BY t.ord
    LOOP
      v_e := v_mov.u;
      CONTINUE WHEN v_e <= 0;
      v_tc := LEAST(v_rc, v_e / v_box);
      v_e := v_e - v_tc * v_box;
      v_rc := v_rc - v_tc;
      v_tb := LEAST(v_rb, v_e / v_inv.upb);
      v_e := v_e - v_tb * v_inv.upb;
      v_rb := v_rb - v_tb;
      v_tu := LEAST(v_ru, v_e);
      v_e := v_e - v_tu;
      v_ru := v_ru - v_tu;

      IF v_mov.existe IS NOT NULL THEN
        UPDATE public.inventario_lotes
        SET cajas = cajas + v_tc,
            blisters = blisters + v_tb,
            unidades = unidades + v_tu + v_e,
            updated_at = now()
        WHERE id = v_mov.lote_id;
      ELSE
        -- El lote original ya no existe: el stock vuelve en un lote de devolución.
        INSERT INTO public.inventario_lotes (
          drogueria_id, inventario_id, producto_id, lote, fecha_vencimiento, cajas, blisters, unidades
        ) VALUES (
          v_profile.drogueria_id, v_inv.id, v_det.producto_id,
          'DEVOLUCION-' || v_invoice.numero, NULL, v_tc, v_tb, v_tu + v_e
        );
      END IF;
    END LOOP;

    PERFORM public.sync_inventario_from_lotes(v_inv.id);

    INSERT INTO public.auditoria_inventario (
      drogueria_id, inventario_id, operador, accion, campo_modificado, detalles
    ) VALUES (
      v_profile.drogueria_id, v_inv.id, COALESCE(v_profile.full_name, 'Administrador'),
      'ANULACION_VENTA', 'stock',
      'Devolución por anulación de la venta #' || v_invoice.numero || ': '
        || v_det.qc || 'C ' || v_det.qb || 'B ' || v_det.qu || 'U'
    );
  END LOOP;

  UPDATE public.facturas
  SET estado_pago = 'anulada',
      motivo_anulacion = v_motivo,
      anulada_por = v_user_id,
      anulada_at = now()
  WHERE id = p_factura_id;

  INSERT INTO public.logs_actividad (
    drogueria_id, usuario_id, accion, detalles, tipo_entidad, entidad_id
  ) VALUES (
    v_profile.drogueria_id, v_user_id, 'ANULAR_FACTURA',
    'Se anuló la venta #' || v_invoice.numero || ' — Motivo: ' || v_motivo,
    'FACTURA', p_factura_id::text
  );

  RETURN jsonb_build_object('id', p_factura_id, 'numero', v_invoice.numero, 'estado_pago', 'anulada');
END;
$$;

-- 7. Catálogo para el navegador. Sin p_desde devuelve todo; con p_desde solo los
-- productos que cambiaron (producto, inventario o alguno de sus lotes) y cada uno con
-- su lista completa de lotes con stock, para reemplazarlo entero en el cliente.
-- 'corte' lleva 2 minutos de traslape para no perder transacciones que empezaron
-- antes de la consulta y confirmaron después. 'total' permite detectar borrados.
-- SECURITY INVOKER: RLS limita todo a la droguería del usuario.
CREATE OR REPLACE FUNCTION public.catalogo_sync(p_desde timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tenant uuid := public.get_current_drogueria_id();
  v_result jsonb;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Cuenta inactiva o sin droguería';
  END IF;

  -- Una sola sentencia: conteo e ítems salen de la misma foto de la base.
  WITH cambiados AS (
    SELECT i.id FROM public.inventario i
    WHERE i.drogueria_id = v_tenant AND (p_desde IS NULL OR i.updated_at > p_desde)
    UNION
    SELECT i.id FROM public.productos p
    JOIN public.inventario i ON i.producto_id = p.id
    WHERE p_desde IS NOT NULL AND p.drogueria_id = v_tenant AND p.updated_at > p_desde
    UNION
    SELECT l.inventario_id FROM public.inventario_lotes l
    WHERE p_desde IS NOT NULL AND l.drogueria_id = v_tenant AND l.updated_at > p_desde
  ),
  lotes AS (
    SELECT l.inventario_id,
           jsonb_agg(
             jsonb_build_array(l.id, l.lote, l.fecha_vencimiento, l.cajas, l.blisters, l.unidades,
                               l.costo_caja, l.created_at)
             ORDER BY l.fecha_vencimiento NULLS LAST, l.created_at, l.id
           ) FILTER (WHERE l.cajas > 0 OR l.blisters > 0 OR l.unidades > 0) AS arr
    FROM public.inventario_lotes l
    JOIN cambiados c ON c.id = l.inventario_id
    WHERE l.drogueria_id = v_tenant
    GROUP BY l.inventario_id
  )
  SELECT jsonb_build_object(
    'v', 1,
    'corte', now() - interval '2 minutes',
    'completo', p_desde IS NULL,
    'total', (SELECT count(*) FROM public.inventario x WHERE x.drogueria_id = v_tenant),
    'cols', jsonb_build_array(
      'inventario_id', 'producto_id', 'codigo', 'nombre_producto', 'principio_activo',
      'laboratorio_id', 'laboratorio', 'cajas', 'blisters', 'unidades', 'stock_minimo',
      'precio_caja', 'precio_blister', 'precio_unidad', 'margen_caja', 'margen_blister',
      'margen_unidad', 'fecha_vencimiento', 'lote', 'registro_invima', 'seccion', 'ubicacion',
      'blisters_por_caja', 'unidades_por_blister', 'updated_at', 'iva_porcentaje',
      'requiere_formula', 'tiene_lotes', 'lotes'
    ),
    'lcols', jsonb_build_array(
      'id', 'lote', 'fecha_vencimiento', 'cajas', 'blisters', 'unidades', 'costo_caja', 'created_at'
    ),
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_array(
        i.id, p.id, p.codigo, p.nombre, p.principio_activo,
        p.laboratorio_id, lab.nombre, i.cajas, i.blisters, i.unidades, i.stock_minimo,
        i.precio_caja, i.precio_blister, i.precio_unidad, i.porcentaje_ganancia, i.margen_blister,
        i.margen_unidad, i.fecha_vencimiento, i.lote, i.registro_invima, i.seccion, i.ubicacion,
        i.blisters_por_caja, i.unidades_por_blister, i.updated_at, p.iva_porcentaje,
        p.requiere_formula, lt.inventario_id IS NOT NULL, COALESCE(lt.arr, '[]'::jsonb)
      ))
      FROM cambiados c
      JOIN public.inventario i ON i.id = c.id
      JOIN public.productos p ON p.id = i.producto_id
      LEFT JOIN public.laboratorios lab ON lab.id = p.laboratorio_id
      LEFT JOIN lotes lt ON lt.inventario_id = i.id
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- 8. Bitácora de un producto: auditoría + ventas V2 reconstruidas desde el detalle
-- (las ventas V2 no escriben una fila de auditoría por producto vendido).
CREATE OR REPLACE FUNCTION public.bitacora_inventario(
  p_inventario_id uuid,
  p_limite integer DEFAULT 500
)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  accion text,
  operador text,
  detalles text
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF COALESCE(public.get_current_user_role(), '') NOT IN ('admin', 'superadmin') THEN
    RAISE EXCEPTION 'Solo un administrador puede ver la bitácora';
  END IF;

  RETURN QUERY
  SELECT x.id, x.created_at, x.accion, x.operador, x.detalles
  FROM (
    SELECT a.id, a.created_at, a.accion, a.operador, a.detalles
    FROM public.auditoria_inventario a
    WHERE a.inventario_id = p_inventario_id
    UNION ALL
    SELECT d.id, f.created_at, 'VENTA'::text, COALESCE(pr.full_name, 'Vendedor'),
           'Venta Factura #' || f.numero || ' — ' || COALESCE(f.cliente_nombre, 'Consumidor Final')
             || ' (' || COALESCE(f.tipo_venta, 'contado') || ')'
    FROM public.inventario i
    JOIN public.factura_detalles d
      ON d.producto_id = i.producto_id AND d.lotes_consumidos IS NOT NULL
    JOIN public.facturas f ON f.id = d.factura_id
    LEFT JOIN public.profiles pr ON pr.id = f.vendedor_id
    WHERE i.id = p_inventario_id
  ) x
  ORDER BY x.created_at DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 500), 1000));
END;
$$;

-- 9. Ingresos (ventas no anuladas) y egresos (gastos + compras) por día de Colombia.
CREATE OR REPLACE FUNCTION public.serie_ingresos_gastos(p_dias integer DEFAULT 7)
RETURNS TABLE (fecha date, ingresos numeric, gastos numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH rango AS (
    SELECT public.get_current_drogueria_id() AS tenant,
           (now() AT TIME ZONE 'America/Bogota')::date AS hoy,
           GREATEST(1, LEAST(COALESCE(p_dias, 7), 366)) AS n
  ), r AS (
    SELECT tenant, hoy, hoy - (n - 1) AS desde,
           ((hoy - (n - 1))::timestamp AT TIME ZONE 'America/Bogota') AS desde_ts
    FROM rango
  ), dias AS (
    SELECT generate_series(r.desde::timestamp, r.hoy::timestamp, interval '1 day')::date AS fecha FROM r
  ), ing AS (
    SELECT (f.created_at AT TIME ZONE 'America/Bogota')::date AS fecha, sum(COALESCE(f.total, 0)) AS v
    FROM public.facturas f, r
    WHERE f.drogueria_id = r.tenant AND f.estado_pago <> 'anulada' AND f.created_at >= r.desde_ts
    GROUP BY 1
  ), egr AS (
    SELECT y.fecha, sum(y.v) AS v
    FROM (
      SELECT (g.created_at AT TIME ZONE 'America/Bogota')::date AS fecha, COALESCE(g.monto, 0) AS v
      FROM public.gastos g, r
      WHERE g.drogueria_id = r.tenant AND g.created_at >= r.desde_ts
      UNION ALL
      SELECT (c.created_at AT TIME ZONE 'America/Bogota')::date, COALESCE(c.total, 0)
      FROM public.compras c, r
      WHERE c.drogueria_id = r.tenant AND c.created_at >= r.desde_ts
    ) y
    GROUP BY y.fecha
  )
  SELECT d.fecha, COALESCE(i.v, 0), COALESCE(e.v, 0)
  FROM dias d
  LEFT JOIN ing i ON i.fecha = d.fecha
  LEFT JOIN egr e ON e.fecha = d.fecha
  ORDER BY d.fecha
$$;

-- 10. Pedido sugerido: demanda de 30 días frente a stock vigente (lotes no vencidos).
-- Misma regla que la versión anterior en TypeScript, sin descargar el inventario.
CREATE OR REPLACE FUNCTION public.pedido_sugerido()
RETURNS TABLE (
  producto_id uuid,
  codigo text,
  nombre text,
  principio_activo text,
  laboratorio text,
  stock_actual_cajas numeric,
  stock_minimo integer,
  ventas_30d_cajas numeric,
  sugerido_cajas integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH params AS (
    SELECT public.get_current_drogueria_id() AS tenant,
           (now() AT TIME ZONE 'America/Bogota')::date AS hoy
  ), ventas AS (
    SELECT v.producto_id, v.cajas_equivalentes
    FROM params,
         public.ventas_por_producto(((params.hoy - 30)::timestamp AT TIME ZONE 'America/Bogota'), NULL, 'cantidad') v
  ), stock AS (
    SELECT l.inventario_id,
           sum(l.cajas
               + l.blisters::numeric / GREATEST(COALESCE(i.blisters_por_caja, 1), 1)
               + l.unidades::numeric / (GREATEST(COALESCE(i.blisters_por_caja, 1), 1)
                                        * GREATEST(COALESCE(i.unidades_por_blister, 1), 1))) AS cajas_eq
    FROM public.inventario_lotes l
    JOIN public.inventario i ON i.id = l.inventario_id
    JOIN params ON l.drogueria_id = params.tenant
    WHERE l.fecha_vencimiento IS NULL OR l.fecha_vencimiento >= params.hoy
    GROUP BY l.inventario_id
  ), base AS (
    SELECT i.id AS inventario_id, i.producto_id, p.codigo, p.nombre, p.principio_activo,
           COALESCE(lab.nombre, 'Genérico') AS laboratorio,
           round(COALESCE(s.cajas_eq, 0), 1) AS stock_actual,
           COALESCE(i.stock_minimo, 2) AS minimo,
           round(COALESCE(v.cajas_equivalentes, 0), 1) AS demanda
    FROM public.inventario i
    JOIN params ON i.drogueria_id = params.tenant
    JOIN public.productos p ON p.id = i.producto_id
    LEFT JOIN public.laboratorios lab ON lab.id = p.laboratorio_id
    LEFT JOIN stock s ON s.inventario_id = i.id
    LEFT JOIN ventas v ON v.producto_id = i.producto_id
  ), calc AS (
    SELECT b.*, GREATEST(0, ceil(GREATEST(b.demanda, b.minimo * 2) - b.stock_actual))::integer AS sugerido
    FROM base b
  )
  SELECT c.producto_id, c.codigo, c.nombre, c.principio_activo, c.laboratorio,
         c.stock_actual, c.minimo, c.demanda, c.sugerido
  FROM calc c
  WHERE c.sugerido > 0
  ORDER BY c.sugerido DESC, c.inventario_id
$$;

-- 11. Resumen del dashboard en una sola llamada (KB en vez de todo el inventario,
-- los lotes y 14 días de ventas). Reproduce los cálculos de dashboard/page.tsx.
CREATE OR REPLACE FUNCTION public.dashboard_resumen()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_tenant uuid := public.get_current_drogueria_id();
  v_hoy date := (now() AT TIME ZONE 'America/Bogota')::date;
  v_limite90 date := ((now() + interval '90 days') AT TIME ZONE 'America/Bogota')::date;
  v_desde14 timestamptz;
  v_desde30 timestamptz;
  v_inventario jsonb;
  v_ventas jsonb;
  v_serie jsonb;
  v_cartera jsonb;
  v_top jsonb;
  v_usuarios bigint;
BEGIN
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'Cuenta inactiva o sin droguería';
  END IF;
  v_desde14 := (v_hoy - 13)::timestamp AT TIME ZONE 'America/Bogota';
  v_desde30 := (v_hoy - 30)::timestamp AT TIME ZONE 'America/Bogota';

  -- Inventario evaluado por lote: solo el stock vigente cuenta como disponible.
  WITH inv AS (
    SELECT i.id, COALESCE(p.codigo, '') AS codigo, COALESCE(NULLIF(p.nombre, ''), 'Producto') AS nombre,
           i.lote, i.fecha_vencimiento, i.cajas, i.blisters, i.unidades,
           GREATEST(COALESCE(i.blisters_por_caja, 1), 1) AS bpc,
           GREATEST(COALESCE(i.unidades_por_blister, 1), 1) AS upb,
           COALESCE(i.stock_minimo, 2) AS minimo,
           COALESCE(i.precio_caja, 0) AS costo,
           public.pos_precio_venta(i.precio_caja, i.porcentaje_ganancia::numeric) AS pv
    FROM public.inventario i
    JOIN public.productos p ON p.id = i.producto_id
    WHERE i.drogueria_id = v_tenant
  ), lotes AS (
    SELECT l.inventario_id, l.id::text AS lote_key, l.lote, l.fecha_vencimiento AS fv,
           GREATEST(l.cajas, 0) AS c, GREATEST(l.blisters, 0) AS b, GREATEST(l.unidades, 0) AS u
    FROM public.inventario_lotes l
    WHERE l.drogueria_id = v_tenant
    UNION ALL
    -- Inventarios antiguos sin lotes: la fila de inventario cuenta como lote único.
    SELECT inv.id, inv.id::text, inv.lote, inv.fecha_vencimiento,
           GREATEST(COALESCE(inv.cajas, 0), 0), GREATEST(COALESCE(inv.blisters, 0), 0),
           GREATEST(COALESCE(inv.unidades, 0), 0)
    FROM inv
    WHERE NOT EXISTS (SELECT 1 FROM public.inventario_lotes x WHERE x.inventario_id = inv.id)
  ), lu AS (
    SELECT inv.id AS inv_id, inv.codigo, inv.nombre, inv.minimo, inv.costo, inv.pv,
           inv.bpc, inv.upb, lt.lote_key, lt.lote, lt.fv, lt.c,
           (lt.c::bigint * inv.bpc * inv.upb + lt.b::bigint * inv.upb + lt.u)::numeric AS unidades,
           (lt.fv IS NOT NULL AND lt.fv < v_hoy) AS vencido
    FROM lotes lt
    JOIN inv ON inv.id = lt.inventario_id
    WHERE lt.c::bigint * inv.bpc * inv.upb + lt.b::bigint * inv.upb + lt.u > 0
  ), por_item AS (
    SELECT inv.id, inv.codigo, inv.nombre, inv.lote, inv.fecha_vencimiento, inv.minimo,
           COALESCE(sum(lu.c) FILTER (WHERE NOT lu.vencido), 0) AS cajas_vigentes,
           COALESCE(sum(lu.unidades / (lu.bpc * lu.upb)) FILTER (WHERE NOT lu.vencido), 0) AS cajas_equiv
    FROM inv
    LEFT JOIN lu ON lu.inv_id = inv.id
    GROUP BY inv.id, inv.codigo, inv.nombre, inv.lote, inv.fecha_vencimiento, inv.minimo
  )
  SELECT jsonb_build_object(
    'totalProductos', (SELECT count(*) FROM inv),
    'totalUnidadesDisponibles', COALESCE((SELECT sum(unidades) FROM lu WHERE NOT vencido), 0),
    'valorInventarioCosto', round(COALESCE((SELECT sum(unidades / (bpc * upb) * costo) FROM lu WHERE NOT vencido), 0)),
    'valorInventarioVenta', round(COALESCE((SELECT sum(unidades / (bpc * upb) * pv) FROM lu WHERE NOT vencido), 0)),
    'vencidos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.inv_id || ':' || a.lote_key, 'nombre', a.nombre, 'codigo', a.codigo,
               'lote', a.lote, 'fechaVencimiento', a.fv, 'cajas', a.c, 'stockMinimo', a.minimo,
               'tipo', 'vencido') ORDER BY a.fv, a.inv_id, a.lote_key)
      FROM (SELECT * FROM lu WHERE vencido ORDER BY fv, inv_id, lote_key LIMIT 10) a
    ), '[]'::jsonb),
    'porVencer', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.inv_id || ':' || a.lote_key, 'nombre', a.nombre, 'codigo', a.codigo,
               'lote', a.lote, 'fechaVencimiento', a.fv, 'cajas', a.c, 'stockMinimo', a.minimo,
               'tipo', 'por_vencer') ORDER BY a.fv, a.inv_id, a.lote_key)
      FROM (SELECT * FROM lu WHERE NOT vencido AND fv IS NOT NULL AND fv <= v_limite90
            ORDER BY fv, inv_id, lote_key LIMIT 10) a
    ), '[]'::jsonb),
    'stockBajo', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id::text, 'nombre', a.nombre, 'codigo', a.codigo, 'lote', a.lote,
               'fechaVencimiento', a.fecha_vencimiento, 'cajas', a.cajas_vigentes,
               'stockMinimo', a.minimo, 'tipo', 'stock_bajo') ORDER BY a.cajas_vigentes, a.id)
      FROM (SELECT * FROM por_item WHERE cajas_equiv <= minimo ORDER BY cajas_vigentes, id LIMIT 10) a
    ), '[]'::jsonb),
    'conteoVencidos', (SELECT count(*) FROM lu WHERE vencido),
    'conteoPorVencer', (SELECT count(*) FROM lu WHERE NOT vencido AND fv IS NOT NULL AND fv <= v_limite90),
    'conteoStockBajo', (SELECT count(*) FROM por_item WHERE cajas_equiv <= minimo),
    'productosConVencidos', (SELECT count(DISTINCT inv_id) FROM lu WHERE vencido)
  )
  INTO v_inventario;

  -- Ventas de 14 días: hoy, ayer, mezcla de pagos y últimas 5.
  WITH f AS (
    SELECT fa.id, fa.numero, fa.cliente_nombre, COALESCE(fa.total, 0) AS total, fa.metodo_pago,
           fa.tipo_venta, fa.estado_pago, fa.created_at,
           (fa.created_at AT TIME ZONE 'America/Bogota')::date AS dia,
           CASE
             WHEN fa.estado_pago IS DISTINCT FROM 'pagado' THEN 0
             WHEN fa.tipo_venta IS DISTINCT FROM 'contado' AND COALESCE(fa.monto_abonado, 0) > 0 THEN 0
             WHEN fa.metodo_pago = 'mixto' THEN COALESCE(fa.pago_efectivo, 0)
             WHEN fa.metodo_pago = 'efectivo' THEN
               CASE WHEN COALESCE(fa.pago_efectivo, 0) > 0 THEN fa.pago_efectivo ELSE COALESCE(fa.total, 0) END
             ELSE 0
           END AS ef,
           CASE
             WHEN fa.metodo_pago = 'mixto' THEN COALESCE(fa.pago_transferencia, 0)
             WHEN fa.metodo_pago = 'transferencia' AND fa.tipo_venta IS DISTINCT FROM 'credito' THEN COALESCE(fa.total, 0)
             ELSE 0
           END AS trf,
           CASE
             WHEN fa.metodo_pago = 'mixto' THEN COALESCE(fa.pago_tarjeta, 0)
             WHEN fa.metodo_pago = 'tarjeta' AND fa.tipo_venta IS DISTINCT FROM 'credito' THEN COALESCE(fa.total, 0)
             ELSE 0
           END AS tar,
           CASE
             WHEN fa.tipo_venta = 'credito' THEN GREATEST(0, COALESCE(fa.total, 0) - COALESCE(fa.monto_abonado, 0))
             ELSE 0
           END AS cred
    FROM public.facturas fa
    WHERE fa.drogueria_id = v_tenant
      AND fa.estado_pago <> 'anulada'
      AND fa.created_at >= v_desde14
  )
  SELECT jsonb_build_object(
    'ventasHoy', COALESCE((SELECT sum(total) FROM f WHERE dia = v_hoy), 0),
    'ventasAyer', COALESCE((SELECT sum(total) FROM f WHERE dia = v_hoy - 1), 0),
    'facturasHoyCount', (SELECT count(*) FROM f WHERE dia = v_hoy),
    'efectivoHoy', COALESCE((SELECT sum(ef) FROM f WHERE dia = v_hoy), 0),
    'digitalHoy', COALESCE((SELECT sum(trf + tar) FROM f WHERE dia = v_hoy), 0),
    'pagoEfectivoPeriodo', COALESCE((SELECT sum(ef) FROM f), 0),
    'pagoTransferenciaPeriodo', COALESCE((SELECT sum(trf) FROM f), 0),
    'pagoTarjetaPeriodo', COALESCE((SELECT sum(tar) FROM f), 0),
    'pagoCreditoPeriodo', COALESCE((SELECT sum(cred) FROM f), 0),
    'recientes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', r.id, 'numero', r.numero, 'clienteNombre', r.cliente_nombre,
               'metodoPago', r.metodo_pago, 'tipoVenta', r.tipo_venta, 'estadoPago', r.estado_pago,
               'total', r.total, 'createdAt', r.created_at) ORDER BY r.created_at DESC, r.id DESC)
      FROM (SELECT * FROM f ORDER BY created_at DESC, id DESC LIMIT 5) r
    ), '[]'::jsonb)
  )
  INTO v_ventas;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('fecha', s.fecha, 'ingresos', s.ingresos, 'gastos', s.gastos)
                            ORDER BY s.fecha), '[]'::jsonb)
  INTO v_serie
  FROM public.serie_ingresos_gastos(14) s;

  SELECT jsonb_build_object(
    'total', COALESCE(sum(GREATEST(0, COALESCE(fa.total, 0) - COALESCE(fa.monto_abonado, 0))), 0),
    'count', count(*)
  )
  INTO v_cartera
  FROM public.facturas fa
  WHERE fa.drogueria_id = v_tenant AND fa.estado_pago = 'pendiente';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', t.producto_id, 'nombre', t.nombre, 'unidadesEquiv', t.unidades_equivalentes,
           'cajasEquiv', t.cajas_equivalentes, 'ingresos', t.ingresos)), '[]'::jsonb)
  INTO v_top
  FROM public.ventas_por_producto(v_desde30, 5, 'ingresos') t;

  SELECT count(*) INTO v_usuarios
  FROM public.profiles pr
  WHERE pr.drogueria_id = v_tenant AND pr.status = 'activo' AND pr.role <> 'superadmin';

  RETURN jsonb_build_object(
    'hoy', v_hoy,
    'inventario', v_inventario,
    'ventas', v_ventas,
    'serie14Dias', v_serie,
    'cartera', v_cartera,
    'topProductos', v_top,
    'usuariosActivos', v_usuarios
  );
END;
$$;

-- 12. Permisos. Las funciones nuevas reciben EXECUTE para PUBLIC por defecto en
-- PostgreSQL: se retira explícitamente.
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.crear_factura_v2_tx(
  text, text, text, text, integer, text, numeric, uuid, uuid,
  public.factura_item_input[], numeric, numeric, numeric, numeric
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_factura_v2_tx(
  text, text, text, text, integer, text, numeric, uuid, uuid,
  public.factura_item_input[], numeric, numeric, numeric, numeric
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.anular_factura_v2_tx(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anular_factura_v2_tx(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.catalogo_sync(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.catalogo_sync(timestamptz) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.bitacora_inventario(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bitacora_inventario(uuid, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.serie_ingresos_gastos(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.serie_ingresos_gastos(integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.pedido_sugerido() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pedido_sugerido() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.dashboard_resumen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_resumen() TO authenticated, service_role;
