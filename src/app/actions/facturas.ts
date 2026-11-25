/* eslint-disable @typescript-eslint/no-explicit-any */
'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requireActiveUser, requireAdmin } from '@/lib/auth/session'
import { computeSellableStockFromLots } from '@/lib/inventario/fraccionamiento'
import { validateAndNormalizePago, type MetodoPagoPos } from '@/lib/pos/pago-mixto'

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
  metodo_pago: MetodoPagoPos
  pago_efectivo?: number
  pago_tarjeta?: number
  pago_transferencia?: number
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

    const pagoCheck = validateAndNormalizePago({
      total: data.total,
      tipoVenta: data.tipo_venta,
      metodoPago: data.metodo_pago,
      pagoEfectivo: data.pago_efectivo,
      pagoTarjeta: data.pago_tarjeta,
      pagoTransferencia: data.pago_transferencia,
    })

    if (!pagoCheck.ok) {
      throw new Error(pagoCheck.error)
    }

    const itemsRpc = data.items.map(item => ({
      producto_id: item.producto_id,
      cantidad_cajas: item.cantidad_cajas,
      cantidad_blisters: item.cantidad_blisters,
      cantidad_unidades: item.cantidad_unidades,
    }))

    const docClean = data.cliente_documento?.trim()
    const documentoFinal = !docClean || docClean === '000000000' ? '222222222222' : docClean

    const { data: rpcResult, error: rpcError } = await supabase.rpc('crear_factura_tx', {
      p_cliente_nombre: data.cliente_nombre,
      p_cliente_documento: documentoFinal,
      p_metodo_pago: pagoCheck.metodoPago,
      p_tipo_venta: data.tipo_venta,
      p_condicion_pago_dias: data.condicion_pago_dias,
      p_orden_compra: data.orden_compra || '',
      p_descuento_porcentaje: data.descuento_porcentaje,
      p_iva_porcentaje: data.iva_porcentaje,
      p_vendedor_id: data.vendedor_id || auth.user.id,
      p_caja_sesion_id: data.caja_sesion_id,
      p_items: itemsRpc,
      p_pago_efectivo: pagoCheck.pagoEfectivo,
      p_pago_tarjeta: pagoCheck.pagoTarjeta,
      p_pago_transferencia: pagoCheck.pagoTransferencia,
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
  const [{ data, error }, { data: productosFormula }, { data: lotesData }] = await Promise.all([
    supabase
      .from('vista_inventario_completo' as any)
      .select('*')
      .order('nombre_producto', { ascending: true }),
    supabase.from('productos').select('id, requiere_formula'),
    supabase
      .from('inventario_lotes')
      .select('id, inventario_id, producto_id, lote, fecha_vencimiento, cajas, blisters, unidades, costo_caja, created_at')
      .order('fecha_vencimiento', { ascending: true }),
  ])

  if (error) {
    console.error('Error fetching inventario para POS:', error)
    return []
  }

  const formulaMap = new Map(
    (productosFormula || []).map((p) => [p.id, Boolean(p.requiere_formula)])
  )

  const lotesByInv = new Map<string, NonNullable<typeof lotesData>>()
  for (const lote of lotesData || []) {
    const arr = lotesByInv.get(lote.inventario_id) || []
    arr.push(lote)
    lotesByInv.set(lote.inventario_id, arr)
  }

  return ((data || []) as any[]).map((item) => {
    const itemLotes = item.inventario_id ? lotesByInv.get(item.inventario_id) || [] : []
    const summary = computeSellableStockFromLots(itemLotes, {
      lote: item.lote,
      fecha_vencimiento: item.fecha_vencimiento,
      cajas: item.cajas,
      blisters: item.blisters,
      unidades: item.unidades,
      precio_caja: item.precio_caja,
    })

    return {
      ...item,
      cajas: summary.cajas,
      blisters: summary.blisters,
      unidades: summary.unidades,
      cajas_fisicas: summary.cajas_fisicas,
      blisters_fisicos: summary.blisters_fisicos,
      unidades_fisicas: summary.unidades_fisicas,
      tiene_stock_vencido: summary.tiene_stock_vencido,
      todo_vencido: summary.todo_vencido,
      lotes_activos: summary.lotes_ordenados,
      requiere_formula: item.producto_id ? formulaMap.get(item.producto_id) ?? false : false,
    }
  })
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

    const { data: fac, error: facErr } = await supabase
      .from('facturas')
      .select('total, monto_abonado, estado_pago')
      .eq('id', facturaId)
      .single()

    if (facErr || !fac) throw new Error('Factura no encontrada')
    if (fac.estado_pago !== 'pendiente') {
      throw new Error('Esta factura no está pendiente de cobro')
    }

    const saldoPendiente = Math.max(0, Number(fac.total || 0) - Number(fac.monto_abonado || 0))
    if (saldoPendiente <= 0) {
      throw new Error('La factura no tiene saldo pendiente por cobrar')
    }

    const { error } = await supabase.rpc('registrar_abono_factura_tx', {
      p_factura_id: facturaId,
      p_caja_sesion_id: cajaSesionId,
      p_monto: saldoPendiente,
      p_metodo_pago: metodoPago || 'efectivo',
      p_notas: 'Cobro total de cartera',
    })

    if (error) throw new Error(error.message)

    revalidatePath('/facturas')
    revalidatePath('/dashboard')
    revalidatePath('/reportes')
    return { success: true }
  } catch (error: any) {
    console.error('Error al marcar como pagada:', error)
    return { success: false, error: error.message }
  }
}

