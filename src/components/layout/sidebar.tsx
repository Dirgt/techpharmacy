'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { 
  LayoutDashboard, 
  Package, 
  ReceiptText, 
  Users, 
  Calendar, 
  LogOut,
  ShieldCheck,
  PackagePlus,
  Truck,
  ShoppingCart,
  LineChart,
  Settings
} from 'lucide-react'
import { logout } from '@/app/actions/auth'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Inventario', href: '/inventario', icon: Package },
  { name: 'Facturación', href: '/facturas', icon: ReceiptText },
  { name: 'Compras', href: '/compras', icon: ShoppingCart },
  { name: 'Proveedores', href: '/proveedores', icon: Truck },
  { name: 'Reportes', href: '/reportes', icon: LineChart },
  { name: 'Usuarios', href: '/usuarios', icon: Users },
  { name: 'Cronograma', href: '/cronograma', icon: Calendar },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="flex h-full flex-col bg-white border-r border-slate-100 w-64 shadow-sm">
      <div className="flex h-16 items-center px-6 border-b border-slate-100 bg-slate-50/30">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="bg-emerald-600 p-1.5 rounded-xl shadow-lg shadow-emerald-600/20 group-hover:scale-110 transition-transform">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <span className="text-xl font-black text-slate-900 tracking-tight">TechPharmacy</span>
        </Link>
      </div>
      
      <div className="flex-1 overflow-y-auto py-8 px-4 space-y-2">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              prefetch={true}
              className={cn(
                "flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-2xl transition-all duration-200 group",
                isActive 
                  ? "bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-600/5" 
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              )}
            >
              <item.icon className={cn(
                "h-5 w-5 transition-colors",
                isActive ? "text-emerald-600" : "text-slate-400 group-hover:text-slate-600"
              )} />
              {item.name}
              {isActive && (
                <div className="ml-auto w-1.5 h-6 rounded-full bg-emerald-500" />
              )}
            </Link>
          )
        })}
      </div>

      <div className="p-4 border-t border-slate-100 bg-slate-50/30 space-y-2">
        <Link
          href="/configuracion"
          prefetch={true}
          className={cn(
            "flex w-full items-center gap-3 px-4 py-3 text-sm font-bold rounded-2xl transition-all duration-200",
            pathname === '/configuracion'
              ? "bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-600/5"
              : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
          )}
        >
          <Settings className={cn("h-5 w-5", pathname === '/configuracion' ? "text-emerald-600" : "text-slate-400")} />
          Mi Perfil
        </Link>
        <button
          onClick={() => logout()}
          className="flex w-full items-center gap-3 px-4 py-3 text-sm font-bold text-slate-500 rounded-2xl hover:text-red-600 hover:bg-red-50 transition-all duration-200"
        >
          <LogOut className="h-5 w-5" />
          Cerrar Sesión
        </button>
      </div>
    </div>
  )
}
