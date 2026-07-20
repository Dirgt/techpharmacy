import { Loader2 } from 'lucide-react'

export default function DashboardLoading() {
  return (
    <div className="w-full h-[calc(100vh-6rem)] flex flex-col items-center justify-center animate-in fade-in duration-500">
      <div className="relative flex items-center justify-center">
        <div className="absolute w-24 h-24 border-4 border-indigo-100 rounded-full"></div>
        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
      </div>
      <p className="mt-6 text-slate-500 font-bold text-sm tracking-widest uppercase animate-pulse">
        Cargando módulo...
      </p>
    </div>
  )
}
