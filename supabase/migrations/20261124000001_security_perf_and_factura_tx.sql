-- Migración: Endurecimiento de seguridad, índices de rendimiento, campos fiscales de droguería y facturación atómica

-- 1. Fijar search_path en todas las funciones públicas (elimina function_search_path_mutable)
ALTER FUNCTION public.update_clientes_timestamp() SET search_path = public;
ALTER FUNCTION public.registrar_gasto_tx(uuid, text, numeric, text, text) SET search_path = public;
ALTER FUNCTION public.registrar_compra_tx(uuid, text, numeric, text, text, uuid, compra_detalle_input[], uuid) SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.upsert_inventario_tx(
  uuid, text, text, text, uuid, uuid, integer, integer, integer, integer,
  numeric, numeric, numeric, numeric, numeric, numeric,
  text, text, text, text, text, integer, integer
) SET search_path = public;

-- 2. Restringir ejecución de funciones SECURITY DEFINER expuestas vía PostgREST
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_current_drogueria_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_current_drogueria_id() TO authenticated;

-- 3. Eliminar tabla residual de pruebas
DROP TABLE IF EXISTS public.test_results;

-- 4. Índices de cobertura para llaves foráneas (elimina unindexed_foreign_keys en consultas multi-tenant)
CREATE INDEX IF NOT EXISTS idx_auditoria_inventario_drogueria_id ON public.auditoria_inventario(drogueria_id);
CREATE INDEX IF NOT EXISTS idx_caja_sesiones_drogueria_id ON public.caja_sesiones(drogueria_id);
CREATE INDEX IF NOT EXISTS idx_clientes_drogueria_id ON public.clientes(drogueria_id);
CREATE INDEX IF NOT EXISTS idx_compra_detalles_drogueria_id ON public.compra_detalles(drogueria_id);
CREATE INDEX IF NOT EXISTS idx_compras_drogueria_id ON public.compras(drogueria_id);
CREATE INDEX IF NOT EXISTS idx_cronogramas_drogueria_id ON public.cronogramas(drogueria_id);
CREATE INDEX IF NOT EXISTS idx_factura_detalles_drogueria_id ON public.factura_detalles(drogueria_id);
CREATE INDEX IF NOT EXISTS idx_facturas_drogueria_id ON public.facturas(drogueria_id);
CREATE INDEX IF NOT EXISTS idx_gastos_drogueria_id ON public.gastos(drogueria_id);
CREATE INDEX IF NOT EXISTS idx_inventario_drogueria_id ON public.inventario(drogueria_id);
CREATE INDEX IF NOT EXISTS idx_laboratorios_drogueria_id ON public.laboratorios(drogueria_id);
CREATE INDEX IF NOT EXISTS idx_logs_actividad_drogueria_id ON public.logs_actividad(drogueria_id);
CREATE INDEX IF NOT EXISTS idx_productos_drogueria_id ON public.productos(drogueria_id);
CREATE INDEX IF NOT EXISTS idx_productos_laboratorio_id ON public.productos(laboratorio_id);
CREATE INDEX IF NOT EXISTS idx_profiles_drogueria_id ON public.profiles(drogueria_id);
CREATE INDEX IF NOT EXISTS idx_proveedores_drogueria_id ON public.proveedores(drogueria_id);

-- 5. Campos fiscales opcionales en droguerias para factura impresa dinámica
ALTER TABLE public.droguerias
  ADD COLUMN IF NOT EXISTS nit TEXT,
  ADD COLUMN IF NOT EXISTS direccion TEXT,
  ADD COLUMN IF NOT EXISTS telefono TEXT,
  ADD COLUMN IF NOT EXISTS regimen TEXT;