export async function getCartera() {
  const supabase = await createClient()
  const [{ data, error }, { data: pendientes }] = await Promise.all([
    supabase
      .from('vista_cartera' as any)
      .select('*')
      .order('fecha_vencimiento', { ascending: true }),
    supabase
      .from('facturas')
      .select('id, monto_abonado, total, estado_pago')
      .eq('estado_pago', 'pendiente'),
  ])

  if (error) {
    console.error('Error fetching cartera:', error)
    return []
  }

  const facturaMap = new Map(
    (pendientes || []).map((f) => [
      f.id,
      {
        monto_abonado: Number(f.monto_abonado || 0),
        total: Number(f.total || 0),
      },
    ])
  )

  return ((data || []) as any[])
    .filter((row) => row.estado_pago === 'pendiente')
    .map((row) => {
      const extra = row.id ? facturaMap.get(row.id) : undefined
      const total = Number(row.total_con_descuento ?? extra?.total ?? row.total ?? 0)
      const montoAbonado = extra?.monto_abonado ?? 0
      const saldoPendiente = Math.max(0, total - montoAbonado)
      return {
        ...row,
        monto_abonado: montoAbonado,
        saldo_pendiente: saldoPendiente,
      }
    })
}

export async function registrarAbonoFactura(
  facturaId: string,
  cajaSesionId: string,
  monto: number,
  metodoPago: string,
  notas?: string
) {
  const supabase = await createClient()
  try {
    const auth = await requireActiveUser()
    if (!auth.ok) throw new Error(auth.error)

    const { data, error } = await supabase.rpc('registrar_abono_factura_tx', {
      p_factura_id: facturaId,
      p_caja_sesion_id: cajaSesionId,
      p_monto: monto,
      p_metodo_pago: metodoPago || 'efectivo',
      p_notas: notas || '',
    })

    if (error) throw new Error(error.message)

    revalidatePath('/facturas')
    revalidatePath('/dashboard')
    revalidatePath('/reportes')

    return { success: true, data }
  } catch (error: any) {
    console.error('Error al registrar abono:', error)
    return { success: false, error: error.message || 'No se pudo registrar el abono' }
  }
}

export async function anularFactura(facturaId: string, motivo: string) {
  const supabase = await createClient()
  try {
    const auth = await requireAdmin()
    if (!auth.ok) throw new Error(auth.error)

    const { data, error } = await supabase.rpc('anular_factura_tx', {
      p_factura_id: facturaId,
      p_motivo: motivo.trim(),
    })

    if (error) throw new Error(error.message)

    revalidatePath('/facturas')
    revalidatePath('/inventario')
    revalidatePath('/dashboard')
    revalidatePath('/reportes')

    return { success: true, data }
  } catch (error: any) {
    console.error('Error al anular factura:', error)
    return { success: false, error: error.message || 'No se pudo anular la factura' }
  }
}
