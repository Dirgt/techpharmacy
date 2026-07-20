import { getReporteFinancieroDiario } from '@/app/actions/reportes'
import ReportesClient from './reportes-client'

export const dynamic = 'force-dynamic'

export default async function ReportesPage() {
  const reporteRes = await getReporteFinancieroDiario()
  const reporte = reporteRes.success && reporteRes.data ? reporteRes.data : { facturas: [], compras: [], gastos: [] }

  return (
    <div className="h-full flex flex-col p-6 lg:p-8">
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Reporte Financiero Diario (P&L)</h1>
          <p className="text-slate-500 font-bold mt-1">
            Resumen en tiempo real de ingresos, gastos operativos y compras de inventario
          </p>
        </div>
      </div>

      <ReportesClient reporte={reporte} />
    </div>
  )
}
