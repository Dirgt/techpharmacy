'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Award,
  Banknote,
  BarChart3,
  Boxes,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  Eye,
  LineChart,
  Package,
  Printer,
  ReceiptText,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IngresosGastosChart } from '@/components/reportes/ingresos-gastos-chart'
import { formatCurrency } from '@/lib/utils'

export interface DashboardSeriePoint {
  fecha: string
  ingresos: number
  gastos: number
}

export interface DashboardAlertItem {
  id: string
  nombre: string
  codigo: string
  lote: string | null
  fechaVencimiento: string | null
  cajas: number
  stockMinimo: number
  tipo: 'vencido' | 'por_vencer' | 'stock_bajo'
}

export interface DashboardTopProduct {
  id: string
  nombre: string
  unidadesEquiv: number
  cajasEquiv: number
  ingresosEstimados: number
}

export interface DashboardRecentInvoice {
  id: string
  numeroFormateado: string
  clienteNombre: string
  metodoPago: string
  tipoVenta: string
  estadoPago: string
  total: number
  createdAt: string
}

export interface DashboardSnapshot {
  ventasHoy: number
  ventasAyer: number
  facturasHoyCount: number
  ticketPromedioHoy: number
  efectivoHoy: number
  digitalHoy: number
  carteraPendienteTotal: number
  carteraPendienteCount: number
  totalProductos: number
  totalUnidadesDisponibles: number
  valorInventarioCosto: number
  valorInventarioVenta: number
  usuariosActivos: number
  maxUsuarios: number
  pagoEfectivoPeriodo: number
  pagoTransferenciaPeriodo: number
  pagoTarjetaPeriodo: number
  pagoCreditoPeriodo: number
  serie14Dias: DashboardSeriePoint[]
  alertas: {
    vencidos: DashboardAlertItem[]
    porVencer: DashboardAlertItem[]
    stockBajo: DashboardAlertItem[]
  }
  conteoAlertas?: {
    vencidos: number
    porVencer: number
    stockBajo: number
    productosConVencidos: number
  }
  topProductos: DashboardTopProduct[]
  facturasRecientes: DashboardRecentInvoice[]
}

export interface DashboardClientProps {
  userName: string
  role: string
  drogueriaNombre: string
  planLabel: string
  fechaHoyTexto: string
  cajaAbierta: {
    abierta: boolean
    montoApertura: number
    fechaApertura: string | null
  }
  realData: DashboardSnapshot
}

