/* eslint-disable @typescript-eslint/no-explicit-any */
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireActiveUser } from '@/lib/auth/session'

export type FacturaItem = {
  producto_id: string
  nombre: string
  cantidad_cajas: number
  cantidad_blisters: number
  cantidad_unidades: number
  precio_unitario_base: number
  descuento_porcentaje: number
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
    const auth = await requireActiveUser()
    if (!auth.ok) throw new Error(auth.error)

    const itemsRpc = data.items.map(item => ({
      producto_id: item.producto_id,
      cantidad_cajas: item.cantidad_cajas,
      cantidad_blisters: item.cantidad_blisters,
      cantidad_unidades: item.cantidad_unidades,
    }))

    const { data: rpcResult, error: rpcError } = await supabase.rpc('crear_factura_tx', {
      p_cliente_nombre: data.cliente_nombre,
      p_cliente_documento: data.cliente_documento,
      p_metodo_pago: data.metodo_pago,
      p_tipo_venta: data.tipo_venta,
      p_condicion_pago_dias: data.condicion_pago_dias,
      p_orden_compra: data.orden_compra || '',
      p_descuento_porcentaje: data.descuento_porcentaje,
      p_iva_porcentaje: data.iva_porcentaje,
      p_vendedor_id: data.vendedor_id || auth.user.id,
      p_caja_sesion_id: data.caja_sesion_id,
      p_items: itemsRpc,
    })

    if (rpcError) throw new Error(rpcError.message)

    const factura = (typeof rpcResult === 'object' && rpcResult !== null ? rpcResult : {}) as {
      id: string
      numero: number
      total?: number
    }

    revalidatePath('/facturas')
    revalidatePath('/inventario')
    revalidatePath('/dashboard')
    revalidatePath('/reportes')

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
    .from('vista_inventario_completo' as any)
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
    const auth = await requireActiveUser()
    if (!auth.ok) throw new Error(auth.error)

    const { error } = await supabase
      .from('facturas')
      .update({
        estado_pago: 'pagado',
        metodo_pago: metodoPago,
        caja_sesion_id: cajaSesionId
      } as any)
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
    .from('vista_cartera' as any)
    .select('*')
    .order('fecha_vencimiento', { ascending: true })

  if (error) {
    console.error('Error fetching cartera:', error)
    return []
  }
  return data
}
