import { createClient } from '@/lib/supabase/server'
import { getCurrentUserWithProfile } from '@/lib/auth/session'
import { getSesionCajaAbierta } from '@/app/actions/caja'
import { PLAN_CONFIG, type TenantPlan } from '@/lib/tenant/domain'
import {
  DashboardClient,
  type DashboardAlertItem,
  type DashboardRecentInvoice,
  type DashboardSeriePoint,
  type DashboardTopProduct,
} from './dashboard-client'

// Forma de public.dashboard_resumen() (ver 20261127000002_free_tier_architecture.sql).
type ResumenDashboard = {
  inventario?: {
    totalProductos?: number
    totalUnidadesDisponibles?: number
    valorInventarioCosto?: number
    valorInventarioVenta?: number
    vencidos?: DashboardAlertItem[]
    porVencer?: DashboardAlertItem[]
    stockBajo?: DashboardAlertItem[]
    conteoVencidos?: number
    conteoPorVencer?: number
    conteoStockBajo?: number
    productosConVencidos?: number
  }
  ventas?: {
    ventasHoy?: number
    ventasAyer?: number
    facturasHoyCount?: number
    efectivoHoy?: number
    digitalHoy?: number
    pagoEfectivoPeriodo?: number
    pagoTransferenciaPeriodo?: number
    pagoTarjetaPeriodo?: number
    pagoCreditoPeriodo?: number
    recientes?: Array<{
      id: string
      numero: number | null
      clienteNombre: string | null
      metodoPago: string | null
      tipoVenta: string | null
      estadoPago: string | null
      total: number | null
      createdAt: string | null
    }>
  }
  serie14Dias?: DashboardSeriePoint[]
  cartera?: { total?: number; count?: number }
  topProductos?: Array<{
    id: string
    nombre: string | null
    unidadesEquiv: number | null
    cajasEquiv: number | null
    ingresos: number | null
  }>
  usuariosActivos?: number
}

const num = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const alertas = (rows: DashboardAlertItem[] | undefined): DashboardAlertItem[] =>
  (rows || []).map((a) => ({
    ...a,
    codigo: a.codigo || '',
    lote: a.lote ?? null,
    fechaVencimiento: a.fechaVencimiento ?? null,
    cajas: num(a.cajas),
    stockMinimo: num(a.stockMinimo),
  }))

export default async function DashboardPage() {
  const supabase = await createClient()
  const ahora = new Date()

  // Todo el resumen se calcula en la base (unos KB): antes se descargaban el
  // inventario completo, todos los lotes y 14 días de ventas en cada visita.
  const [session, cajaSesion, resumenRes] = await Promise.all([
    getCurrentUserWithProfile(),
    getSesionCajaAbierta(),
    supabase.rpc('dashboard_resumen'),
  ])

  if (resumenRes.error) console.error('Error consultando el resumen del dashboard:', resumenRes.error)
  const r = (resumenRes.data && typeof resumenRes.data === 'object' ? resumenRes.data : {}) as ResumenDashboard
  const inv = r.inventario || {}
  const ventas = r.ventas || {}

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

  const ventasHoy = num(ventas.ventasHoy)
  const facturasHoyCount = num(ventas.facturasHoyCount)

  const serie14Dias: DashboardSeriePoint[] = (r.serie14Dias || []).map((p) => ({
    fecha: String(p.fecha),
    ingresos: num(p.ingresos),
    gastos: num(p.gastos),
  }))

  const topProductos: DashboardTopProduct[] = (r.topProductos || []).map((row) => ({
    id: row.id,
    nombre: row.nombre || 'Medicamento',
    unidadesEquiv: num(row.unidadesEquiv),
    cajasEquiv: Math.round(num(row.cajasEquiv) * 10) / 10,
    ingresosEstimados: num(row.ingresos),
  }))

  const facturasRecientes: DashboardRecentInvoice[] = (ventas.recientes || []).map((f) => {
    const padded = String(f.numero || 0).padStart(5, '0')
    return {
      id: f.id,
      numeroFormateado: prefijo ? `${prefijo}-${padded}` : padded,
      clienteNombre: f.clienteNombre || 'Consumidor Final',
      metodoPago: f.metodoPago || 'efectivo',
      tipoVenta: f.tipoVenta || 'contado',
      estadoPago: f.estadoPago || 'pagado',
      total: num(f.total),
      createdAt: f.createdAt || ahora.toISOString(),
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
        ventasAyer: num(ventas.ventasAyer),
        facturasHoyCount,
        ticketPromedioHoy: facturasHoyCount > 0 ? Math.round(ventasHoy / facturasHoyCount) : 0,
        efectivoHoy: num(ventas.efectivoHoy),
        digitalHoy: num(ventas.digitalHoy),
        carteraPendienteTotal: num(r.cartera?.total),
        carteraPendienteCount: num(r.cartera?.count),
        totalProductos: num(inv.totalProductos),
        totalUnidadesDisponibles: num(inv.totalUnidadesDisponibles),
        valorInventarioCosto: Math.round(num(inv.valorInventarioCosto)),
        valorInventarioVenta: Math.round(num(inv.valorInventarioVenta)),
        usuariosActivos: resumenRes.error ? 1 : num(r.usuariosActivos),
        maxUsuarios: drogueria?.max_usuarios ?? 5,
        pagoEfectivoPeriodo: Math.round(num(ventas.pagoEfectivoPeriodo)),
        pagoTransferenciaPeriodo: Math.round(num(ventas.pagoTransferenciaPeriodo)),
        pagoTarjetaPeriodo: Math.round(num(ventas.pagoTarjetaPeriodo)),
        pagoCreditoPeriodo: Math.round(num(ventas.pagoCreditoPeriodo)),
        serie14Dias,
        alertas: {
          vencidos: alertas(inv.vencidos),
          porVencer: alertas(inv.porVencer),
          stockBajo: alertas(inv.stockBajo),
        },
        conteoAlertas: {
          vencidos: num(inv.conteoVencidos),
          porVencer: num(inv.conteoPorVencer),
          stockBajo: num(inv.conteoStockBajo),
          productosConVencidos: num(inv.productosConVencidos),
        },
        topProductos,
        facturasRecientes,
      }}
    />
  )
}