-- 6. Tipo y RPC atómica de facturación (cálculo de PVP y validación de stock en el servidor)
DROP TYPE IF EXISTS public.factura_item_input CASCADE;
CREATE TYPE public.factura_item_input AS (
  producto_id UUID,
  cantidad_cajas INTEGER,
  cantidad_blisters INTEGER,
  cantidad_unidades INTEGER
);

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
  p_items public.factura_item_input[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_operator_name TEXT;
  v_estado_caja TEXT;
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
  v_new_cajas INTEGER;
  v_new_blisters INTEGER;
  v_new_unidades INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no autenticado';
  END IF;

  IF COALESCE(array_length(p_items, 1), 0) = 0 THEN
    RAISE EXCEPTION 'La factura debe tener al menos un producto';
  END IF;

  SELECT estado INTO v_estado_caja
  FROM public.caja_sesiones
  WHERE id = p_caja_sesion_id;

  IF v_estado_caja IS NULL OR v_estado_caja NOT IN ('abierta', 'abierto') THEN
    RAISE EXCEPTION 'La caja no está abierta';
  END IF;

  SELECT full_name INTO v_operator_name
  FROM public.profiles
  WHERE id = COALESCE(p_vendedor_id, v_user_id);

  IF v_operator_name IS NULL THEN
    v_operator_name := 'Vendedor';
  END IF;

  v_descuento_pct := GREATEST(0, LEAST(100, COALESCE(p_descuento_porcentaje, 0)));
  v_iva_pct := GREATEST(0, LEAST(100, COALESCE(p_iva_porcentaje, 0)));

  IF p_tipo_venta = 'credito' AND COALESCE(p_condicion_pago_dias, 0) > 0 THEN
    v_fecha_venc := CURRENT_DATE + p_condicion_pago_dias;
  END IF;

  v_estado_pago := CASE WHEN p_tipo_venta = 'contado' THEN 'pagado' ELSE 'pendiente' END;

  INSERT INTO public.facturas (
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
    COALESCE(NULLIF(TRIM(p_cliente_nombre), ''), 'Consumidor Final'),
    COALESCE(NULLIF(TRIM(p_cliente_documento), ''), '000000000'),
    p_metodo_pago,
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
  RETURNING id, numero INTO v_factura_id, v_factura_numero;

  FOREACH v_item IN ARRAY p_items LOOP
    IF COALESCE(v_item.cantidad_cajas, 0) < 0
       OR COALESCE(v_item.cantidad_blisters, 0) < 0
       OR COALESCE(v_item.cantidad_unidades, 0) < 0
       OR (COALESCE(v_item.cantidad_cajas, 0) + COALESCE(v_item.cantidad_blisters, 0) + COALESCE(v_item.cantidad_unidades, 0)) <= 0 THEN
      RAISE EXCEPTION 'Cantidades inválidas en la factura';
    END IF;

    SELECT i.*, p.nombre AS producto_nombre
    INTO v_inv
    FROM public.inventario i
    JOIN public.productos p ON p.id = i.producto_id
    WHERE i.producto_id = v_item.producto_id
    FOR UPDATE OF i;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Producto % no encontrado en inventario', v_item.producto_id;
    END IF;

    v_prod_nombre := v_inv.producto_nombre;

    IF COALESCE(v_inv.cajas, 0) < COALESCE(v_item.cantidad_cajas, 0)
       OR COALESCE(v_inv.blisters, 0) < COALESCE(v_item.cantidad_blisters, 0)
       OR COALESCE(v_inv.unidades, 0) < COALESCE(v_item.cantidad_unidades, 0) THEN
      RAISE EXCEPTION 'Stock insuficiente para %', v_prod_nombre;
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

    v_line_base := (v_pvp_caja * COALESCE(v_item.cantidad_cajas, 0))
                 + (v_pvp_blister * COALESCE(v_item.cantidad_blisters, 0))
                 + (v_pvp_unidad * COALESCE(v_item.cantidad_unidades, 0));
    v_line_net := ROUND(v_line_base * (1 - (v_descuento_pct / 100.0)), 2);

    v_subtotal_bruto := v_subtotal_bruto + v_line_base;
    v_subtotal_neto := v_subtotal_neto + v_line_net;

    INSERT INTO public.factura_detalles (
      factura_id,
      producto_id,
      cantidad_cajas,
      cantidad_blisters,
      cantidad_unidades,
      precio_unitario
    ) VALUES (
      v_factura_id,
      v_item.producto_id,
      COALESCE(v_item.cantidad_cajas, 0),
      COALESCE(v_item.cantidad_blisters, 0),
      COALESCE(v_item.cantidad_unidades, 0),
      v_line_net
    );

    v_new_cajas := GREATEST(0, COALESCE(v_inv.cajas, 0) - COALESCE(v_item.cantidad_cajas, 0));
    v_new_blisters := GREATEST(0, COALESCE(v_inv.blisters, 0) - COALESCE(v_item.cantidad_blisters, 0));
    v_new_unidades := GREATEST(0, COALESCE(v_inv.unidades, 0) - COALESCE(v_item.cantidad_unidades, 0));

    UPDATE public.inventario
    SET cajas = v_new_cajas,
        blisters = v_new_blisters,
        unidades = v_new_unidades,
        updated_at = NOW()
    WHERE id = v_inv.id;

    INSERT INTO public.auditoria_inventario (
      inventario_id,
      operador,
      accion,
      campo_modificado,
      valor_anterior,
      valor_nuevo,
      detalles
    ) VALUES (
      v_inv.id,
      v_operator_name,
      'VENTA',
      'stock',
      jsonb_build_object('cajas', v_inv.cajas, 'blisters', v_inv.blisters, 'unidades', v_inv.unidades)::text,
      jsonb_build_object('cajas', v_new_cajas, 'blisters', v_new_blisters, 'unidades', v_new_unidades)::text,
      'Venta Factura #' || v_factura_numero || ' — ' || COALESCE(p_cliente_nombre, 'Consumidor Final') || ' (' || p_tipo_venta || ')'
    );
  END LOOP;

  v_descuento_monto := ROUND(v_subtotal_bruto - v_subtotal_neto, 2);
  v_iva_total := ROUND(v_subtotal_neto * (v_iva_pct / 100.0));
  v_total := v_subtotal_neto + v_iva_total;

  UPDATE public.facturas
  SET subtotal_bruto = v_subtotal_bruto,
      descuento_monto = v_descuento_monto,
      iva_total = v_iva_total,
      total = v_total
  WHERE id = v_factura_id;

  RETURN jsonb_build_object(
    'id', v_factura_id,
    'numero', v_factura_numero,
    'total', v_total
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.crear_factura_tx(
  TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, NUMERIC, NUMERIC, UUID, UUID, public.factura_item_input[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_factura_tx(
  TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, NUMERIC, NUMERIC, UUID, UUID, public.factura_item_input[]
) TO authenticated;
