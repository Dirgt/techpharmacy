'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type FacturaItem = {
  producto_id: string
  nombre: string
  cantidad_cajas: number
  cantidad_blisters: number
  cantidad_unidades: number
  precio_linea: number
  precio_linea_original: number // precio sin descuento (para registro)
}

export type FacturaData = {
  cliente_nombre: string
  cliente_documento: string
  metodo_pago: 'efectivo' | 'tarjeta' | 'transferencia'
  tipo_venta: 'contado' | 'credito'
  condicion_pago_dias: number           // 0=contado, 30/60/90=crédito
  orden_compra?: string                 // Nro. OC del distribuidor
  subtotal_bruto: number                // suma de precios sin descuento
  descuento_porcentaje: number          // ej. 10
  descuento_monto: number               // monto en $ del descuento
  iva_porcentaje: number                // 0, 5 o 19
  iva_total: number                     // $ de IVA
  total: number                         // total final a cobrar
  vendedor_id: string
  caja_sesion_id: string
  items: FacturaItem[]
}

export async function crearFactura(data: FacturaData) {
  const supabase = await createClient()

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) throw new Error('Usuario no autenticado')

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', data.vendedor_id)
      .single()
    const operatorName = profile?.full_name || 'Vendedor'

    // Calcular fecha de vencimiento (solo para crédito)
    let fecha_vencimiento: string | null = null
    if (data.tipo_venta === 'credito' && data.condicion_pago_dias > 0) {
      const fechaVenc = new Date()
      fechaVenc.setDate(fechaVenc.getDate() + data.condicion_pago_dias)
      fecha_vencimiento = fechaVenc.toISOString().split('T')[0]
    }

    const estado_pago = data.tipo_venta === 'contado' ? 'pagado' : 'pendiente'

    // 2. Insertar la factura con todos los campos
    const { data: factura, error: facturaError } = await supabase
      .from('facturas')
      .insert({
        cliente_nombre:        data.cliente_nombre,
        cliente_documento:     data.cliente_documento,
        metodo_pago:           data.metodo_pago,
        tipo_venta:            data.tipo_venta,
        condicion_pago_dias:   data.condicion_pago_dias,
        fecha_vencimiento,
        orden_compra:          data.orden_compra || null,
        subtotal_bruto:        data.subtotal_bruto,
        descuento_porcentaje:  data.descuento_porcentaje,
        descuento_monto:       data.descuento_monto,
        iva_porcentaje:        data.iva_porcentaje,
        iva_total:             data.iva_total,
        total:                 data.total,
        estado_pago,
        vendedor_id:           data.vendedor_id,
        caja_sesion_id:        data.caja_sesion_id,
      })
      .select('id, numero')
      .single()

    if (facturaError) throw new Error('Error al crear la factura: ' + facturaError.message)

    // 3. Detalles
    const detalles = data.items.map(item => ({
      factura_id:          factura.id,
      producto_id:         item.producto_id,
      cantidad_cajas:      item.cantidad_cajas,
      cantidad_blisters:   item.cantidad_blisters,
      cantidad_unidades:   item.cantidad_unidades,
      precio_unitario:     item.precio_linea,
    }))

    const { error: detallesError } = await supabase.from('factura_detalles').insert(detalles)
    if (detallesError) throw new Error('Error al guardar detalles: ' + detallesError.message)

    // 4. Descontar inventario + auditoría
    for (const item of data.items) {
      const { data: invCurrent } = await supabase
        .from('inventario')
        .select('*')
        .eq('producto_id', item.producto_id)
        .single()

      if (invCurrent) {
        const newCajas     = Math.max(0, Number(invCurrent.cajas)    - item.cantidad_cajas)
        const newBlisters  = Math.max(0, Number(invCurrent.blisters) - item.cantidad_blisters)
        const newUnidades  = Math.max(0, Number(invCurrent.unidades) - item.cantidad_unidades)

        await supabase.from('inventario').update({
          cajas: newCajas, blisters: newBlisters, unidades: newUnidades
        }).eq('producto_id', item.producto_id)

        await supabase.from('auditoria_inventario').insert({
          inventario_id:    invCurrent.id,
          operador:         operatorName,
          accion:           'VENTA',
          campo_modificado: 'stock',
          valor_anterior:   JSON.stringify({ cajas: invCurrent.cajas, blisters: invCurrent.blisters, unidades: invCurrent.unidades }),
          valor_nuevo:      JSON.stringify({ cajas: newCajas, blisters: newBlisters, unidades: newUnidades }),
          detalles:         `Venta Factura #${factura.numero} — ${data.cliente_nombre} (${data.tipo_venta})`
        })
      }
    }

    revalidatePath('/facturas')
    revalidatePath('/inventario')

    return { success: true, factura }
  } catch (error: any) {
    console.error('Error en crearFactura:', error)
    return { success: false, error: error.message }
  }
}


export async function getFacturas() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('facturas')
    .select(`
      *,
      profiles:vendedor_id (full_name)
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('Error fetching facturas:', error)
    return []
  }
  return data
}

export async function getInventarioPOS() {
  const supabase = await createClient()
  // Usamos vista_inventario_completo para tener los nombres, laboratorios y precios actualizados
  const { data, error } = await supabase
    .from('vista_inventario_completo')
    .select('*')
    .order('nombre_producto', { ascending: true })
    
  if (error) {
    console.error('Error fetching inventario para POS:', error)
    return []
  }
  return data
}

export async function getVendedores() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('role', ['vendedor', 'admin'])
    .eq('status', 'activo')
    .order('full_name', { ascending: true })

  if (error) {
    console.error('Error fetching vendedores:', error)
    return []
  }
  return data
}

export async function marcarComoPagada(facturaId: string, cajaSesionId: string, metodoPago: string) {
  const supabase = await createClient()
  try {
    const { error } = await supabase
      .from('facturas')
      .update({
        estado_pago: 'pagado',
        metodo_pago: metodoPago,
        caja_sesion_id: cajaSesionId
      })
      .eq('id', facturaId)

    if (error) throw error
    revalidatePath('/facturas')
    return { success: true }
  } catch (error: any) {
    console.error('Error al marcar como pagada:', error)
    return { success: false, error: error.message }
  }
}

export async function getCartera() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vista_cartera')
    .select('*')
    .order('fecha_vencimiento', { ascending: true })

  if (error) {
    console.error('Error fetching cartera:', error)
    return []
  }
  return data
}
