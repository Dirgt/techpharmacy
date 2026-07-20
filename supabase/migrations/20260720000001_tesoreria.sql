-- Tabla: proveedores
CREATE TABLE IF NOT EXISTS public.proveedores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL,
    documento_nit TEXT,
    telefono TEXT,
    email TEXT,
    dias_credito INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW())
);

-- Tabla: compras
CREATE TABLE IF NOT EXISTS public.compras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    proveedor_id UUID REFERENCES public.proveedores(id),
    numero_factura TEXT NOT NULL,
    fecha_emision DATE NOT NULL DEFAULT CURRENT_DATE,
    total NUMERIC(10,2) NOT NULL DEFAULT 0,
    estado_pago TEXT NOT NULL DEFAULT 'pendiente', -- 'pagado', 'pendiente', 'credito'
    metodo_pago TEXT, -- 'efectivo', 'transferencia', 'tarjeta'
    caja_sesion_id UUID REFERENCES public.caja_sesiones(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW())
);

-- Tabla: compra_detalles
CREATE TABLE IF NOT EXISTS public.compra_detalles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    compra_id UUID REFERENCES public.compras(id) ON DELETE CASCADE,
    producto_id UUID REFERENCES public.productos(id),
    cantidad INTEGER NOT NULL DEFAULT 1,
    costo_unitario NUMERIC(10,2) NOT NULL DEFAULT 0,
    subtotal NUMERIC(10,2) NOT NULL DEFAULT 0
);

-- Tabla: gastos
CREATE TABLE IF NOT EXISTS public.gastos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caja_sesion_id UUID REFERENCES public.caja_sesiones(id) NOT NULL,
    concepto TEXT NOT NULL,
    monto NUMERIC(10,2) NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'operativo', -- 'caja_chica', 'operativo', 'nomina'
    comprobante TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::TEXT, NOW())
);

-- RPC: registrar_gasto_tx
CREATE OR REPLACE FUNCTION registrar_gasto_tx(
  p_caja_sesion_id UUID,
  p_concepto TEXT,
  p_monto NUMERIC,
  p_tipo TEXT,
  p_comprobante TEXT DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_gasto_id UUID;
  v_estado_caja TEXT;
BEGIN
  -- Validar que la caja esté abierta
  SELECT estado INTO v_estado_caja FROM public.caja_sesiones WHERE id = p_caja_sesion_id;
  IF v_estado_caja != 'abierta' THEN
    RAISE EXCEPTION 'La caja no está abierta';
  END IF;

  INSERT INTO public.gastos (caja_sesion_id, concepto, monto, tipo, comprobante)
  VALUES (p_caja_sesion_id, p_concepto, p_monto, p_tipo, p_comprobante)
  RETURNING id INTO v_gasto_id;

  RETURN jsonb_build_object('success', true, 'gasto_id', v_gasto_id);
END;
$$;

-- Type para registrar_compra_tx
DROP TYPE IF EXISTS compra_detalle_input CASCADE;
CREATE TYPE compra_detalle_input AS (
  producto_id UUID,
  cantidad INTEGER,
  costo_unitario NUMERIC
);

-- RPC: registrar_compra_tx
CREATE OR REPLACE FUNCTION registrar_compra_tx(
  p_proveedor_id UUID,
  p_numero_factura TEXT,
  p_total NUMERIC,
  p_estado_pago TEXT,
  p_metodo_pago TEXT,
  p_caja_sesion_id UUID,
  p_detalles compra_detalle_input[],
  p_user_id UUID
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_compra_id UUID;
  v_detalle compra_detalle_input;
  v_inventario_id UUID;
  v_stock_actual INTEGER;
BEGIN
  -- 1. Insertar compra
  INSERT INTO public.compras (proveedor_id, numero_factura, total, estado_pago, metodo_pago, caja_sesion_id)
  VALUES (p_proveedor_id, p_numero_factura, p_total, p_estado_pago, p_metodo_pago, p_caja_sesion_id)
  RETURNING id INTO v_compra_id;

  -- 2. Procesar detalles
  FOREACH v_detalle IN ARRAY p_detalles LOOP
    -- Insertar detalle de compra
    INSERT INTO public.compra_detalles (compra_id, producto_id, cantidad, costo_unitario, subtotal)
    VALUES (v_compra_id, v_detalle.producto_id, v_detalle.cantidad, v_detalle.costo_unitario, (v_detalle.cantidad * v_detalle.costo_unitario));

    -- Actualizar inventario (sumar cajas)
    SELECT id, cajas INTO v_inventario_id, v_stock_actual FROM public.inventario WHERE producto_id = v_detalle.producto_id;
    IF FOUND THEN
      UPDATE public.inventario 
      SET cajas = cajas + v_detalle.cantidad, 
          precio_caja = v_detalle.costo_unitario, 
          updated_at = NOW() 
      WHERE id = v_inventario_id;

      -- Auditoria
      INSERT INTO public.auditoria_inventario (inventario_id, accion, operador, valor_anterior, valor_nuevo, detalles)
      VALUES (v_inventario_id, 'ENTRADA_COMPRA', p_user_id::text, v_stock_actual::text, (v_stock_actual + v_detalle.cantidad)::text, 'Compra Fac #' || p_numero_factura);
    ELSE
      -- Si no existe en inventario, se asume que se creó antes. Si no, lanza error.
      RAISE EXCEPTION 'Producto % no encontrado en inventario', v_detalle.producto_id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'compra_id', v_compra_id);
END;
$$;