function buildDemoSnapshot(baseDateIso: string): DashboardSnapshot {
  const base = baseDateIso ? new Date(`${baseDateIso}T12:00:00`) : new Date()
  const dailyPattern = [
    { ing: 980000, gas: 320000 },
    { ing: 1120000, gas: 180000 },
    { ing: 1340000, gas: 650000 },
    { ing: 1050000, gas: 140000 },
    { ing: 1490000, gas: 420000 },
    { ing: 1760000, gas: 290000 },
    { ing: 1210000, gas: 150000 },
    { ing: 1390000, gas: 510000 },
    { ing: 1580000, gas: 230000 },
    { ing: 1290000, gas: 190000 },
    { ing: 1640000, gas: 740000 },
    { ing: 1920000, gas: 310000 },
    { ing: 1540000, gas: 210000 },
    { ing: 1865000, gas: 340000 },
  ]

  const serie14Dias: DashboardSeriePoint[] = dailyPattern.map((pt, idx) => {
    const d = new Date(base)
    d.setDate(base.getDate() - (13 - idx))
    return {
      fecha: d.toISOString().slice(0, 10),
      ingresos: pt.ing,
      gastos: pt.gas,
    }
  })

  return {
    ventasHoy: 1865000,
    ventasAyer: 1540000,
    facturasHoyCount: 68,
    ticketPromedioHoy: 27426,
    efectivoHoy: 1095000,
    digitalHoy: 770000,
    carteraPendienteTotal: 385000,
    carteraPendienteCount: 4,
    totalProductos: 412,
    totalUnidadesDisponibles: 14820,
    valorInventarioCosto: 24600000,
    valorInventarioVenta: 34950000,
    usuariosActivos: 3,
    maxUsuarios: 5,
    pagoEfectivoPeriodo: 6420000,
    pagoTransferenciaPeriodo: 3580000,
    pagoTarjetaPeriodo: 1120000,
    pagoCreditoPeriodo: 385000,
    serie14Dias,
    alertas: {
      vencidos: [
        {
          id: 'demo-v1',
          nombre: 'LORATADINA 10MG TABLETAS MK',
          codigo: '77020570112',
          lote: 'LT-2401A',
          fechaVencimiento: '2026-11-10',
          cajas: 2,
          stockMinimo: 3,
          tipo: 'vencido',
        },
      ],
      porVencer: [
        {
          id: 'demo-pv1',
          nombre: 'AMOXICILINA 500MG CÁPSULAS GENFAR',
          codigo: '77026051044',
          lote: 'AMX-882',
          fechaVencimiento: '2026-12-18',
          cajas: 6,
          stockMinimo: 4,
          tipo: 'por_vencer',
        },
        {
          id: 'demo-pv2',
          nombre: 'IBUPROFENO 800MG BLÍSTER X 10',
          codigo: '77031520091',
          lote: 'IBU-991',
          fechaVencimiento: '2027-01-14',
          cajas: 4,
          stockMinimo: 5,
          tipo: 'por_vencer',
        },
      ],
      stockBajo: [
        {
          id: 'demo-sb1',
          nombre: 'ACETAMINOFÉN 500MG CAJA X 100',
          codigo: '77020570001',
          lote: 'ACT-2027B',
          fechaVencimiento: '2028-05-30',
          cajas: 2,
          stockMinimo: 8,
          tipo: 'stock_bajo',
        },
        {
          id: 'demo-sb2',
          nombre: 'LOSARTÁN POTÁSICO 50MG LA SANTÉ',
          codigo: '77037630025',
          lote: 'LOS-512',
          fechaVencimiento: '2028-02-20',
          cajas: 1,
          stockMinimo: 6,
          tipo: 'stock_bajo',
        },
      ],
    },
    topProductos: [
      {
        id: 'tp-1',
        nombre: 'ACETAMINOFÉN 500MG MK',
        unidadesEquiv: 420,
        cajasEquiv: 14.0,
        ingresosEstimados: 588000,
      },
      {
        id: 'tp-2',
        nombre: 'LOSARTÁN 50MG CAJA X 30',
        unidadesEquiv: 270,
        cajasEquiv: 9.0,
        ingresosEstimados: 486000,
      },
      {
        id: 'tp-3',
        nombre: 'DOLEX GRIPA BLÍSTER X 12',
        unidadesEquiv: 216,
        cajasEquiv: 18.0,
        ingresosEstimados: 432000,
      },
      {
        id: 'tp-4',
        nombre: 'AMOXICILINA 500MG GENFAR',
        unidadesEquiv: 190,
        cajasEquiv: 3.8,
        ingresosEstimados: 361000,
      },
      {
        id: 'tp-5',
        nombre: 'ELECTROLIT MORA 625ML',
        unidadesEquiv: 44,
        cajasEquiv: 44.0,
        ingresosEstimados: 352000,
      },
    ],
    facturasRecientes: [
      {
        id: 'demo-f1',
        numeroFormateado: 'POS-00418',
        clienteNombre: 'María Fernanda Ruiz',
        metodoPago: 'mixto',
        tipoVenta: 'contado',
        estadoPago: 'pagado',
        total: 38500,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'demo-f2',
        numeroFormateado: 'POS-00417',
        clienteNombre: 'Consumidor Final',
        metodoPago: 'efectivo',
        tipoVenta: 'contado',
        estadoPago: 'pagado',
        total: 14200,
        createdAt: new Date(Date.now() - 12 * 60_000).toISOString(),
      },
      {
        id: 'demo-f3',
        numeroFormateado: 'POS-00416',
        clienteNombre: 'Carlos Andrés Mejía',
        metodoPago: 'transferencia',
        tipoVenta: 'contado',
        estadoPago: 'pagado',
        total: 62000,
        createdAt: new Date(Date.now() - 28 * 60_000).toISOString(),
      },
      {
        id: 'demo-f4',
        numeroFormateado: 'POS-00415',
        clienteNombre: 'Consumidor Final',
        metodoPago: 'efectivo',
        tipoVenta: 'contado',
        estadoPago: 'pagado',
        total: 9800,
        createdAt: new Date(Date.now() - 45 * 60_000).toISOString(),
      },
      {
        id: 'demo-f5',
        numeroFormateado: 'POS-00414',
        clienteNombre: 'Droguería / Vecino Crédito',
        metodoPago: 'efectivo',
        tipoVenta: 'credito',
        estadoPago: 'pendiente',
        total: 54000,
        createdAt: new Date(Date.now() - 75 * 60_000).toISOString(),
      },
    ],
  }
}

