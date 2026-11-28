'use server'

import { createClient } from '@/lib/supabase/server'
import { requireActiveUser, requireAdmin } from '@/lib/auth/session'
import {
  addDaysToDateOnly,
  getBogotaDateString,
  getBogotaDayRange,
  getBogotaMonthRange,
  getBogotaMonthString,
} from '@/lib/date/bogota'
import { fetchAllPages } from '@/lib/supabase/fetch-all'

export async function getVentasDelDia() {
  const auth = await requireActiveUser()
  if (!auth.ok) return { success: false, data: [], error: auth.error }

  const supabase = await createClient()
  const { start, endExclusive } = getBogotaDayRange()

  const { data: facturas, error } = await supabase
    .from('facturas')
    .select(`*, vendedor:vendedor_id ( full_name, role ), detalles:factura_detalles ( cantidad_cajas, cantidad_blisters, cantidad_unidades, precio_unitario, producto:producto_id ( nombre, codigo ) )`)
    .gte('created_at', start)
    .lt('created_at', endExclusive)
    .order('created_at', { ascending: false })

  if (error) return { success: false, data: [] }
  return { success: true, data: facturas || [] }
}

export async function getReporteFinancieroDiario() {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, data: { facturas: [], gastos: [], compras: [] }, error: auth.error }

  const supabase = await createClient()
  const { start, endExclusive } = getBogotaDayRange()

  const [{ data: facturas }, { data: gastos }, { data: compras }] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from('facturas')
        .select('total, metodo_pago, estado_pago, pago_efectivo, pago_tarjeta, pago_transferencia')
        .neq('estado_pago', 'anulada')
        .gte('created_at', start)
        .lt('created_at', endExclusive)
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase
        .from('gastos')
        .select('monto, tipo')
        .gte('created_at', start)
        .lt('created_at', endExclusive)
        .order('id', { ascending: true })
        .range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase
        .from('compras')
        .select('total, metodo_pago, estado_pago')
        .gte('created_at', start)
        .lt('created_at', endExclusive)
        .order('id', { ascending: true })
        .range(from, to)
    ),
  ])

  return {
    success: true,
    data: {
      facturas: facturas || [],
      gastos: gastos || [],
      compras: compras || []
    }
  }
}

export async function getIngresosGastosMensuales() {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, data: [], error: auth.error }

  // Agregado por día de Colombia en la base: llegan 7 filas, no cada venta.
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('serie_ingresos_gastos', { p_dias: 7 })
  if (error) {
    console.error('Error consultando ingresos y gastos:', error)
    return { success: false, data: [] }
  }

  return {
    success: true,
    data: (data || []).map((d) => ({
      fecha: String(d.fecha),
      ingresos: Number(d.ingresos || 0),
      gastos: Number(d.gastos || 0),
    })),
  }
}

export async function getTopProductos() {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, data: [], error: auth.error }

  const supabase = await createClient()
  const startDate = addDaysToDateOnly(getBogotaDateString(), -29)
  const { start } = getBogotaDayRange(startDate)

  // Agregado en la base: últimos 30 días, sin anuladas, en cajas equivalentes reales.
  const { data, error } = await supabase.rpc('ventas_por_producto', {
    p_desde: start,
    p_limite: 10,
    p_orden: 'cantidad',
  })

  if (error || !data) {
    if (error) console.error('Error consultando top de productos:', error)
    return { success: false, data: [] }
  }

  return {
    success: true,
    data: data.map((item) => ({
      name: item.nombre || 'Desconocido',
      ventas: Math.round(Number(item.cajas_equivalentes || 0) * 100) / 100,
    })),
  }
}

export interface PedidoSugeridoItem {
  producto_id: string
  codigo: string
  nombre: string
  principio_activo: string | null
  laboratorio: string
  stock_actual_cajas: number
  stock_minimo: number
  ventas_30d_cajas: number
  sugerido_cajas: number
}

export async function getPedidoSugerido(): Promise<{
  success: boolean
  data: PedidoSugeridoItem[]
}> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, data: [] }

  // Misma regla que antes (demanda de 30 días frente a stock vigente), calculada
  // en la base: solo llegan los productos que hay que pedir.
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('pedido_sugerido')
  if (error) {
    console.error('Error calculando pedido sugerido:', error)
    return { success: false, data: [] }
  }

  return {
    success: true,
    data: (data || []).map((row) => ({
      producto_id: row.producto_id,
      codigo: row.codigo,
      nombre: row.nombre,
      principio_activo: row.principio_activo ?? null,
      laboratorio: row.laboratorio || 'Genérico',
      stock_actual_cajas: Number(row.stock_actual_cajas || 0),
      stock_minimo: Number(row.stock_minimo ?? 2),
      ventas_30d_cajas: Number(row.ventas_30d_cajas || 0),
      sugerido_cajas: Number(row.sugerido_cajas || 0),
    })),
  }
}

