'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Package,
  ReceiptText,
  Users,
  Calendar,
  LogOut,
  ShieldCheck,
  Truck,
  ShoppingCart,
  LineChart,
  Settings,
  Building2,
  KeyRound,
} from 'lucide-react'
import { logout } from '@/app/actions/auth'
import { limpiarCatalogoLocal } from '@/lib/catalogo/store'
import { borrarTodasLasVentasEnEspera } from '@/lib/pos/ventas-en-espera'

const tenantNavigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, adminOnly: false },
  { name: 'Inventario', href: '/inventario', icon: Package, adminOnly: false },
  { name: 'Facturación', href: '/facturas', icon: ReceiptText, adminOnly: false },
  { name: 'Compras', href: '/compras', icon: ShoppingCart, adminOnly: true },
  { name: 'Proveedores', href: '/proveedores', icon: Truck, adminOnly: true },
  { name: 'Reportes', href: '/reportes', icon: LineChart, adminOnly: true },
  { name: 'Usuarios', href: '/usuarios', icon: Users, adminOnly: true },
  { name: 'Cronograma', href: '/cronograma', icon: Calendar, adminOnly: false },
]

const superAdminNavigation = [
  { name: 'Droguerías y Uso', href: '/droguerias', tab: 'droguerias', icon: Building2 },
  { name: 'Usuarios Globales', href: '/droguerias?tab=usuarios', tab: 'usuarios', icon: Users },
  { name: 'API Keys', href: '/droguerias?tab=apikeys', tab: 'apikeys', icon: KeyRound },
] as const

type SuperAdminTab = 'droguerias' | 'usuarios' | 'apikeys'

function parseSuperAdminTab(raw: string | null): SuperAdminTab {
  if (raw === 'usuarios') return 'usuarios'
  if (raw === 'apikeys') return 'apikeys'
  return 'droguerias'
}