function getMetodoBadge(metodo: string, tipoVenta: string) {
  if (tipoVenta === 'credito') {
    return {
      label: 'Crédito',
      cls: 'bg-amber-50 text-amber-700 border-amber-200',
    }
  }
  switch (metodo) {
    case 'mixto':
      return {
        label: 'Efectivo + Digital',
        cls: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      }
    case 'transferencia':
      return {
        label: 'Nequi / Transf.',
        cls: 'bg-violet-50 text-violet-700 border-violet-200',
      }
    case 'tarjeta':
      return {
        label: 'Tarjeta',
        cls: 'bg-sky-50 text-sky-700 border-sky-200',
      }
    default:
      return {
        label: 'Efectivo',
        cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      }
  }
}

export function DashboardClient({
  userName,
  role,
  drogueriaNombre,
  planLabel,
  fechaHoyTexto,
  cajaAbierta,
  realData,
}: DashboardClientProps) {
  const isSuperAdmin = role === 'superadmin'
  const isAdminOrSuper = role === 'admin' || isSuperAdmin
  const [demoMode, setDemoMode] = useState(false)
  const isDemoActive = isSuperAdmin && demoMode
  const [rangeDays, setRangeDays] = useState<7 | 14>(7)
  const [chartMode, setChartMode] = useState<'area' | 'bar'>('area')
  const [alertTab, setAlertTab] = useState<'todos' | 'vencido' | 'por_vencer' | 'stock_bajo'>(
    'todos'
  )

  const demoData = useMemo(
    () =>
      buildDemoSnapshot(
        realData.serie14Dias[realData.serie14Dias.length - 1]?.fecha ||
          new Date().toISOString().slice(0, 10)
      ),
    [realData.serie14Dias]
  )

  const active = isDemoActive ? demoData : realData
  const effectiveCaja = isDemoActive
    ? { abierta: true, montoApertura: 150000, fechaApertura: new Date().toISOString() }
    : cajaAbierta

  const chartSeries = useMemo(() => {
    if (rangeDays === 7) {
      return active.serie14Dias.slice(-7)
    }
    return active.serie14Dias
  }, [active.serie14Dias, rangeDays])

  const ingresosPeriodo = useMemo(
    () => chartSeries.reduce((sum, item) => sum + Number(item.ingresos || 0), 0),
    [chartSeries]
  )
  const gastosPeriodo = useMemo(
    () => chartSeries.reduce((sum, item) => sum + Number(item.gastos || 0), 0),
    [chartSeries]
  )
  const flujoNetoPeriodo = ingresosPeriodo - gastosPeriodo

  const deltaAyerPct = useMemo(() => {
    if (active.ventasAyer <= 0) {
      return active.ventasHoy > 0 ? 100 : 0
    }
    return Math.round(((active.ventasHoy - active.ventasAyer) / active.ventasAyer) * 100)
  }, [active.ventasAyer, active.ventasHoy])

  const totalPagosMix =
    active.pagoEfectivoPeriodo +
    active.pagoTransferenciaPeriodo +
    active.pagoTarjetaPeriodo +
    active.pagoCreditoPeriodo

  const paymentRows = [
    {
      key: 'efectivo',
      label: 'Efectivo en Cajón',
      sub: 'Billetes y monedas cuadrables',
      amount: active.pagoEfectivoPeriodo,
      pct:
        totalPagosMix > 0 ? Math.round((active.pagoEfectivoPeriodo / totalPagosMix) * 100) : 0,
      icon: Banknote,
      barCls: 'bg-emerald-500',
      iconCls: 'bg-emerald-50 text-emerald-600 border-emerald-200/70',
    },
    {
      key: 'transferencia',
      label: 'Nequi / Daviplata / QR',
      sub: 'Transferencias directas',
      amount: active.pagoTransferenciaPeriodo,
      pct:
        totalPagosMix > 0
          ? Math.round((active.pagoTransferenciaPeriodo / totalPagosMix) * 100)
          : 0,
      icon: Smartphone,
      barCls: 'bg-violet-500',
      iconCls: 'bg-violet-50 text-violet-600 border-violet-200/70',
    },
    {
      key: 'tarjeta',
      label: 'Tarjeta / Datáfono',
      sub: 'Débito y crédito bancario',
      amount: active.pagoTarjetaPeriodo,
      pct:
        totalPagosMix > 0 ? Math.round((active.pagoTarjetaPeriodo / totalPagosMix) * 100) : 0,
      icon: CreditCard,
      barCls: 'bg-sky-500',
      iconCls: 'bg-sky-50 text-sky-600 border-sky-200/70',
    },
    {
      key: 'credito',
      label: 'Crédito / Cartera',
      sub: `${active.carteraPendienteCount} cuenta(s) por cobrar`,
      amount: active.pagoCreditoPeriodo,
      pct:
        totalPagosMix > 0 ? Math.round((active.pagoCreditoPeriodo / totalPagosMix) * 100) : 0,
      icon: Clock,
      barCls: 'bg-amber-500',
      iconCls: 'bg-amber-50 text-amber-600 border-amber-200/70',
    },
  ]

  const allAlerts = useMemo(() => {
    const merged = [
      ...active.alertas.vencidos,
      ...active.alertas.porVencer,
      ...active.alertas.stockBajo,
    ]
    if (alertTab === 'todos') return merged
    return merged.filter((a) => a.tipo === alertTab)
  }, [active.alertas, alertTab])

  // Conteos reales (las listas solo traen los primeros elementos para pintar).
  const conteoVencidos = active.conteoAlertas?.vencidos ?? active.alertas.vencidos.length
  const conteoPorVencer = active.conteoAlertas?.porVencer ?? active.alertas.porVencer.length
  const conteoStockBajo = active.conteoAlertas?.stockBajo ?? active.alertas.stockBajo.length
  const productosConVencidos =
    active.conteoAlertas?.productosConVencidos ?? active.alertas.vencidos.length

  const totalSanitaryIssues = conteoVencidos + conteoPorVencer
  const healthPct =
    active.totalProductos > 0
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(
              ((active.totalProductos - productosConVencidos) / active.totalProductos) * 100
            )
          )
        )
      : 100

  const topMaxIngresos = Math.max(
    1,
    ...active.topProductos.map((p) => p.ingresosEstimados || p.unidadesEquiv || 1)
  )

  const efectivoHoyPct =
    active.ventasHoy > 0
      ? Math.min(100, Math.round((active.efectivoHoy / active.ventasHoy) * 100))
      : 50

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Banner aviso si está en Modo Demo Comercial (exclusivo SuperAdmin) */}
      {isDemoActive && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-300/80 bg-gradient-to-r from-amber-50 via-yellow-50 to-emerald-50 px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold text-amber-950">
            <Sparkles className="h-4 w-4 shrink-0 text-amber-600" />
            <span>
              <strong>Vista Demo Comercial activa (Solo SuperAdmin):</strong> Estás visualizando
              cifras simuladas para presentaciones y videos. Tus clientes nunca ven este botón.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDemoMode(false)}
            className="rounded-xl border-amber-400 bg-white text-xs font-black text-amber-900 hover:bg-amber-100 shrink-0"
          >
            Volver a Datos Reales
          </Button>
        </div>
      )}

      {/* 1. HERO COMMAND CENTER */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-emerald-950 to-teal-950 p-6 sm:p-7 text-white shadow-xl shadow-slate-900/10 border border-emerald-500/20">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-teal-400/15 blur-3xl" />

        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-5">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 px-3 py-1 text-[11px] font-bold text-emerald-200">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                {drogueriaNombre} • Plan {planLabel}
              </span>
              <span className="text-xs font-semibold text-emerald-200/80 capitalize">
                {fechaHoyTexto}
              </span>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                Hola, {userName.split(' ')[0]} 👋
              </h1>
              <p className="mt-0.5 text-sm text-emerald-100/80">
                Así va tu droguería el día de hoy.
              </p>
            </div>

            {/* Estado de Caja e indicadores rápidos en vivo */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <Link prefetch={false}
                href="/facturas"
                className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-1.5 text-xs font-black transition-colors ${
                  effectiveCaja.abierta
                    ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30'
                    : 'border-amber-400/40 bg-amber-500/20 text-amber-200 hover:bg-amber-500/30'
                }`}
              >
                <Wallet className="h-3.5 w-3.5" />
                {effectiveCaja.abierta
                  ? `Turno Abierto • Base ${formatCurrency(effectiveCaja.montoApertura)}`
                  : 'Caja Cerrada • Clic para abrir turno'}
              </Link>

              <div className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200">
                <Users className="h-3.5 w-3.5 text-teal-300" />
                <span>
                  Equipo activo: <strong>{active.usuariosActivos}</strong>/{active.maxUsuarios}
                </span>
              </div>
            </div>
          </div>

          {/* Botonera ejecutiva de acción rápida */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => setDemoMode((prev) => !prev)}
                title="Exclusivo SuperAdmin: alternar cifras de demostración comercial"
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-xs font-black transition-all cursor-pointer ${
                  isDemoActive
                    ? 'border-amber-300 bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/25'
                    : 'border-white/20 bg-white/10 text-white hover:bg-white/20'
                }`}
              >
                <Eye className="h-4 w-4" />
                {isDemoActive ? 'Demo Activa' : 'Vista Demo'}
              </button>
            )}

            <Link prefetch={false}
              href="/inventario"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs sm:text-sm font-bold text-white backdrop-blur-sm transition-all hover:bg-white/20"
            >
              <Boxes className="h-4 w-4 text-teal-300" />
              Inventario & Lotes
            </Link>

            {isAdminOrSuper && (
              <Link prefetch={false}
                href="/compras"
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs sm:text-sm font-bold text-white backdrop-blur-sm transition-all hover:bg-white/20"
              >
                <ShoppingCart className="h-4 w-4 text-sky-300" />
                Recibir Mercancía
              </Link>
            )}

            <Link prefetch={false}
              href="/facturas"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-400 px-5 py-2.5 text-xs sm:text-sm font-black text-slate-950 shadow-lg shadow-emerald-500/30 transition-all hover:from-emerald-300 hover:to-teal-300 hover:scale-[1.02]"
            >
              <ReceiptText className="h-4 w-4" />
              Ir a Facturación
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* 2. KPI ROW ENTERPRISE (4 TARJETAS DE ALTA DENSIDAD) */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* KPI 1: Facturación Hoy */}
        <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                Facturación de Hoy
              </p>
              <p className="mt-1.5 text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                {formatCurrency(active.ventasHoy)}
              </p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600 border border-emerald-100">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-black ${
                deltaAyerPct >= 0
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-rose-50 text-rose-700'
              }`}
            >
              {deltaAyerPct >= 0 ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5" />
              )}
              {deltaAyerPct >= 0 ? `+${deltaAyerPct}%` : `${deltaAyerPct}%`} vs ayer
            </span>
            <span className="font-semibold text-slate-500">
              {active.facturasHoyCount} venta(s) • Prom. {formatCurrency(active.ticketPromedioHoy)}
            </span>
          </div>

          <div className="mt-3.5 pt-3 border-t border-slate-100 space-y-1.5">
            <div className="flex justify-between text-[11px] font-bold">
              <span className="text-emerald-700">
                Efectivo: {formatCurrency(active.efectivoHoy)}
              </span>
              <span className="text-violet-700">
                Digital: {formatCurrency(active.digitalHoy)}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-violet-100 flex">
              <div
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${efectivoHoyPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* KPI 2: Flujo Comercial & Cartera */}
        <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:border-indigo-300 hover:shadow-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                Ventas ({rangeDays} Días)
              </p>
              <p className="mt-1.5 text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                {formatCurrency(ingresosPeriodo)}
              </p>
            </div>
            <div className="rounded-2xl bg-indigo-50 p-3 text-indigo-600 border border-indigo-100">
              <Activity className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="font-bold text-slate-600">
              Flujo neto:{' '}
              <strong className={flujoNetoPeriodo >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                {formatCurrency(flujoNetoPeriodo)}
              </strong>
            </span>
            <Link prefetch={false}
              href={isAdminOrSuper ? '/reportes' : '/facturas'}
              className="inline-flex items-center gap-1 font-black text-indigo-600 hover:text-indigo-700"
            >
              Detalle <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="font-bold text-slate-500">Cartera por cobrar:</span>
            <span
              className={`font-black px-2 py-0.5 rounded-md ${
                active.carteraPendienteTotal > 0
                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {formatCurrency(active.carteraPendienteTotal)} ({active.carteraPendienteCount})
            </span>
          </div>
        </div>

        {/* KPI 3: Patrimonio y Capacidad en Estantería */}
        <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:border-sky-300 hover:shadow-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                {isAdminOrSuper ? 'Valor Venta Inventario' : 'Catálogo Disponible'}
              </p>
              <p className="mt-1.5 text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                {isAdminOrSuper
                  ? formatCurrency(active.valorInventarioVenta)
                  : `${active.totalProductos} Refs.`}
              </p>
            </div>
            <div className="rounded-2xl bg-sky-50 p-3 text-sky-600 border border-sky-100">
              <Package className="h-5 w-5" />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-600">
              <strong>{active.totalProductos}</strong> productos •{' '}
              <strong>{active.totalUnidadesDisponibles.toLocaleString('es-CO')}</strong> uds
            </span>
          </div>

          <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
            {isAdminOrSuper ? (
              <>
                <span className="font-bold text-slate-500">Costo invertido:</span>
                <span className="font-black text-slate-800">
                  {formatCurrency(active.valorInventarioCosto)}
                </span>
              </>
            ) : (
              <>
                <span className="font-bold text-slate-500">Destape automático:</span>
                <span className="font-black text-emerald-700">Caja → Sobre → Unidad</span>
              </>
            )}
          </div>
        </div>

        {/* KPI 4: Blindaje Sanitario Secretaría de Salud */}
        <div className="group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:border-amber-300 hover:shadow-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                Blindaje Sanitario FEFO
              </p>
              <p className="mt-1.5 text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                {healthPct}%{' '}
                <span className="text-sm font-bold text-slate-500">vigente</span>
              </p>
            </div>
            <div
              className={`rounded-2xl p-3 border ${
                conteoVencidos > 0
                  ? 'bg-rose-50 text-rose-600 border-rose-100'
                  : totalSanitaryIssues > 0
                    ? 'bg-amber-50 text-amber-600 border-amber-100'
                    : 'bg-emerald-50 text-emerald-600 border-emerald-100'
              }`}
            >
              {conteoVencidos > 0 ? (
                <ShieldAlert className="h-5 w-5" />
              ) : (
                <ShieldCheck className="h-5 w-5" />
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] font-black">
            <span
              className={`rounded-md px-2 py-0.5 border ${
                conteoVencidos > 0
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : 'bg-slate-50 text-slate-500 border-slate-200'
              }`}
            >
              {conteoVencidos} Vencidos
            </span>
            <span
              className={`rounded-md px-2 py-0.5 border ${
                conteoPorVencer > 0
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-slate-50 text-slate-500 border-slate-200'
              }`}
            >
              {conteoPorVencer} Próx. 90d
            </span>
            <span
              className={`rounded-md px-2 py-0.5 border ${
                conteoStockBajo > 0
                  ? 'bg-sky-50 text-sky-700 border-sky-200'
                  : 'bg-slate-50 text-slate-500 border-slate-200'
              }`}
            >
              {conteoStockBajo} Stock bajo
            </span>
          </div>

          <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="font-semibold text-slate-500">
              {conteoVencidos > 0
                ? 'Bloqueados automáticamente en POS'
                : 'Cero lotes vencidos en mostrador'}
            </span>
            <Link prefetch={false}
              href="/inventario"
              className="font-black text-emerald-700 hover:underline shrink-0"
            >
              Revisar →
            </Link>
          </div>
        </div>
      </section>

      {/* 3. ANALYTICS ROW: GRÁFICA INTERACTIVA (8 COLS) + MIX DE PAGOS (4 COLS) */}
      <section className="grid gap-6 lg:grid-cols-12">
        {/* Flujo de Ingresos vs Salidas */}
        <div className="lg:col-span-8 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
              <div>
                <h2 className="text-lg font-black tracking-tight text-slate-900">
                  Pulso Comercial: Ventas vs Compras y Gastos
                </h2>
                <p className="text-xs font-medium text-slate-500 mt-0.5">
                   Evolución diaria de facturación frente a salidas operativas de la droguería
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto">
                {/* Selector 7d / 14d */}
                <div className="inline-flex rounded-xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setRangeDays(7)}
                    className={`rounded-lg px-3 py-1 text-xs font-black transition-all cursor-pointer ${
                      rangeDays === 7
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    7 Días
                  </button>
                  <button
                    type="button"
                    onClick={() => setRangeDays(14)}
                    className={`rounded-lg px-3 py-1 text-xs font-black transition-all cursor-pointer ${
                      rangeDays === 14
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    14 Días
                  </button>
                </div>

                {/* Selector Área / Barras */}
                <div className="inline-flex rounded-xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setChartMode('area')}
                    title="Vista de curva"
                    className={`rounded-lg p-1.5 transition-all cursor-pointer ${
                      chartMode === 'area'
                        ? 'bg-white text-emerald-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <LineChart className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartMode('bar')}
                    title="Vista de barras"
                    className={`rounded-lg p-1.5 transition-all cursor-pointer ${
                      chartMode === 'bar'
                        ? 'bg-white text-emerald-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <BarChart3 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Franja resumen rápida dentro de la gráfica */}
            <div className="grid grid-cols-3 gap-3 py-4">
              <div className="rounded-2xl bg-emerald-50/60 border border-emerald-100 px-4 py-2.5">
                <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Ingresos ({rangeDays}d)
                </span>
                <p className="mt-0.5 text-base sm:text-lg font-black text-slate-900 truncate">
                  {formatCurrency(ingresosPeriodo)}
                </p>
              </div>

              <div className="rounded-2xl bg-rose-50/60 border border-rose-100 px-4 py-2.5">
                <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-rose-700">
                  <span className="h-2 w-2 rounded-full bg-rose-500" />
                  Compras y Gastos
                </span>
                <p className="mt-0.5 text-base sm:text-lg font-black text-slate-900 truncate">
                  {formatCurrency(gastosPeriodo)}
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50 border border-slate-200/80 px-4 py-2.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">
                  Balance Operativo
                </span>
                <p
                  className={`mt-0.5 text-base sm:text-lg font-black truncate ${
                    flujoNetoPeriodo >= 0 ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {formatCurrency(flujoNetoPeriodo)}
                </p>
              </div>
            </div>
          </div>

          <div className="pt-1">
            <IngresosGastosChart data={chartSeries} mode={chartMode} height={275} />
          </div>
        </div>

        {/* Mix de Medios de Pago & Caja */}
        <div className="lg:col-span-4 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm flex flex-col justify-between gap-5">
          <div>
            <div className="pb-4 border-b border-slate-100">
              <h2 className="text-lg font-black tracking-tight text-slate-900">
                Arqueo por Medio de Pago
              </h2>
              <p className="text-xs font-medium text-slate-500 mt-0.5">
                Distribución exacta últimos 14 días (incluye pagos mixtos)
              </p>
            </div>

            <div className="mt-4 space-y-4">
              {paymentRows.map((row) => (
                <div key={row.key} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`rounded-xl border p-2 shrink-0 ${row.iconCls}`}>
                        <row.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-800 truncate">{row.label}</p>
                        <p className="text-[11px] text-slate-400 truncate">{row.sub}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-black text-slate-900">
                        {formatCurrency(row.amount)}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400">{row.pct}%</p>
                    </div>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${row.barCls}`}
                      style={{ width: `${Math.max(row.amount > 0 ? 4 : 0, row.pct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/80 to-teal-50/50 p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-800">
                Cierre sin descuadres
              </p>
              <p className="text-xs font-semibold text-emerald-950/80 mt-0.5">
                Los pagos Nequi + Efectivo separan automáticamente cada peso del cajón.
              </p>
            </div>
            <Link prefetch={false}
              href="/facturas"
              className="shrink-0 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white shadow-sm hover:bg-emerald-700 transition-colors"
            >
              Ver Caja
            </Link>
          </div>
        </div>
      </section>

      {/* 4. INTELIGENCIA OPERATIVA (3 COLUMNAS): RADAR FEFO | TOP ROTACIÓN | ÚLTIMAS FACTURAS */}
      <section className="grid gap-6 xl:grid-cols-3">
        {/* COL 1: Radar Sanitario FEFO & Reposición */}
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between gap-2 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <CalendarClock className="h-4 w-4 text-amber-600" />
                Radar FEFO & Reposición
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Lotes vencidos, próximos a vencer y agotados
              </p>
            </div>
            <Link prefetch={false}
              href="/inventario"
              className="text-xs font-black text-emerald-700 hover:underline shrink-0"
            >
              Ir a Lotes →
            </Link>
          </div>

          {/* Pestañas rápidas de filtro */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {[
              {
                id: 'todos' as const,
                label: `Todos (${
                  conteoVencidos +
                  conteoPorVencer +
                  conteoStockBajo
                })`,
              },
              { id: 'vencido' as const, label: `Vencidos (${conteoVencidos})` },
              {
                id: 'por_vencer' as const,
                label: `Por vencer (${conteoPorVencer})`,
              },
              {
                id: 'stock_bajo' as const,
                label: `Stock bajo (${conteoStockBajo})`,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setAlertTab(tab.id)}
                className={`rounded-xl px-2.5 py-1 text-[11px] font-black transition-colors cursor-pointer ${
                  alertTab === tab.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex-1 divide-y divide-slate-100 overflow-y-auto max-h-[320px] pr-1">
            {allAlerts.length > 0 ? (
              allAlerts.slice(0, 8).map((item) => (
                <div
                  key={`${item.tipo}-${item.id}`}
                  className="py-3 first:pt-1 last:pb-1 flex items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={`mt-0.5 rounded-xl p-1.5 shrink-0 ${
                        item.tipo === 'vencido'
                          ? 'bg-rose-100 text-rose-600'
                          : item.tipo === 'por_vencer'
                            ? 'bg-amber-100 text-amber-600'
                            : 'bg-sky-100 text-sky-600'
                      }`}
                    >
                      {item.tipo === 'vencido' ? (
                        <AlertTriangle className="h-4 w-4" />
                      ) : item.tipo === 'por_vencer' ? (
                        <Clock className="h-4 w-4" />
                      ) : (
                        <Package className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-900 truncate">{item.nombre}</p>
                      <p className="text-[11px] font-medium text-slate-500 truncate">
                        {item.tipo === 'vencido'
                          ? `Venció: ${item.fechaVencimiento}${item.lote ? ` • Lote ${item.lote}` : ''}`
                          : item.tipo === 'por_vencer'
                            ? `Vence: ${item.fechaVencimiento}${item.lote ? ` • Lote ${item.lote}` : ''}`
                            : `Quedan ${item.cajas} caja(s) • Mínimo ${item.stockMinimo}`}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-black uppercase border ${
                      item.tipo === 'vencido'
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : item.tipo === 'por_vencer'
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-sky-50 text-sky-700 border-sky-200'
                    }`}
                  >
                    {item.tipo === 'vencido'
                      ? 'Bloqueado'
                      : item.tipo === 'por_vencer'
                        ? 'FEFO'
                        : 'Pedir'}
                  </span>
                </div>
              ))
            ) : (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600 mb-2.5">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <p className="text-sm font-black text-slate-800">Estantería al día</p>
                <p className="text-xs text-slate-400 mt-0.5 max-w-[220px]">
                  No tienes alertas pendientes en esta categoría sanitaria.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* COL 2: Medicamentos Estrella (Top Rotación 30d) */}
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between gap-2 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Award className="h-4 w-4 text-emerald-600" />
                Top Medicamentos (30 Días)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Productos con mayor rotación y facturación
              </p>
            </div>
            {isAdminOrSuper && (
              <Link prefetch={false}
                href="/reportes"
                className="text-xs font-black text-emerald-700 hover:underline shrink-0"
              >
                Ver Ranking →
              </Link>
            )}
          </div>

          <div className="mt-4 flex-1 space-y-3.5">
            {active.topProductos.length > 0 ? (
              active.topProductos.map((prod, idx) => {
                const widthPct = Math.max(
                  10,
                  Math.round(
                    ((prod.ingresosEstimados || prod.unidadesEquiv) / topMaxIngresos) * 100
                  )
                )
                return (
                  <div key={prod.id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] font-black ${
                            idx === 0
                              ? 'bg-amber-100 text-amber-800'
                              : idx === 1
                                ? 'bg-slate-200 text-slate-700'
                                : idx === 2
                                  ? 'bg-orange-100 text-orange-800'
                                  : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          #{idx + 1}
                        </span>
                        <span className="text-xs font-black text-slate-800 truncate">
                          {prod.nombre}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-black text-slate-900 block">
                          {formatCurrency(prod.ingresosEstimados)}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400">
                          {prod.unidadesEquiv} uds despachadas
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <div className="rounded-2xl bg-slate-100 p-3 text-slate-400 mb-2.5">
                  <Award className="h-6 w-6" />
                </div>
                <p className="text-sm font-black text-slate-700">Aún sin historial de rotación</p>
                <p className="text-xs text-slate-400 mt-0.5 max-w-[230px]">
                  Al facturar en el POS verás aquí los medicamentos más vendidos de tu barrio.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* COL 3: Actividad en Vivo del Mostrador */}
        <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between gap-2 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <ReceiptText className="h-4 w-4 text-indigo-600" />
                Últimas Ventas en Mostrador
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Recibos recientes con acceso directo a tirilla
              </p>
            </div>
            <Link prefetch={false}
              href="/facturas"
              className="text-xs font-black text-indigo-600 hover:underline shrink-0"
            >
              Facturar →
            </Link>
          </div>

          <div className="mt-3 flex-1 divide-y divide-slate-100">
            {active.facturasRecientes.length > 0 ? (
              active.facturasRecientes.map((fac) => {
                const badge = getMetodoBadge(fac.metodoPago, fac.tipoVenta)
                return (
                  <div
                    key={fac.id}
                    className="py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-900">
                          #{fac.numeroFormateado}
                        </span>
                        <span
                          className={`rounded-md border px-1.5 py-0.5 text-[10px] font-black ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-[11px] font-medium text-slate-500 truncate mt-0.5">
                        {fac.clienteNombre || 'Consumidor Final'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <div className="text-right">
                        <p className="text-xs font-black text-slate-900">
                          {formatCurrency(fac.total)}
                        </p>
                        <p className="text-[10px] font-semibold text-slate-400">
                          {new Date(fac.createdAt).toLocaleTimeString('es-CO', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      {!isDemoActive && (
                        <Link prefetch={false}
                          href={`/facturas/${fac.id}/print`}
                          title="Imprimir o enviar tirilla por WhatsApp"
                          className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </Link>
                      )}
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="py-12 flex flex-col items-center justify-center text-center">
                <div className="rounded-2xl bg-indigo-50 p-3 text-indigo-500 mb-2.5">
                  <ReceiptText className="h-6 w-6" />
                </div>
                <p className="text-sm font-black text-slate-700">Sin recibos emitidos aún</p>
                <p className="text-xs text-slate-400 mt-0.5 max-w-[230px]">
                  Abre el mostrador POS para registrar tu primera venta rápida.
                </p>
                <Link prefetch={false}
                  href="/facturas"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700"
                >
                  Ir a Facturación <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
