'use server'

import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/session'

export async function getVentasDelDia() {
  const supabase = await createClient()
  
  const ahora = new Date()
  const inicioDia = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate(), 0, 0, 0, 0)).toISOString()
  const finDia = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate(), 23, 59, 59, 999)).toISOString()

  const { data: facturas, error } = await supabase
    .from('facturas')
    .select(`*, vendedor:vendedor_id ( full_name, role ), detalles:factura_detalles ( cantidad_cajas, cantidad_blisters, cantidad_unidades, precio_unitario, producto:producto_id ( nombre, codigo ) )`)
    .gte('created_at', inicioDia)
    .lte('created_at', finDia)
    .order('created_at', { ascending: false })

  if (error) return { success: false, data: [] }
  return { success: true, data: facturas || [] }
}

export async function getReporteFinancieroDiario() {
  const supabase = await createClient()
  
  const ahora = new Date()
  const inicioDia = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate(), 0, 0, 0, 0)).toISOString()
  const finDia = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate(), 23, 59, 59, 999)).toISOString()

  const [{ data: facturas }, { data: gastos }, { data: compras }] = await Promise.all([
    supabase
      .from('facturas')
      .select('total, metodo_pago, estado_pago, pago_efectivo, pago_tarjeta, pago_transferencia')
      .neq('estado_pago', 'anulada')
      .gte('created_at', inicioDia)
      .lte('created_at', finDia),
    supabase.from('gastos').select('monto, tipo').gte('created_at', inicioDia).lte('created_at', finDia),
    supabase.from('compras').select('total, metodo_pago, estado_pago').gte('created_at', inicioDia).lte('created_at', finDia),
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
  const supabase = await createClient()
  
  // Últimos 7 días para el gráfico
  const fin = new Date()
  const inicio = new Date()
  inicio.setDate(fin.getDate() - 6)
  inicio.setHours(0,0,0,0)

  const inicioIso = inicio.toISOString()
  const [{ data: facturas }, { data: gastos }, { data: compras }] = await Promise.all([
    supabase
      .from('facturas')
      .select('total, created_at')
      .neq('estado_pago', 'anulada')
      .gte('created_at', inicioIso),
    supabase.from('gastos').select('monto, created_at').gte('created_at', inicioIso),
    supabase.from('compras').select('total, created_at').gte('created_at', inicioIso),
  ])

  // Agrupar por día (YYYY-MM-DD)
  const porDia: Record<string, { fecha: string, ingresos: number, gastos: number }> = {}
  
  for(let i=0; i<7; i++) {
    const d = new Date(inicio)
    d.setDate(d.getDate() + i)
    const fechaStr = d.toISOString().split('T')[0]
    porDia[fechaStr] = { fecha: fechaStr, ingresos: 0, gastos: 0 }
  }

  facturas?.forEach(f => {
    if (!f.created_at) return
    const d = f.created_at.split('T')[0]
    if (porDia[d]) porDia[d].ingresos += Number(f.total || 0)
  })
  
  gastos?.forEach(g => {
    if (!g.created_at) return
    const d = g.created_at.split('T')[0]
    if (porDia[d]) porDia[d].gastos += Number(g.monto || 0)
  })

  compras?.forEach(c => {
    if (!c.created_at) return
    const d = c.created_at.split('T')[0]
    if (porDia[d]) porDia[d].gastos += Number(c.total || 0)
  })

  return { success: true, data: Object.values(porDia).sort((a,b) => a.fecha.localeCompare(b.fecha)) }
}

export async function getTopProductos() {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('factura_detalles')
    .select(`cantidad_cajas, cantidad_blisters, cantidad_unidades, producto_id, producto:productos ( nombre )`)

  if (error || !data) return { success: false, data: [] }

  const counts: Record<string, { name: string, cantidad: number }> = {}
  
  data.forEach(d => {
    if (!d.producto || !d.producto_id) return
    const prod = Array.isArray(d.producto) ? d.producto[0] : d.producto
    const nombre = prod?.nombre || 'Desconocido'
    const total = (d.cantidad_cajas || 0) + (d.cantidad_blisters || 0) * 0.1 + (d.cantidad_unidades || 0) * 0.01 // Aproximación
    if (!counts[d.producto_id]) counts[d.producto_id] = { name: nombre, cantidad: 0 }
    counts[d.producto_id].cantidad += total
  })

  const top10 = Object.values(counts)
    .sort((a,b) => b.cantidad - a.cantidad)
    .slice(0, 10)
    .map(x => ({ name: x.name, ventas: Math.round(x.cantidad) }))

  return { success: true, data: top10 }
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
  const supabase = await createClient()
  const hace30Dias = new Date()
  hace30Dias.setDate(hace30Dias.getDate() - 30)

  const [{ data: invRows }, { data: detallesRows }] = await Promise.all([
    supabase
      .from('inventario')
      .select(
        'producto_id, cajas, blisters, unidades, blisters_por_caja, unidades_por_blister, stock_minimo, producto:productos ( id, codigo, nombre, principio_activo, laboratorio:laboratorios ( nombre ) )'
      ),
    supabase
      .from('factura_detalles')
      .select(
        'producto_id, cantidad_cajas, cantidad_blisters, cantidad_unidades, factura:facturas!inner ( estado_pago, created_at )'
      )
      .neq('factura.estado_pago', 'anulada')
      .gte('factura.created_at', hace30Dias.toISOString()),
  ])

  const bpcByProd = new Map<string, { bpc: number; upb: number }>()
  for (const inv of invRows || []) {
    bpcByProd.set(inv.producto_id, {
      bpc: Math.max(inv.blisters_por_caja || 1, 1),
      upb: Math.max(inv.unidades_por_blister || 1, 1),
    })
  }

  const ventasPorProducto = new Map<string, number>()
  for (const det of detallesRows || []) {
    if (!det.producto_id) continue
    const ratios = bpcByProd.get(det.producto_id) || { bpc: 1, upb: 1 }
    const equivCajas =
      (det.cantidad_cajas || 0) +
      (det.cantidad_blisters || 0) / ratios.bpc +
      (det.cantidad_unidades || 0) / (ratios.bpc * ratios.upb)
    ventasPorProducto.set(
      det.producto_id,
      (ventasPorProducto.get(det.producto_id) || 0) + equivCajas
    )
  }

  const sugeridos: PedidoSugeridoItem[] = []
  for (const inv of invRows || []) {
    const prod = Array.isArray(inv.producto) ? inv.producto[0] : inv.producto
    if (!prod) continue
    const lab = Array.isArray(prod.laboratorio) ? prod.laboratorio[0] : prod.laboratorio

    const stockActual = Number(inv.cajas || 0)
    const stockMinimo = Number(inv.stock_minimo ?? 2)
    const demanda30d = Number((ventasPorProducto.get(inv.producto_id) || 0).toFixed(1))
    const objetivo = Math.max(demanda30d, stockMinimo * 2)
    const sugerido = Math.max(0, Math.ceil(objetivo - stockActual))

    if (sugerido > 0) {
      sugeridos.push({
        producto_id: inv.producto_id,
        codigo: prod.codigo,
        nombre: prod.nombre,
        principio_activo: prod.principio_activo ?? null,
        laboratorio: lab?.nombre || 'Genérico',
        stock_actual_cajas: stockActual,
        stock_minimo: stockMinimo,
        ventas_30d_cajas: demanda30d,
        sugerido_cajas: sugerido,
      })
    }
  }

  sugeridos.sort((a, b) => b.sugerido_cajas - a.sugerido_cajas)
  return { success: true, data: sugeridos }
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

  const targetMonth =
    mes && /^\d{4}-\d{2}$/.test(mes) ? mes : new Date().toISOString().slice(0, 7)
  const [yearStr, monthStr] = targetMonth.split('-')
  const year = Number(yearStr)
  const monthIdx = Number(monthStr) - 1
  const inicio = new Date(Date.UTC(year, monthIdx, 1, 0, 0, 0, 0)).toISOString()
  const fin = new Date(Date.UTC(year, monthIdx + 1, 0, 23, 59, 59, 999)).toISOString()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('facturas')
    .select(
      'numero, created_at, cliente_nombre, cliente_documento, tipo_venta, metodo_pago, estado_pago, subtotal_bruto, descuento_monto, iva_total, total, monto_abonado, pago_efectivo, pago_tarjeta, pago_transferencia'
    )
    .gte('created_at', inicio)
    .lte('created_at', fin)
    .order('numero', { ascending: true })

  if (error) return { success: false, data: [], error: error.message }
  return { success: true, data: data || [], mes: targetMonth }
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
