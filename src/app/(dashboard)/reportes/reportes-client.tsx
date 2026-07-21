'use client'

import { useMemo } from 'react'
import { DollarSign, Receipt, TrendingDown, TrendingUp, Wallet, Activity, ArrowDownRight, ArrowUpRight, BarChart3, PieChart } from 'lucide-react'
import { IngresosGastosChart } from '@/components/reportes/ingresos-gastos-chart'
import { TopProductosChart } from '@/components/reportes/top-productos-chart'

export default function ReportesClient({ 
  reporte, 
  chartData, 
  topData 
}: { 
  reporte: { facturas: any[], compras: any[], gastos: any[] },
  chartData: any[],
  topData: any[]
}) {
  const { facturas, compras, gastos } = reporte

  const finanzas = useMemo(() => {
    let ventasEfectivo = 0, ventasTarjeta = 0, ventasTransferencia = 0
    let comprasEfectivo = 0, comprasOtros = 0
    let gastosOperativos = 0, gastosNomina = 0

    facturas.forEach(f => {
      const t = Number(f.total) || 0
      if (f.metodo_pago === 'efectivo') ventasEfectivo += t
      else if (f.metodo_pago === 'tarjeta') ventasTarjeta += t
      else if (f.metodo_pago === 'transferencia') ventasTransferencia += t
    })

    compras.forEach(c => {
      const t = Number(c.total) || 0
      if (c.estado_pago === 'pagado') {
        if (c.metodo_pago === 'efectivo') comprasEfectivo += t
        else comprasOtros += t
      }
    })

    gastos.forEach(g => {
      const m = Number(g.monto) || 0
      if (g.tipo === 'nomina') gastosNomina += m
      else gastosOperativos += m
    })

    const totalIngresos = ventasEfectivo + ventasTarjeta + ventasTransferencia
    const totalEgresos = comprasEfectivo + comprasOtros + gastosOperativos + gastosNomina
    const plNeto = totalIngresos - totalEgresos
    
    // Flujo de Caja (solo efectivo)
    const flujoCaja = ventasEfectivo - comprasEfectivo - gastosOperativos - gastosNomina

    return {
      ventasEfectivo, ventasTarjeta, ventasTransferencia, totalIngresos,
      comprasEfectivo, comprasOtros,
      gastosOperativos, gastosNomina, totalEgresos,
      plNeto,
      flujoCaja
    }
  }, [facturas, compras, gastos])

  return (
    <div className="space-y-8 animate-in fade-in duration-1000">
      
      {/* ── KPI PRINCIPALES ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        {/* Ingresos Brutos */}
        <div className="bg-emerald-500 rounded-3xl p-6 text-white shadow-xl shadow-emerald-500/20 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white rounded-full blur-[50px] opacity-20 -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700" />
          <div className="relative z-10 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <span className="text-emerald-50 font-black uppercase tracking-wider text-xs">Ventas (Ingresos Brutos)</span>
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
            </div>
            <span className="text-4xl font-black tracking-tighter">${finanzas.totalIngresos.toLocaleString()}</span>
          </div>
        </div>

        {/* Egresos Totales */}
        <div className="bg-rose-500 rounded-3xl p-6 text-white shadow-xl shadow-rose-500/20 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white rounded-full blur-[50px] opacity-20 -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700" />
          <div className="relative z-10 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <span className="text-rose-50 font-black uppercase tracking-wider text-xs">Egresos (Compras + Gastos)</span>
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md">
                <TrendingDown className="w-5 h-5 text-white" />
              </div>
            </div>
            <span className="text-4xl font-black tracking-tighter">${finanzas.totalEgresos.toLocaleString()}</span>
          </div>
        </div>

        {/* Profit & Loss (P&L) */}
        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xl flex flex-col gap-4 relative overflow-hidden">
          <div className="flex justify-between items-center">
            <span className="text-slate-400 font-black uppercase tracking-wider text-xs">P&L Neto (Ganancia del Día)</span>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${finanzas.plNeto >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
              <Activity className={`w-5 h-5 ${finanzas.plNeto >= 0 ? 'text-emerald-600' : 'text-rose-600'}`} />
            </div>
          </div>
          <span className={`text-4xl font-black tracking-tighter ${finanzas.plNeto >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            ${finanzas.plNeto.toLocaleString()}
          </span>
        </div>

        {/* Flujo de Caja (Efectivo) */}
        <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <span className="text-slate-400 font-black uppercase tracking-wider text-xs">Flujo de Caja (Efectivo)</span>
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
          </div>
          <span className="text-4xl font-black tracking-tighter">
            ${finanzas.flujoCaja.toLocaleString()}
          </span>
          <p className="text-xs text-slate-400 font-bold -mt-2">Efectivo que debe estar en caja</p>
        </div>

      </div>

      {/* ── DESGLOSE FINANCIERO ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Desglose de Ingresos */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8">
          <h2 className="text-lg font-black text-slate-900 mb-6 flex items-center">
            <ArrowUpRight className="w-5 h-5 text-emerald-500 mr-2" />
            Desglose de Ingresos
          </h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
              <span className="font-bold text-slate-600">Ventas en Efectivo</span>
              <span className="font-black text-slate-900">${finanzas.ventasEfectivo.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
              <span className="font-bold text-slate-600">Ventas con Tarjeta</span>
              <span className="font-black text-slate-900">${finanzas.ventasTarjeta.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
              <span className="font-bold text-slate-600">Ventas por Transferencia</span>
              <span className="font-black text-slate-900">${finanzas.ventasTransferencia.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center p-4 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-100">
              <span className="font-black uppercase text-xs tracking-widest">Total Ingresos</span>
              <span className="font-black text-xl">${finanzas.totalIngresos.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Desglose de Egresos */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8">
          <h2 className="text-lg font-black text-slate-900 mb-6 flex items-center">
            <ArrowDownRight className="w-5 h-5 text-rose-500 mr-2" />
            Desglose de Egresos
          </h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
              <span className="font-bold text-slate-600">Compras Pagadas (Efectivo Caja)</span>
              <span className="font-black text-slate-900">${finanzas.comprasEfectivo.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
              <span className="font-bold text-slate-600">Compras Pagadas (Otros Métodos)</span>
              <span className="font-black text-slate-900">${finanzas.comprasOtros.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
              <span className="font-bold text-slate-600">Gastos Operativos (Efectivo)</span>
              <span className="font-black text-slate-900">${finanzas.gastosOperativos.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl">
              <span className="font-bold text-slate-600">Nómina / Adelantos (Efectivo)</span>
              <span className="font-black text-slate-900">${finanzas.gastosNomina.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center p-4 bg-rose-50 text-rose-700 rounded-2xl border border-rose-100">
              <span className="font-black uppercase text-xs tracking-widest">Total Egresos</span>
              <span className="font-black text-xl">${finanzas.totalEgresos.toLocaleString()}</span>
            </div>
          </div>
        </div>

      </div>

      {/* ── GRÁFICOS Y ANALÍTICAS ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        
        {/* Ingresos vs Gastos Mensual */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8">
          <h2 className="text-lg font-black text-slate-900 mb-2 flex items-center">
            <BarChart3 className="w-5 h-5 text-indigo-500 mr-2" />
            Ingresos vs Gastos
          </h2>
          <p className="text-sm text-slate-500 font-medium mb-6">Comparativa de los últimos 7 días</p>
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

        {/* Top 10 Productos Más Vendidos */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-8">
          <h2 className="text-lg font-black text-slate-900 mb-2 flex items-center">
            <PieChart className="w-5 h-5 text-purple-500 mr-2" />
            Top 10 Más Vendidos
          </h2>
          <p className="text-sm text-slate-500 font-medium mb-6">Medicamentos con mayor rotación en el mes</p>
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
  )
}
