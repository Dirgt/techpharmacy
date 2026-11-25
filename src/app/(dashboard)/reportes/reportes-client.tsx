'use client'

import { useMemo, useState } from 'react'
import {
  TrendingDown,
  TrendingUp,
  Wallet,
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  PieChart,
  ShoppingBag,
  ShieldAlert,
  FileDown,
  Search,
} from 'lucide-react'
import { toast } from 'sonner'
import { IngresosGastosChart } from '@/components/reportes/ingresos-gastos-chart'
import { TopProductosChart } from '@/components/reportes/top-productos-chart'
import { formatCurrency } from '@/lib/utils'
import {
  AuditLogItem,
  getVentasMesContable,
  HistorialCajaItem,
  PedidoSugeridoItem,
} from '@/app/actions/reportes'

interface ReporteFactura {
  total: number | null
  metodo_pago: string | null
  estado_pago: string | null
  pago_efectivo?: number | null
  pago_tarjeta?: number | null
  pago_transferencia?: number | null
}

interface ReporteCompra {
  total: number | null
  metodo_pago: string | null
  estado_pago: string | null
}

interface ReporteGasto {
  monto: number | null
  tipo: string | null
}

export default function ReportesClient({
  reporte,
  chartData,
  topData,
  pedidoSugerido = [],
  logsAuditoria = [],
  historialCajas = [],
}: {
  reporte: { facturas: ReporteFactura[]; compras: ReporteCompra[]; gastos: ReporteGasto[] }
  chartData: { fecha: string; ingresos: number; gastos: number }[]
  topData: { name: string; ventas: number }[]
  pedidoSugerido?: PedidoSugeridoItem[]
  logsAuditoria?: AuditLogItem[]
  historialCajas?: HistorialCajaItem[]
}) {
  const { facturas, compras, gastos } = reporte
  const [activeTab, setActiveTab] = useState<'resumen' | 'cajas' | 'pedido' | 'auditoria'>('resumen')
  const [exportingMes, setExportingMes] = useState(false)
  const [mesContable, setMesContable] = useState(() => new Date().toISOString().slice(0, 7))
  const [searchLog, setSearchLog] = useState('')

  const finanzas = useMemo(() => {
    let ventasEfectivo = 0,
      ventasTarjeta = 0,
      ventasTransferencia = 0
    let comprasEfectivo = 0,
      comprasOtros = 0
    let gastosOperativos = 0,
      gastosNomina = 0

    facturas.forEach((f) => {
      if (f.estado_pago === 'anulada') return
      const t = Number(f.total) || 0
      if (f.metodo_pago === 'mixto') {
        ventasEfectivo += Number(f.pago_efectivo) || 0
        ventasTarjeta += Number(f.pago_tarjeta) || 0
        ventasTransferencia += Number(f.pago_transferencia) || 0
      } else if (f.metodo_pago === 'efectivo') {
        ventasEfectivo += t
      } else if (f.metodo_pago === 'tarjeta') {
        ventasTarjeta += t
      } else if (f.metodo_pago === 'transferencia') {
        ventasTransferencia += t
      }
    })

    compras.forEach((c) => {
      const t = Number(c.total) || 0
      if (c.estado_pago === 'pagado') {
        if (c.metodo_pago === 'efectivo') comprasEfectivo += t
        else comprasOtros += t
      }
    })

    gastos.forEach((g) => {
      const m = Number(g.monto) || 0
      if (g.tipo === 'nomina') gastosNomina += m
      else gastosOperativos += m
    })

    const totalIngresos = ventasEfectivo + ventasTarjeta + ventasTransferencia
    const totalEgresos = comprasEfectivo + comprasOtros + gastosOperativos + gastosNomina
    const plNeto = totalIngresos - totalEgresos
    const flujoCaja = ventasEfectivo - comprasEfectivo - gastosOperativos - gastosNomina

    return {
      ventasEfectivo,
      ventasTarjeta,
      ventasTransferencia,
      totalIngresos,
      comprasEfectivo,
      comprasOtros,
      gastosOperativos,
      gastosNomina,
      totalEgresos,
      plNeto,
      flujoCaja,
    }
  }, [facturas, compras, gastos])

  const filteredLogs = useMemo(() => {
    const q = searchLog.trim().toLowerCase()
    if (!q) return logsAuditoria
    return logsAuditoria.filter(
      (l) =>
        l.accion.toLowerCase().includes(q) ||
        l.detalles.toLowerCase().includes(q) ||
        l.usuario_nombre.toLowerCase().includes(q) ||
        (l.tipo_entidad || '').toLowerCase().includes(q)
    )
  }, [logsAuditoria, searchLog])

  const downloadCsv = (filename: string, lines: string[]) => {
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleExportMesContable = async () => {
    setExportingMes(true)
    try {
      const res = await getVentasMesContable(mesContable)
      if (!res.success || !res.data) {
        toast.error(res.error || 'No se pudo exportar el mes')
        return
      }
      if (res.data.length === 0) {
        toast.error(`No hay facturas registradas en ${mesContable}`)
        return
      }

      const headers = [
        'Numero',
        'Fecha',
        'Cliente',
        'Documento',
        'Tipo Venta',
        'Metodo Pago',
        'Pago Efectivo',
        'Pago Tarjeta',
        'Pago Transferencia',
        'Estado',
        'Subtotal',
        'Descuento',
        'IVA',
        'Total',
        'Monto Abonado',
      ].join(';')

      const rows = res.data.map((f) =>
        [
          f.numero,
          f.created_at ? new Date(f.created_at).toLocaleString() : '',
          `"${(f.cliente_nombre || '').replace(/"/g, '""')}"`,
          `"${(f.cliente_documento || '').replace(/"/g, '""')}"`,
          f.tipo_venta || '',
          f.metodo_pago || '',
          f.pago_efectivo || 0,
          f.pago_tarjeta || 0,
          f.pago_transferencia || 0,
          f.estado_pago || '',
          f.subtotal_bruto || 0,
          f.descuento_monto || 0,
          f.iva_total || 0,
          f.total || 0,
          f.monto_abonado || 0,
        ].join(';')
      )

      downloadCsv(`ventas_contables_${mesContable}.csv`, [headers, ...rows])
      toast.success(`Exportadas ${res.data.length} facturas de ${mesContable}`)
    } finally {
      setExportingMes(false)
    }
  }

  const handleExportPedido = () => {
    if (pedidoSugerido.length === 0) {
      toast.error('No hay productos sugeridos para pedir')
      return
    }
    const headers = [
      'Codigo',
      'Producto',
      'Principio Activo',
      'Laboratorio',
      'Stock Actual Cajas',
      'Stock Minimo',
      'Ventas 30d Cajas',
      'Cantidad Sugerida Pedir',
    ].join(';')
    const rows = pedidoSugerido.map((p) =>
      [
        `"${p.codigo}"`,
        `"${p.nombre.replace(/"/g, '""')}"`,
        `"${(p.principio_activo || '').replace(/"/g, '""')}"`,
        `"${p.laboratorio.replace(/"/g, '""')}"`,
        p.stock_actual_cajas,
        p.stock_minimo,
        p.ventas_30d_cajas,
        p.sugerido_cajas,
      ].join(';')
    )
    downloadCsv(`pedido_sugerido_${new Date().toISOString().slice(0, 10)}.csv`, [headers, ...rows])
    toast.success('Pedido sugerido exportado para Excel')
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Navegación por pestañas */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-2">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTab('resumen')}
            className={`px-4 py-2.5 rounded-xl text-sm font-black transition-colors flex items-center gap-2 ${
              activeTab === 'resumen'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Resumen Financiero
          </button>
          <button
            onClick={() => setActiveTab('cajas')}
            className={`px-4 py-2.5 rounded-xl text-sm font-black transition-colors flex items-center gap-2 ${
              activeTab === 'cajas'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Wallet className="w-4 h-4" />
            Arqueos de Caja ({historialCajas.length})
          </button>
          <button
            onClick={() => setActiveTab('pedido')}
            className={`px-4 py-2.5 rounded-xl text-sm font-black transition-colors flex items-center gap-2 ${
              activeTab === 'pedido'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            Pedido Sugerido ({pedidoSugerido.length})
          </button>
          <button
            onClick={() => setActiveTab('auditoria')}
            className={`px-4 py-2.5 rounded-xl text-sm font-black transition-colors flex items-center gap-2 ${
              activeTab === 'auditoria'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            Auditoría Global ({logsAuditoria.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="month"
            value={mesContable}
            onChange={(e) => setMesContable(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
          />
          <button
            onClick={handleExportMesContable}
            disabled={exportingMes}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black inline-flex items-center gap-2 transition-all disabled:opacity-50"
          >
            <FileDown className="w-4 h-4" />
            {exportingMes ? 'Exportando...' : 'Exportar Contable CSV'}
          </button>
        </div>
      </div>

      {activeTab === 'resumen' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-emerald-500 rounded-3xl p-6 text-white shadow-xl shadow-emerald-500/20 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white rounded-full blur-[50px] opacity-20 -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700" />
              <div className="relative z-10 flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <span className="text-emerald-50 font-black uppercase tracking-wider text-xs">
                    Ventas (Ingresos Brutos)
                  </span>
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md">
                    <TrendingUp className="w-5 h-5 text-white" />
                  </div>
                </div>
                <span className="text-4xl font-black tracking-tighter">
                  {formatCurrency(finanzas.totalIngresos)}
                </span>
              </div>
            </div>

            <div className="bg-rose-500 rounded-3xl p-6 text-white shadow-xl shadow-rose-500/20 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white rounded-full blur-[50px] opacity-20 -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700" />
              <div className="relative z-10 flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <span className="text-rose-50 font-black uppercase tracking-wider text-xs">
                    Egresos (Compras + Gastos)
                  </span>
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md">
                    <TrendingDown className="w-5 h-5 text-white" />
                  </div>
                </div>
                <span className="text-4xl font-black tracking-tighter">
                  {formatCurrency(finanzas.totalEgresos)}
                </span>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xl flex flex-col gap-4 relative overflow-hidden">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-black uppercase tracking-wider text-xs">
                  P&L Neto (Ganancia del Día)
                </span>
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    finanzas.plNeto >= 0 ? 'bg-emerald-50' : 'bg-rose-50'
                  }`}
                >
                  <Activity
                    className={`w-5 h-5 ${
                      finanzas.plNeto >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  />
                </div>
              </div>
              <span
                className={`text-4xl font-black tracking-tighter ${
                  finanzas.plNeto >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {formatCurrency(finanzas.plNeto)}
              </span>
            </div>

            <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-black uppercase tracking-wider text-xs">
                  Flujo de Caja (Efectivo)
                </span>
                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                  <Wallet className="w-5 h-5 text-white" />
                </div>
              </div>
              <span className="text-4xl font-black tracking-tighter">
                {formatCurrency(finanzas.flujoCaja)}
              </span>
              <p className="text-xs text-slate-400 font-bold -mt-2">
                Efectivo que debe estar en caja
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8">
              <h2 className="text-lg font-black text-slate-900 mb-6 flex items-center">
                <ArrowUpRight className="w-5 h-5 text-emerald-500 mr-2" />
                Desglose de Ingresos
              </h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
                  <span className="font-bold text-slate-600">Ventas en Efectivo</span>
                  <span className="font-black text-slate-900">
                    {formatCurrency(finanzas.ventasEfectivo)}
                  </span>
                </div>
                <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
                  <span className="font-bold text-slate-600">Ventas con Tarjeta</span>
                  <span className="font-black text-slate-900">
                    {formatCurrency(finanzas.ventasTarjeta)}
                  </span>
                </div>
                <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
                  <span className="font-bold text-slate-600">Ventas por Transferencia</span>
                  <span className="font-black text-slate-900">
                    {formatCurrency(finanzas.ventasTransferencia)}
                  </span>
                </div>
                <div className="flex justify-between items-center p-4 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-100">
                  <span className="font-black uppercase text-xs tracking-widest">Total Ingresos</span>
                  <span className="font-black text-xl">
                    {formatCurrency(finanzas.totalIngresos)}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8">
              <h2 className="text-lg font-black text-slate-900 mb-6 flex items-center">
                <ArrowDownRight className="w-5 h-5 text-rose-500 mr-2" />
                Desglose de Egresos
              </h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
                  <span className="font-bold text-slate-600">Compras Pagadas (Efectivo Caja)</span>
                  <span className="font-black text-slate-900">
                    {formatCurrency(finanzas.comprasEfectivo)}
                  </span>
                </div>
                <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
                  <span className="font-bold text-slate-600">Compras Pagadas (Otros Métodos)</span>
                  <span className="font-black text-slate-900">
                    {formatCurrency(finanzas.comprasOtros)}
                  </span>
                </div>
                <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
                  <span className="font-bold text-slate-600">Gastos Operativos (Efectivo)</span>
                  <span className="font-black text-slate-900">
                    {formatCurrency(finanzas.gastosOperativos)}
                  </span>
                </div>
                <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
                  <span className="font-bold text-slate-600">Nómina / Adelantos (Efectivo)</span>
                  <span className="font-black text-slate-900">
                    {formatCurrency(finanzas.gastosNomina)}
                  </span>
                </div>
                <div className="flex justify-between items-center p-4 bg-rose-50 text-rose-700 rounded-2xl border border-rose-100">
                  <span className="font-black uppercase text-xs tracking-widest">Total Egresos</span>
                  <span className="font-black text-xl">
                    {formatCurrency(finanzas.totalEgresos)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8">
              <h2 className="text-lg font-black text-slate-900 mb-2 flex items-center">
                <BarChart3 className="w-5 h-5 text-indigo-500 mr-2" />
                Ingresos vs Gastos
              </h2>
              <p className="text-sm text-slate-500 font-medium mb-6">
                Comparativa de los últimos 7 días
              </p>
              <div className="h-[350px]">
                {chartData && chartData.length > 0 ? (
                  <IngresosGastosChart data={chartData} />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-50 rounded-2xl">
                    <p className="font-bold">No hay datos suficientes</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8">
              <h2 className="text-lg font-black text-slate-900 mb-2 flex items-center">
                <PieChart className="w-5 h-5 text-purple-500 mr-2" />
                Top 10 Más Vendidos
              </h2>
              <p className="text-sm text-slate-500 font-medium mb-6">
                Medicamentos con mayor rotación
              </p>
              <div className="h-[350px]">
                {topData && topData.length > 0 ? (
                  <TopProductosChart data={topData} />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-50 rounded-2xl">
                    <p className="font-bold">No hay ventas registradas</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'cajas' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                Turnos Registrados
              </p>
              <p className="text-2xl font-black text-slate-900 mt-1">{historialCajas.length}</p>
            </div>
            <div className="bg-emerald-50/70 rounded-2xl border border-emerald-200 p-5 shadow-sm">
              <p className="text-[11px] font-black uppercase tracking-wider text-emerald-700">
                Total Sobrantes
              </p>
              <p className="text-2xl font-black text-emerald-800 mt-1">
                {formatCurrency(
                  historialCajas.reduce(
                    (acc, c) => acc + (c.diferencia && c.diferencia > 0 ? c.diferencia : 0),
                    0
                  )
                )}
              </p>
            </div>
            <div className="bg-rose-50/70 rounded-2xl border border-rose-200 p-5 shadow-sm">
              <p className="text-[11px] font-black uppercase tracking-wider text-rose-700">
                Total Faltantes
              </p>
              <p className="text-2xl font-black text-rose-800 mt-1">
                {formatCurrency(
                  historialCajas.reduce(
                    (acc, c) => acc + (c.diferencia && c.diferencia < 0 ? Math.abs(c.diferencia) : 0),
                    0
                  )
                )}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-900">
                  Historial de Arqueos y Descuadres de Caja
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Compara el efectivo esperado en sistema contra lo contado por el cajero al cerrar turno.
                </p>
              </div>
              <button
                onClick={() => {
                  if (historialCajas.length === 0) {
                    toast.error('No hay turnos registrados para exportar')
                    return
                  }
                  const headers = [
                    'Estado',
                    'Apertura',
                    'Cierre',
                    'Abrio',
                    'Cerro',
                    'Base Apertura',
                    'Esperado',
                    'Contado Cierre',
                    'Diferencia',
                  ].join(';')
                  const rows = historialCajas.map((c) =>
                    [
                      c.estado || '',
                      c.fecha_apertura ? new Date(c.fecha_apertura).toLocaleString() : '',
                      c.fecha_cierre ? new Date(c.fecha_cierre).toLocaleString() : '',
                      `"${c.abierto_por_nombre.replace(/"/g, '""')}"`,
                      `"${(c.cerrado_por_nombre || '').replace(/"/g, '""')}"`,
                      c.monto_apertura,
                      c.monto_esperado ?? '',
                      c.monto_cierre ?? '',
                      c.diferencia ?? '',
                    ].join(';')
                  )
                  downloadCsv(`arqueos_caja_${new Date().toISOString().slice(0, 10)}.csv`, [
                    headers,
                    ...rows,
                  ])
                  toast.success('Historial de arqueos exportado')
                }}
                disabled={historialCajas.length === 0}
                className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black inline-flex items-center gap-2 shrink-0 disabled:opacity-50"
              >
                <FileDown className="w-4 h-4" />
                Exportar Arqueos CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-black text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Apertura / Cierre</th>
                    <th className="px-6 py-4">Responsable</th>
                    <th className="px-6 py-4 text-right">Base</th>
                    <th className="px-6 py-4 text-right">Esperado</th>
                    <th className="px-6 py-4 text-right">Contado</th>
                    <th className="px-6 py-4 text-right">Diferencia</th>
                    <th className="px-6 py-4 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historialCajas.map((c) => {
                    const diff = c.diferencia ?? 0
                    const isClosed = c.estado === 'cerrada' || c.estado === 'cerrado'
                    return (
                      <tr key={c.id} className="hover:bg-slate-50/70">
                        <td className="px-6 py-4 text-xs text-slate-600">
                          <p className="font-bold text-slate-800">
                            {c.fecha_apertura ? new Date(c.fecha_apertura).toLocaleString() : '-'}
                          </p>
                          <p className="text-slate-400">
                            {c.fecha_cierre
                              ? `Cierre: ${new Date(c.fecha_cierre).toLocaleString()}`
                              : 'Turno en curso'}
                          </p>
                        </td>
                        <td className="px-6 py-4 text-xs">
                          <p className="font-bold text-slate-900">{c.abierto_por_nombre}</p>
                          {c.cerrado_por_nombre && c.cerrado_por_nombre !== c.abierto_por_nombre && (
                            <p className="text-slate-400">Cerró: {c.cerrado_por_nombre}</p>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right font-semibold text-slate-700">
                          {formatCurrency(c.monto_apertura)}
                        </td>
                        <td className="px-6 py-4 text-right font-semibold text-slate-700">
                          {c.monto_esperado !== null ? formatCurrency(c.monto_esperado) : '-'}
                        </td>
                        <td className="px-6 py-4 text-right font-black text-slate-900">
                          {c.monto_cierre !== null ? formatCurrency(c.monto_cierre) : '-'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {c.diferencia !== null ? (
                            <span
                              className={`inline-flex px-2.5 py-1 rounded-full text-xs font-black ${
                                Math.abs(diff) < 1
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : diff > 0
                                    ? 'bg-indigo-100 text-indigo-700'
                                    : 'bg-rose-100 text-rose-700'
                              }`}
                            >
                              {Math.abs(diff) < 1
                                ? 'Cuadrada'
                                : diff > 0
                                  ? `+${formatCurrency(diff)} Sobrante`
                                  : `-${formatCurrency(Math.abs(diff))} Faltante`}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                              isClosed
                                ? 'bg-slate-100 text-slate-700'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {c.estado || 'abierta'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                  {historialCajas.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-400 font-bold">
                        Aún no hay sesiones de caja registradas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'pedido' && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-slate-900">
                Pedido Sugerido Inteligente (Últimos 30 días)
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Calculado cruzando la rotación de ventas de los últimos 30 días, stock mínimo y existencias actuales.
              </p>
            </div>
            <button
              onClick={handleExportPedido}
              disabled={pedidoSugerido.length === 0}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black inline-flex items-center gap-2 shrink-0 disabled:opacity-50"
            >
              <FileDown className="w-4 h-4" />
              Exportar Pedido Excel
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-black text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Producto</th>
                  <th className="px-6 py-4">Laboratorio</th>
                  <th className="px-6 py-4 text-center">Stock Actual</th>
                  <th className="px-6 py-4 text-center">Stock Mínimo</th>
                  <th className="px-6 py-4 text-center">Ventas 30d</th>
                  <th className="px-6 py-4 text-right">Sugerido a Pedir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pedidoSugerido.map((item) => (
                  <tr key={item.producto_id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-900">{item.nombre}</p>
                      <p className="text-xs text-slate-400">
                        {item.codigo}
                        {item.principio_activo ? ` • ${item.principio_activo}` : ''}
                      </p>
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-600">{item.laboratorio}</td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-black ${
                          item.stock_actual_cajas <= item.stock_minimo
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {item.stock_actual_cajas} cajas
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center font-bold text-slate-500">
                      {item.stock_minimo}
                    </td>
                    <td className="px-6 py-4 text-center font-bold text-slate-700">
                      {item.ventas_30d_cajas} cajas
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="inline-flex px-3 py-1 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 font-black text-xs">
                        +{item.sugerido_cajas} cajas
                      </span>
                    </td>
                  </tr>
                ))}
                {pedidoSugerido.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-bold">
                      Todo tu inventario tiene cobertura suficiente para los próximos 30 días.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'auditoria' && (
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchLog}
              onChange={(e) => setSearchLog(e.target.value)}
              placeholder="Buscar por usuario, acción o detalle..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none focus:border-emerald-500"
            />
          </div>

          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-black text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4">Usuario</th>
                    <th className="px-6 py-4">Acción</th>
                    <th className="px-6 py-4">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/70">
                      <td className="px-6 py-4 text-xs text-slate-500 whitespace-nowrap">
                        {log.created_at ? new Date(log.created_at).toLocaleString() : '-'}
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-800">{log.usuario_nombre}</td>
                      <td className="px-6 py-4">
                        <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[10px] font-black uppercase">
                          {log.accion}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-600">{log.detalles}</td>
                    </tr>
                  ))}
                  {filteredLogs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-slate-400 font-bold">
                        No hay eventos de auditoría registrados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
