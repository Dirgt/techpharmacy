import { getReporteFinancieroDiario, getIngresosGastosMensuales, getTopProductos } from '@/app/actions/reportes'
import ReportesClient from './reportes-client'

export const dynamic = 'force-dynamic'

export default async function ReportesPage() {
  const [reporteRes, chartRes, topRes] = await Promise.all([
    getReporteFinancieroDiario(),
    getIngresosGastosMensuales(),
    getTopProductos()
  ])
  
  const reporte = reporteRes.success && reporteRes.data ? reporteRes.data : { facturas: [], compras: [], gastos: [] }
  const chartData = chartRes.success && chartRes.data ? chartRes.data : []
  const topData = topRes.success && topRes.data ? topRes.data : []

  return (
    <div className="h-full flex flex-col p-6 lg:p-8">
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Reportes y Analíticas</h1>
          <p className="text-slate-500 font-bold mt-1">
            Resumen de ingresos, gastos operativos y productos más vendidos
          </p>
        </div>
      </div>

      <ReportesClient reporte={reporte} chartData={chartData} topData={topData} />
    </div>
  )
}
