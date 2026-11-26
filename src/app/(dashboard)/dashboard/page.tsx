import { createClient } from '@/lib/supabase/server'
import { getCurrentUserWithProfile } from '@/lib/auth/session'
import { getSesionCajaAbierta } from '@/app/actions/caja'
import { PLAN_CONFIG, type TenantPlan } from '@/lib/tenant/domain'
import { calculatePV } from '@/lib/utils'
import { getFacturaEfectivoReal } from '@/lib/pos/pago-mixto'
import {
  DashboardClient,
  type DashboardAlertItem,
  type DashboardRecentInvoice,
  type DashboardSeriePoint,
  type DashboardTopProduct,
} from './dashboard-client'

function getBogotaDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export default async function DashboardPage() {
  const supabase = await createClient()

  const ahora = new Date()
  const hoyBogota = getBogotaDateString(ahora)

  const ayerDate = new Date(ahora.getTime() - 24 * 60 * 60 * 1000)
  const ayerBogota = getBogotaDateString(ayerDate)

  const limite90Date = new Date(ahora.getTime() + 90 * 24 * 60 * 60 * 1000)
  const limite90Bogota = getBogotaDateString(limite90Date)

  const hace14Dias = new Date(ahora.getTime() - 13 * 24 * 60 * 60 * 1000)
  hace14Dias.setUTCHours(0, 0, 0, 0)
  const hace14DiasIso = hace14Dias.toISOString()

  const hace30Dias = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000)
  const hace30DiasIso = hace30Dias.toISOString()

  const [
    session,
    cajaSesion,
    inventarioRes,
    facturas14dRes,
    carteraRes,
    gastos14dRes,
    compras14dRes,
    detallesTopRes,
    usuariosActivosRes,
  ] = await Promise.all([
    getCurrentUserWithProfile(),
    getSesionCajaAbierta(),
    supabase
      .from('vista_inventario_completo')
      .select(
        'inventario_id, producto_id, codigo, nombre_producto, cajas, blisters, unidades, blisters_por_caja, unidades_por_blister, stock_minimo, precio_caja, margen_caja, lote, fecha_vencimiento'
      ),
    supabase
      .from('facturas')
      .select(
        'id, numero, cliente_nombre, total, metodo_pago, tipo_venta, estado_pago, monto_abonado, pago_efectivo, pago_tarjeta, pago_transferencia, created_at'
      )
      .neq('estado_pago', 'anulada')
      .gte('created_at', hace14DiasIso)
      .order('created_at', { ascending: false }),
    supabase
      .from('facturas')
      .select('total, monto_abonado')
      .eq('estado_pago', 'pendiente'),
    supabase.from('gastos').select('monto, created_at').gte('created_at', hace14DiasIso),
    supabase
      .from('compras')
      .select('total, estado_pago, created_at')
      .gte('created_at', hace14DiasIso),
    supabase
      .from('factura_detalles')
      .select(
        'producto_id, cantidad_cajas, cantidad_blisters, cantidad_unidades, precio_unitario, factura:facturas!inner ( estado_pago, created_at ), producto:productos ( nombre )'
      )
      .neq('factura.estado_pago', 'anulada')
      .gte('factura.created_at', hace30DiasIso)
      .limit(300),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'activo'),
  ])

  const profile = session?.profile
  const drogueria = profile?.drogueria
  const prefijo = drogueria?.prefijo_factura?.trim() || ''
  const planKey = (drogueria?.plan as TenantPlan) || 'basico'
  const planLabel = PLAN_CONFIG[planKey]?.label || drogueria?.plan || 'Básico'

  const fechaHoyTexto = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(ahora)

  // 1. Procesamiento en memoria del inventario (1 sola consulta a BD)
  const invRows = inventarioRes.data || []
  let totalUnidadesDisponibles = 0
  let valorInventarioCosto = 0
  let valorInventarioVenta = 0
  const vencidos: DashboardAlertItem[] = []
  const porVencer: DashboardAlertItem[] = []
  const stockBajo: DashboardAlertItem[] = []
  const ratiosByProd = new Map<string, { bpc: number; upb: number }>()

  for (const item of invRows) {
    const c = Math.max(0, Number(item.cajas || 0))
    const b = Math.max(0, Number(item.blisters || 0))
    const u = Math.max(0, Number(item.unidades || 0))
    const bpc = Math.max(1, Number(item.blisters_por_caja || 1))
    const upb = Math.max(1, Number(item.unidades_por_blister || 1))
    const upc = bpc * upb
    const totalUnitsItem = c * upc + b * upb + u

    if (item.producto_id) {
      ratiosByProd.set(item.producto_id, { bpc, upb })
    }

    const fv = item.fecha_vencimiento || null
    const isExpired = Boolean(fv && fv < hoyBogota)

    if (!isExpired) {
      totalUnidadesDisponibles += totalUnitsItem
      const costoCaja = Number(item.precio_caja || 0)
      const margenCaja = Number(item.margen_caja || 0)
      const pvCaja = calculatePV(costoCaja, margenCaja)
      const equivCajas = c + b / bpc + u / upc
      valorInventarioCosto += equivCajas * costoCaja
      valorInventarioVenta += equivCajas * pvCaja
    }

    const baseId = item.inventario_id || item.producto_id || item.codigo || 'item'
    const minStock = Number(item.stock_minimo ?? 2)

    if (isExpired && totalUnitsItem > 0) {
      vencidos.push({
        id: baseId,
        nombre: item.nombre_producto || 'Producto',
        codigo: item.codigo || '',
        lote: item.lote ?? null,
        fechaVencimiento: fv,
        cajas: c,
        stockMinimo: minStock,
        tipo: 'vencido',
      })
    } else if (fv && fv >= hoyBogota && fv <= limite90Bogota && totalUnitsItem > 0) {
      porVencer.push({
        id: baseId,
        nombre: item.nombre_producto || 'Producto',
        codigo: item.codigo || '',
        lote: item.lote ?? null,
        fechaVencimiento: fv,
        cajas: c,
        stockMinimo: minStock,
        tipo: 'por_vencer',
      })
    }

    if (c <= minStock) {
      stockBajo.push({
        id: baseId,
        nombre: item.nombre_producto || 'Producto',
        codigo: item.codigo || '',
        lote: item.lote ?? null,
        fechaVencimiento: fv,
        cajas: c,
        stockMinimo: minStock,
        tipo: 'stock_bajo',
      })
    }
  }

  porVencer.sort((a, b) => (a.fechaVencimiento || '').localeCompare(b.fechaVencimiento || ''))
  stockBajo.sort((a, b) => a.cajas - b.cajas)

  // 2. Serie de 14 días + Ventas de Hoy / Ayer + Mix de Pagos
  const serieMap = new Map<string, DashboardSeriePoint>()
  for (let i = 13; i >= 0; i--) {
    const d = new Date(ahora.getTime() - i * 24 * 60 * 60 * 1000)
    const key = getBogotaDateString(d)
    if (!serieMap.has(key)) {
      serieMap.set(key, { fecha: key, ingresos: 0, gastos: 0 })
    }
  }

  let ventasHoy = 0
  let ventasAyer = 0
  let facturasHoyCount = 0
  let efectivoHoy = 0
  let digitalHoy = 0

  let pagoEfectivoPeriodo = 0
  let pagoTransferenciaPeriodo = 0
  let pagoTarjetaPeriodo = 0
  let pagoCreditoPeriodo = 0

  const facturasRows = facturas14dRes.data || []

  for (const fac of facturasRows) {
    const total = Number(fac.total || 0)
    const fechaDia = fac.created_at ? getBogotaDateString(new Date(fac.created_at)) : ''
    const point = serieMap.get(fechaDia)
    if (point) {
      point.ingresos += total
    }

    const efReal = getFacturaEfectivoReal(fac)
    const trfReal =
      fac.metodo_pago === 'mixto'
        ? Number(fac.pago_transferencia || 0)
        : fac.metodo_pago === 'transferencia' && fac.tipo_venta !== 'credito'
          ? total
          : 0
    const tarReal =
      fac.metodo_pago === 'mixto'
        ? Number(fac.pago_tarjeta || 0)
        : fac.metodo_pago === 'tarjeta' && fac.tipo_venta !== 'credito'
          ? total
          : 0
    const credReal =
      fac.tipo_venta === 'credito' ? Math.max(0, total - Number(fac.monto_abonado || 0)) : 0

    pagoEfectivoPeriodo += efReal
    pagoTransferenciaPeriodo += trfReal
    pagoTarjetaPeriodo += tarReal
    pagoCreditoPeriodo += credReal

    if (fechaDia === hoyBogota) {
      ventasHoy += total
      facturasHoyCount += 1
      efectivoHoy += efReal
      digitalHoy += trfReal + tarReal
    } else if (fechaDia === ayerBogota) {
      ventasAyer += total
    }
  }

  for (const g of gastos14dRes.data || []) {
    const fechaDia = g.created_at ? getBogotaDateString(new Date(g.created_at)) : ''
    const point = serieMap.get(fechaDia)
    if (point) {
      point.gastos += Number(g.monto || 0)
    }
  }

  for (const comp of compras14dRes.data || []) {
    const fechaDia = comp.created_at ? getBogotaDateString(new Date(comp.created_at)) : ''
    const point = serieMap.get(fechaDia)
    if (point) {
      point.gastos += Number(comp.total || 0)
    }
  }

  const serie14Dias = Array.from(serieMap.values()).sort((a, b) =>
    a.fecha.localeCompare(b.fecha)
  )

  // 3. Cartera pendiente activa
  const carteraRows = carteraRes.data || []
  const carteraPendienteCount = carteraRows.length
  const carteraPendienteTotal = carteraRows.reduce(
    (sum, f) => sum + Math.max(0, Number(f.total || 0) - Number(f.monto_abonado || 0)),
    0
  )

  // 4. Top medicamentos últimos 30 días
  const topMap = new Map<string, DashboardTopProduct>()
  for (const det of detallesTopRes.data || []) {
    if (!det.producto_id) continue
    const prodObj = Array.isArray(det.producto) ? det.producto[0] : det.producto
    const nombre = prodObj?.nombre || 'Medicamento'
    const ratios = ratiosByProd.get(det.producto_id) || { bpc: 1, upb: 1 }
    const upc = ratios.bpc * ratios.upb

    const c = Number(det.cantidad_cajas || 0)
    const b = Number(det.cantidad_blisters || 0)
    const u = Number(det.cantidad_unidades || 0)
    const unidadesDespachadas = c * upc + b * ratios.upb + u
    const cajasEquiv = c + b / ratios.bpc + u / upc
    const subtotal = Number(det.precio_unitario || 0)

    const current = topMap.get(det.producto_id) || {
      id: det.producto_id,
      nombre,
      unidadesEquiv: 0,
      cajasEquiv: 0,
      ingresosEstimados: 0,
    }
    current.unidadesEquiv += unidadesDespachadas
    current.cajasEquiv = Number((current.cajasEquiv + cajasEquiv).toFixed(1))
    current.ingresosEstimados += subtotal
    topMap.set(det.producto_id, current)
  }

  const topProductos = Array.from(topMap.values())
    .sort((a, b) => b.ingresosEstimados - a.ingresosEstimados || b.unidadesEquiv - a.unidadesEquiv)
    .slice(0, 5)

  // 5. Últimas 5 facturas
  const facturasRecientes: DashboardRecentInvoice[] = facturasRows.slice(0, 5).map((f) => {
    const padded = String(f.numero || 0).padStart(5, '0')
    return {
      id: f.id,
      numeroFormateado: prefijo ? `${prefijo}-${padded}` : padded,
      clienteNombre: f.cliente_nombre || 'Consumidor Final',
      metodoPago: f.metodo_pago || 'efectivo',
      tipoVenta: f.tipo_venta || 'contado',
      estadoPago: f.estado_pago || 'pagado',
      total: Number(f.total || 0),
      createdAt: f.created_at || ahora.toISOString(),
    }
  })

  return (
    <DashboardClient
      userName={profile?.full_name || session?.user?.email || 'Administrador'}
      role={profile?.role || 'vendedor'}
      drogueriaNombre={drogueria?.nombre || 'TechPharmacy'}
      planLabel={planLabel}
      fechaHoyTexto={fechaHoyTexto}
      cajaAbierta={{
        abierta: Boolean(cajaSesion),
        montoApertura: Number(cajaSesion?.monto_apertura || 0),
        fechaApertura: cajaSesion?.fecha_apertura ?? null,
      }}
      realData={{
        ventasHoy,
        ventasAyer,
        facturasHoyCount,
        ticketPromedioHoy: facturasHoyCount > 0 ? Math.round(ventasHoy / facturasHoyCount) : 0,
        efectivoHoy,
        digitalHoy,
        carteraPendienteTotal,
        carteraPendienteCount,
        totalProductos: invRows.length,
        totalUnidadesDisponibles,
        valorInventarioCosto: Math.round(valorInventarioCosto),
        valorInventarioVenta: Math.round(valorInventarioVenta),
        usuariosActivos: usuariosActivosRes.count ?? 1,
        maxUsuarios: drogueria?.max_usuarios ?? 5,
        pagoEfectivoPeriodo: Math.round(pagoEfectivoPeriodo),
        pagoTransferenciaPeriodo: Math.round(pagoTransferenciaPeriodo),
        pagoTarjetaPeriodo: Math.round(pagoTarjetaPeriodo),
        pagoCreditoPeriodo: Math.round(pagoCreditoPeriodo),
        serie14Dias,
        alertas: {
          vencidos: vencidos.slice(0, 10),
          porVencer: porVencer.slice(0, 10),
          stockBajo: stockBajo.slice(0, 10),
        },
        topProductos,
        facturasRecientes,
      }}
    />
  )
}
