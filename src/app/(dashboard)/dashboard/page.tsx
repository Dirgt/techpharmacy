import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  Package, 
  Users, 
  ArrowUpRight, 
  TrendingUp, 
  AlertCircle,
  LayoutDashboard
} from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const stats = [
    { title: 'Ventas Totales', value: '$0.00', icon: TrendingUp, trend: '+0%', color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { title: 'Productos en Stock', value: '0', icon: Package, trend: '0 críticos', color: 'text-blue-600', bg: 'bg-blue-50' },
    { title: 'Usuarios Activos', value: '1', icon: Users, trend: 'Admin', color: 'text-purple-600', bg: 'bg-purple-50' },
    { title: 'Alertas', value: '0', icon: AlertCircle, trend: 'Sin riesgo', color: 'text-amber-600', bg: 'bg-amber-50' },
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

      <div className="grid gap-8 md:grid-cols-2">
        <Card className="border-none bg-white shadow-2xl shadow-slate-200/60 rounded-[2.5rem] overflow-hidden">
          <CardHeader className="p-8 bg-slate-50/50 border-b border-slate-100">
            <CardTitle className="text-slate-900 text-xl font-black uppercase tracking-wider">Actividad Reciente</CardTitle>
          </CardHeader>
          <CardContent className="p-10">
            <div className="flex h-[250px] flex-col items-center justify-center text-slate-300 border-4 border-dashed border-slate-50 rounded-[2rem] gap-4">
               <div className="bg-slate-50 p-4 rounded-full">
                  <TrendingUp className="h-10 w-10 text-slate-200" />
               </div>
               <p className="font-bold text-slate-400">No hay actividad registrada hoy</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none bg-white shadow-2xl shadow-slate-200/60 rounded-[2.5rem] overflow-hidden">
          <CardHeader className="p-8 bg-slate-50/50 border-b border-slate-100">
            <CardTitle className="text-slate-900 text-xl font-black uppercase tracking-wider">Próximos Turnos</CardTitle>
          </CardHeader>
          <CardContent className="p-10">
            <div className="flex h-[250px] flex-col items-center justify-center text-slate-300 border-4 border-dashed border-slate-50 rounded-[2rem] gap-4">
               <div className="bg-slate-50 p-4 rounded-full">
                  <Users className="h-10 w-10 text-slate-200" />
               </div>
               <p className="font-bold text-slate-400">No hay turnos asignados</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