export interface AuditLogItem {
  id: string
  created_at: string | null
  accion: string
  detalles: string
  tipo_entidad: string | null
  usuario_nombre: string
}

export async function getLogsAuditoria(): Promise<{
  success: boolean
  data: AuditLogItem[]
}> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, data: [] }

  const supabase = await createClient()
  const [{ data: logs }, { data: profiles }] = await Promise.all([
    supabase
      .from('logs_actividad')
      .select('id, created_at, accion, detalles, tipo_entidad, usuario_id')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('profiles').select('id, full_name, username'),
  ])

  const userMap = new Map(
    (profiles || []).map((p) => [p.id, p.full_name || p.username || 'Usuario'])
  )

  const mapped: AuditLogItem[] = (logs || []).map((l) => ({
    id: l.id,
    created_at: l.created_at,
    accion: l.accion,
    detalles: l.detalles,
    tipo_entidad: l.tipo_entidad,
    usuario_nombre: l.usuario_id ? userMap.get(l.usuario_id) || 'Sistema' : 'Sistema',
  }))

  return { success: true, data: mapped }
}

export async function getVentasMesContable(mes?: string) {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, data: [], error: auth.error }

  const targetMonth = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : getBogotaMonthString()
  const { start, endExclusive } = getBogotaMonthRange(targetMonth)

  const supabase = await createClient()
  // Un mes puede superar las 1.000 ventas: se pagina para que el export contable salga completo.
  const { data, error, truncated } = await fetchAllPages(
    (from, to) =>
      supabase
        .from('facturas')
        .select(
          'numero, created_at, cliente_nombre, cliente_documento, tipo_venta, metodo_pago, estado_pago, subtotal_bruto, descuento_monto, iva_total, total, monto_abonado, pago_efectivo, pago_tarjeta, pago_transferencia'
        )
        .gte('created_at', start)
        .lt('created_at', endExclusive)
        .order('numero', { ascending: true })
        .range(from, to),
    { maxRows: 50000 }
  )

  if (error) {
    console.error('Error exportando ventas del mes:', error)
    return { success: false, data: [], error: 'No se pudieron consultar las ventas del mes.' }
  }
  if (truncated) {
    return {
      success: false,
      data: [],
      error: 'El mes supera 50.000 ventas; contacta soporte para exportarlo por partes.',
    }
  }
  return { success: true, data, mes: targetMonth }
}

export interface HistorialCajaItem {
  id: string
  estado: string | null
  fecha_apertura: string | null
  fecha_cierre: string | null
  monto_apertura: number
  monto_esperado: number | null
  monto_cierre: number | null
  diferencia: number | null
  abierto_por_nombre: string
  cerrado_por_nombre: string | null
}

export async function getHistorialCajas(): Promise<{
  success: boolean
  data: HistorialCajaItem[]
}> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, data: [] }

  const supabase = await createClient()
  const [{ data: sesiones }, { data: profiles }] = await Promise.all([
    supabase
      .from('caja_sesiones')
      .select(
        'id, estado, fecha_apertura, fecha_cierre, monto_apertura, monto_esperado, monto_cierre, diferencia, abierto_por, cerrado_por'
      )
      .order('fecha_apertura', { ascending: false })
      .limit(50),
    supabase.from('profiles').select('id, full_name, username'),
  ])

  const userMap = new Map(
    (profiles || []).map((p) => [p.id, p.full_name || p.username || 'Usuario'])
  )

  const mapped: HistorialCajaItem[] = (sesiones || []).map((s) => ({
    id: s.id,
    estado: s.estado,
    fecha_apertura: s.fecha_apertura,
    fecha_cierre: s.fecha_cierre,
    monto_apertura: Number(s.monto_apertura || 0),
    monto_esperado: s.monto_esperado !== null ? Number(s.monto_esperado) : null,
    monto_cierre: s.monto_cierre !== null ? Number(s.monto_cierre) : null,
    diferencia: s.diferencia !== null ? Number(s.diferencia) : null,
    abierto_por_nombre: s.abierto_por ? userMap.get(s.abierto_por) || 'Usuario' : 'Usuario',
    cerrado_por_nombre: s.cerrado_por ? userMap.get(s.cerrado_por) || 'Usuario' : null,
  }))

  return { success: true, data: mapped }
}
