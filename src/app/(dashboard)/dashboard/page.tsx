import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  Package, 
  Users, 
  ArrowUpRight, 
  TrendingUp, 
  AlertCircle,
  LayoutDashboard,
  AlertTriangle,
  Clock
} from 'lucide-react'
import { getDashboardAlertas } from '@/app/actions/dashboard'
import { getIngresosGastosMensuales, getReporteFinancieroDiario } from '@/app/actions/reportes'
import { IngresosGastosChart } from '@/components/reportes/ingresos-gastos-chart'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [alertasRes, graficoRes, financieroDiaRes] = await Promise.all([
    getDashboardAlertas(),
    getIngresosGastosMensuales(),
    getReporteFinancieroDiario()
  ])

  const alertas = alertasRes.success ? alertasRes.data : { vencimientos: [], vencidos: [], stockBajo: [] }
  const datosGrafico = graficoRes.success ? graficoRes.data : []
  const finDia = financieroDiaRes.success ? financieroDiaRes.data : { facturas: [], gastos: [], compras: [] }

  const totalVentasDia = finDia.facturas.reduce((sum: number, f: any) => sum + Number(f.total || 0), 0)
  const totalCriticos = (alertas?.vencidos?.length || 0) + (alertas?.stockBajo?.length || 0)

  const stats = [
    { title: 'Ventas de Hoy', value: `$${totalVentasDia.toFixed(2)}`, icon: TrendingUp, trend: 'Actual', color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { title: 'Alertas de Stock', value: alertas?.stockBajo?.length.toString() || '0', icon: Package, trend: 'Críticos', color: 'text-blue-600', bg: 'bg-blue-50' },
    { title: 'Usuarios Activos', value: '1', icon: Users, trend: 'Admin', color: 'text-purple-600', bg: 'bg-purple-50' },
    { title: 'Vencimientos', value: ((alertas?.vencidos?.length || 0) + (alertas?.vencimientos?.length || 0)).toString(), icon: AlertCircle, trend: 'Revisión', color: 'text-amber-600', bg: 'bg-amber-50' },
  ]

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-black tracking-tight text-slate-900 flex items-center gap-4">
          <div className="bg-emerald-600 p-2 rounded-2xl shadow-lg shadow-emerald-600/20">
            <LayoutDashboard className="h-8 w-8 text-white" />
          </div>
          Resumen Operativo
        </h1>
        <p className="text-slate-500 text-lg font-medium">
          Bienvenido, <span className="text-emerald-600 font-bold">{user?.user_metadata?.full_name || user?.email}</span>. Aquí tienes el estado actual de la farmacia.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="border-none bg-white shadow-xl shadow-slate-200/50 rounded-[2rem] hover:scale-105 transition-all duration-300 group">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 p-8">
              <CardTitle className="text-sm font-black text-slate-400 uppercase tracking-widest">{stat.title}</CardTitle>
              <div className={`${stat.bg} ${stat.color} p-3 rounded-2xl group-hover:rotate-12 transition-transform`}>
                <stat.icon className="h-5 w-5" />
              </div>
            </CardHeader>
            <CardContent className="px-8 pb-8">
              <div className="text-3xl font-black text-slate-900">{stat.value}</div>
              <p className="text-xs text-slate-400 mt-2 flex items-center font-bold">
                <ArrowUpRight className="h-4 w-4 mr-1 text-emerald-500" />
                {stat.trend}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-none bg-white shadow-2xl shadow-slate-200/60 rounded-[2.5rem] overflow-hidden">
          <CardHeader className="p-8 bg-slate-50/50 border-b border-slate-100">
            <CardTitle className="text-slate-900 text-xl font-black uppercase tracking-wider">Ingresos vs Gastos (Últimos 7 días)</CardTitle>
          </CardHeader>
          <CardContent className="p-10">
            {datosGrafico.length > 0 ? (
              <IngresosGastosChart data={datosGrafico} />
            ) : (
              <div className="flex h-[250px] flex-col items-center justify-center text-slate-300 border-4 border-dashed border-slate-50 rounded-[2rem] gap-4">
                 <p className="font-bold text-slate-400">No hay datos suficientes</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-none bg-white shadow-2xl shadow-slate-200/60 rounded-[2.5rem] overflow-hidden">
          <CardHeader className="p-8 bg-slate-50/50 border-b border-slate-100">
            <CardTitle className="text-slate-900 text-xl font-black uppercase tracking-wider">Alertas Críticas</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-y-auto max-h-[350px]">
            <div className="flex flex-col divide-y divide-slate-100">
              {alertas?.vencidos?.map((item: any) => (
                <div key={item.id} className="p-6 flex items-start gap-4 hover:bg-slate-50">
                  <div className="bg-rose-100 p-2 rounded-full shrink-0">
                    <AlertTriangle className="h-5 w-5 text-rose-600" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{item.nombre_producto}</p>
                    <p className="text-sm text-rose-600 font-medium">Vencido el {item.fecha_vencimiento}</p>
                  </div>
                </div>
              ))}
              
              {alertas?.vencimientos?.map((item: any) => (
                <div key={item.id} className="p-6 flex items-start gap-4 hover:bg-slate-50">
                  <div className="bg-amber-100 p-2 rounded-full shrink-0">
                    <Clock className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{item.nombre_producto}</p>
                    <p className="text-sm text-amber-600 font-medium">Vence pronto ({item.fecha_vencimiento})</p>
                  </div>
                </div>
              ))}

              {alertas?.stockBajo?.map((item: any) => (
                <div key={item.id} className="p-6 flex items-start gap-4 hover:bg-slate-50">
                  <div className="bg-blue-100 p-2 rounded-full shrink-0">
                    <Package className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">{item.nombre_producto}</p>
                    <p className="text-sm text-blue-600 font-medium">Stock bajo: quedan {item.cajas} cajas</p>
                  </div>
                </div>
              ))}

              {totalCriticos === 0 && (!alertas?.vencimientos || alertas?.vencimientos.length === 0) && (
                <div className="p-10 flex flex-col items-center justify-center text-slate-400">
                  <div className="bg-emerald-50 p-4 rounded-full mb-3">
                    <AlertCircle className="h-8 w-8 text-emerald-500" />
                  </div>
                  <p className="font-bold text-center">Todo está en orden</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
