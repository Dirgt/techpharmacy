-- Supabase RPC for atomic inventario upsert

CREATE OR REPLACE FUNCTION upsert_inventario_tx(
  p_producto_id UUID,
  p_codigo TEXT,
  p_nombre TEXT,
  p_principio_activo TEXT,
  p_laboratorio_id UUID,
  p_fecha_vencimiento DATE,
  p_cajas INTEGER,
  p_blisters INTEGER,
  p_unidades INTEGER,
  p_precio_caja NUMERIC,
  p_precio_blister NUMERIC,
  p_precio_unidad NUMERIC,
  p_porcentaje_ganancia NUMERIC,
  p_margen_blister NUMERIC,
  p_margen_unidad NUMERIC,
  p_lote TEXT,
  p_registro_invima TEXT,
  p_seccion TEXT,
  p_ubicacion TEXT,
  p_stock_minimo INTEGER,
  p_inventario_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
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
BEGIN
  -- 1. Product Logic
  v_final_producto_id := p_producto_id;
  
  IF v_final_producto_id IS NULL THEN
    -- Try to find by code
    SELECT id INTO v_final_producto_id FROM productos WHERE codigo = p_codigo LIMIT 1;
    
    IF v_final_producto_id IS NOT NULL THEN
      -- Update existing
      UPDATE productos 
      SET principio_activo = p_principio_activo, nombre = p_nombre 
      WHERE id = v_final_producto_id;
    ELSE
      -- Insert new
      INSERT INTO productos (codigo, nombre, principio_activo, laboratorio_id)
      VALUES (p_codigo, p_nombre, p_principio_activo, p_laboratorio_id)
      RETURNING id INTO v_final_producto_id;
    END IF;
  ELSE
    UPDATE productos 
    SET principio_activo = p_principio_activo, nombre = p_nombre 
    WHERE id = v_final_producto_id;
  END IF;

  -- 2. Fetch Old Inventory Data (if editing)
  IF p_inventario_id IS NOT NULL THEN
    SELECT * INTO v_old_data FROM inventario WHERE id = p_inventario_id;
  ELSE
    -- If no ID passed, try to see if inventory for this product already exists (upsert logic)
    SELECT * INTO v_old_data FROM inventario WHERE producto_id = v_final_producto_id LIMIT 1;
    IF v_old_data IS NOT NULL THEN
       p_inventario_id := v_old_data.id;
    END IF;
  END IF;

  -- 3. Upsert Inventory
  IF p_inventario_id IS NOT NULL THEN
    UPDATE inventario SET
      fecha_vencimiento = p_fecha_vencimiento,
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
      updated_at = NOW()
    WHERE id = p_inventario_id
    RETURNING * INTO v_new_inventario;
  ELSE
    INSERT INTO inventario (
      producto_id, fecha_vencimiento, cajas, blisters, unidades, stock_minimo,
      precio_caja, precio_blister, precio_unidad, porcentaje_ganancia,
      margen_blister, margen_unidad, lote, registro_invima, seccion, ubicacion
    ) VALUES (
      v_final_producto_id, p_fecha_vencimiento, p_cajas, p_blisters, p_unidades, p_stock_minimo,
      p_precio_caja, p_precio_blister, p_precio_unidad, p_porcentaje_ganancia,
      p_margen_blister, p_margen_unidad, p_lote, p_registro_invima, p_seccion, p_ubicacion
    ) RETURNING * INTO v_new_inventario;
  END IF;

  -- 4. Audit Logic
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

  INSERT INTO auditoria_inventario (
    inventario_id, operador, accion, valor_anterior, valor_nuevo, detalles
  ) VALUES (
    v_new_inventario.id, 
    v_operador_real, 
    v_accion, 
    COALESCE(to_jsonb(v_old_data), '{}'::jsonb), 
    to_jsonb(v_new_inventario), 
    v_detalles
  );

  RETURN to_jsonb(v_new_inventario);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