function SidebarInner({
  role,
  drogueriaNombre,
  hasActiveTenant,
  onNavigate,
}: {
  role?: string | null
  drogueriaNombre?: string | null
  hasActiveTenant?: boolean
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const isSuperAdmin = role === 'superadmin'
  const isAdmin = role === 'admin' || isSuperAdmin
  const urlTab = parseSuperAdminTab(searchParams.get('tab'))
  const [clientTab, setClientTab] = useState<SuperAdminTab>(urlTab)
  const [prevUrlTab, setPrevUrlTab] = useState<SuperAdminTab>(urlTab)

  if (urlTab !== prevUrlTab) {
    setPrevUrlTab(urlTab)
    setClientTab(urlTab)
  }

  useEffect(() => {
    const handleTabChange = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail
      if (detail === 'droguerias' || detail === 'usuarios' || detail === 'apikeys') {
        setClientTab(detail)
      }
    }
    window.addEventListener('droguerias-tab-change', handleTabChange)
    return () => window.removeEventListener('droguerias-tab-change', handleTabChange)
  }, [])

  const currentTab = pathname === '/droguerias' ? clientTab : urlTab

  const visibleTenantItems = tenantNavigation.filter((item) => !item.adminOnly || isAdmin)

  return (
    <div className="flex h-full flex-col bg-white border-r border-slate-100 w-64 shadow-sm">
      <div className="flex h-16 items-center px-6 border-b border-slate-100 bg-slate-50/30">
        <Link
          href={isSuperAdmin && !hasActiveTenant ? '/droguerias' : '/dashboard'}
          prefetch={false}
          onClick={onNavigate}
          className="flex items-center gap-3 group min-w-0"
        >
          <div
            className={cn(
              'p-1.5 rounded-xl shadow-lg group-hover:scale-110 transition-transform shrink-0',
              isSuperAdmin && !hasActiveTenant
                ? 'bg-indigo-600 shadow-indigo-600/20'
                : 'bg-emerald-600 shadow-emerald-600/20'
            )}
          >
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <div className="min-w-0">
            <span className="text-lg font-black text-slate-900 tracking-tight block truncate">
              {drogueriaNombre || 'TechPharmacy'}
            </span>
            <span
              className={cn(
                'text-[10px] font-black uppercase tracking-widest block',
                isSuperAdmin ? 'text-indigo-600' : 'text-slate-400'
              )}
            >
              {isSuperAdmin
                ? hasActiveTenant
                  ? 'Modo Soporte Superadmin'
                  : 'Consola Superadmin'
                : 'TechPharmacy POS'}
            </span>
          </div>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto py-8 px-4 space-y-2">
        {isSuperAdmin && (
          <>
            <p className="px-4 pb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
              Plataforma SaaS
            </p>
            {superAdminNavigation.map((item) => {
              const isActive = pathname === '/droguerias' && currentTab === item.tab
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  prefetch={false}
                  onClick={(e) => {
                    if (pathname === '/droguerias') {
                      e.preventDefault()
                      window.history.replaceState(null, '', item.href)
                      setClientTab(item.tab)
                      window.dispatchEvent(
                        new CustomEvent('droguerias-tab-change', { detail: item.tab })
                      )
                    }
                    onNavigate?.()
                  }}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-2xl transition-all duration-200 group',
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 shadow-sm shadow-indigo-600/5'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                  )}
                >
                  <item.icon
                    className={cn(
                      'h-5 w-5 transition-colors',
                      isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'
                    )}
                  />
                  {item.name}
                  {isActive && <div className="ml-auto w-1.5 h-6 rounded-full bg-indigo-500" />}
                </Link>
              )
            })}
          </>
        )}

        {(!isSuperAdmin || hasActiveTenant) && (
          <>
            {isSuperAdmin && hasActiveTenant && (
              <p className="px-4 pt-4 pb-1 text-[10px] font-black uppercase tracking-widest text-emerald-600">
                Sede Activa: {drogueriaNombre}
              </p>
            )}
            {visibleTenantItems.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  prefetch={false}
                  onClick={onNavigate}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 text-sm font-bold rounded-2xl transition-all duration-200 group',
                    isActive
                      ? 'bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-600/5'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                  )}
                >
                  <item.icon
                    className={cn(
                      'h-5 w-5 transition-colors',
                      isActive ? 'text-emerald-600' : 'text-slate-400 group-hover:text-slate-600'
                    )}
                  />
                  {item.name}
                  {isActive && <div className="ml-auto w-1.5 h-6 rounded-full bg-emerald-500" />}
                </Link>
              )
            })}
          </>
        )}
      </div>

      <div className="p-4 border-t border-slate-100 bg-slate-50/30 space-y-2">
        <Link
          href="/configuracion"
          prefetch={false}
          onClick={onNavigate}
          className={cn(
            'flex w-full items-center gap-3 px-4 py-3 text-sm font-bold rounded-2xl transition-all duration-200',
            pathname === '/configuracion'
              ? isSuperAdmin
                ? 'bg-indigo-50 text-indigo-700 shadow-sm shadow-indigo-600/5'
                : 'bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-600/5'
              : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
          )}
        >
          <Settings
            className={cn(
              'h-5 w-5',
              pathname === '/configuracion'
                ? isSuperAdmin
                  ? 'text-indigo-600'
                  : 'text-emerald-600'
                : 'text-slate-400'
            )}
          />
          Mi Perfil
        </Link>
        <button
          onClick={async () => {
            // No deja el catálogo ni carritos en espera (con datos de clientes) en el equipo.
            borrarTodasLasVentasEnEspera(window.localStorage)
            await limpiarCatalogoLocal().catch(() => undefined)
            await logout()
          }}
          className="flex w-full items-center gap-3 px-4 py-3 text-sm font-bold text-slate-500 rounded-2xl hover:text-red-600 hover:bg-red-50 transition-all duration-200"
        >
          <LogOut className="h-5 w-5" />
          Cerrar Sesión
        </button>
      </div>
    </div>
  )
}

export function Sidebar(props: {
  role?: string | null
  drogueriaNombre?: string | null
  hasActiveTenant?: boolean
  onNavigate?: () => void
}) {
  return (
    <Suspense fallback={<div className="w-64 bg-white border-r border-slate-100 h-full" />}>
      <SidebarInner {...props} />
    </Suspense>
  )
}
