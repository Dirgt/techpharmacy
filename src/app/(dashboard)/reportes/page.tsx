import { getVentasDelDia } from '@/app/actions/reportes'
import ReportesClient from './reportes-client'

export const dynamic = 'force-dynamic'

export default async function ReportesPage() {
  const ventasRes = await getVentasDelDia()
  const facturas = ventasRes.success ? ventasRes.data : []

  return (
    <div className="h-full flex flex-col p-6 lg:p-8">
      <div className="flex flex-col md:flex-row justify-between md:items-end gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Reporte de Ventas</h1>
          <p className="text-slate-500 font-bold mt-1">
            Resumen en tiempo real de las operaciones del día
          </p>
        </div>
      </div>

      <ReportesClient initialFacturas={facturas} />
    </div>
  )
}
