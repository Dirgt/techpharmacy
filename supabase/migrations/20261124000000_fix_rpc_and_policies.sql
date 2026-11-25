-- Migración: Permisos de tablas/vistas para rol authenticated, soporte de estados de caja ('abierta'/'abierto') y actualización de laboratorio en upsert_inventario_tx
-- Preserva intactas las políticas RLS de "Aislamiento Multi-Tenant" (drogueria_id = get_current_drogueria_id())

-- 1. Otorgar privilegios faltantes al rol authenticated en tablas y vistas públicas
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.auditoria_inventario,
  public.caja_sesiones,
  public.clientes,
  public.compra_detalles,
  public.compras,
  public.cronogramas,
  public.factura_detalles,
  public.facturas,
  public.gastos,
  public.inventario,
  public.laboratorios,
  public.logs_actividad,
  public.productos,
  public.profiles,
  public.proveedores
TO authenticated;

GRANT SELECT ON TABLE
  public.droguerias,
  public.vista_cartera,
  public.vista_inventario_completo
TO authenticated;

-- 2. Actualizar registrar_gasto_tx para aceptar tanto 'abierta' como 'abierto'
CREATE OR REPLACE FUNCTION public.registrar_gasto_tx(
  p_caja_sesion_id uuid,
  p_concepto text,
  p_monto numeric,
  p_tipo text,
  p_comprobante text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
  v_gasto_id UUID;
  v_estado_caja TEXT;
BEGIN
  -- Validar que la caja esté abierta (soporta 'abierta' y 'abierto')
  SELECT estado INTO v_estado_caja FROM public.caja_sesiones WHERE id = p_caja_sesion_id;
  IF v_estado_caja IS NULL OR v_estado_caja NOT IN ('abierta', 'abierto') THEN
    RAISE EXCEPTION 'La caja no está abierta';
  END IF;

  INSERT INTO public.gastos (caja_sesion_id, concepto, monto, tipo, comprobante)
  VALUES (p_caja_sesion_id, p_concepto, p_monto, p_tipo, p_comprobante)
  RETURNING id INTO v_gasto_id;

  RETURN jsonb_build_object('success', true, 'gasto_id', v_gasto_id);
END;
$function$;

-- 3. Actualizar upsert_inventario_tx conservando su firma de 23 parámetros con DEFAULT y actualizando laboratorio_id al editar un producto
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
BEGIN
  IF p_fecha_vencimiento IS NOT NULL AND p_fecha_vencimiento <> '' THEN
     v_fecha_vencimiento := p_fecha_vencimiento::DATE;
  END IF;

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
      lote = p_lote,
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
      p_margen_blister, p_margen_unidad, p_lote, p_registro_invima, p_seccion, p_ubicacion,
      p_blisters_por_caja, p_unidades_por_blister
    ) RETURNING * INTO v_new_inventario;
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

  v_diff_cajas := p_cajas - COALESCE(v_old_data.cajas, 0);
  v_diff_blisters := p_blisters - COALESCE(v_old_data.blisters, 0);
  v_diff_unidades := p_unidades - COALESCE(v_old_data.unidades, 0);

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
    inventario_id, operador, accion, valor_anterior, valor_nuevo, detalles
  ) VALUES (
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
