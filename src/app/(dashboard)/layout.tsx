import Link from 'next/link'
import { Sidebar } from '@/components/layout/sidebar'
import { MobileNav } from '@/components/layout/mobile-nav'
import { Toaster } from '@/components/ui/sonner'
import { getCurrentUserWithProfile } from '@/lib/auth/session'
import { getSesionCajaAbierta } from '@/app/actions/caja'
import { Wallet, Shield, ShieldCheck, User, Globe } from 'lucide-react'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getCurrentUserWithProfile()
  const profile = session?.profile
  const userRole = profile?.role || 'vendedor'
  const isSuperAdmin = userRole === 'superadmin'
  const hasActiveTenant = Boolean(profile?.drogueria_id)

  const cajaAbierta = isSuperAdmin && !hasActiveTenant ? null : await getSesionCajaAbierta()

  const drogueriaNombre = isSuperAdmin
    ? profile?.drogueria?.nombre || 'TechPharmacy Plataforma'
    : profile?.drogueria?.nombre || 'TechPharmacy'
  const userName = profile?.full_name || session?.user?.email || 'Usuario'

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden md:flex flex-shrink-0 border-r border-border">
        <Sidebar
          role={userRole}
          drogueriaNombre={drogueriaNombre}
          hasActiveTenant={hasActiveTenant}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 border-b border-border bg-white/80 backdrop-blur-md flex items-center justify-between px-4 md:px-8 z-20 shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <MobileNav
              role={userRole}
              drogueriaNombre={drogueriaNombre}
              hasActiveTenant={hasActiveTenant}
            />
            <span className="md:hidden font-black text-slate-900 text-base truncate">
              {drogueriaNombre}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 ml-auto">
            {isSuperAdmin && (
              <Link
                href="/droguerias"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black border bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 transition-colors"
              >
                <Globe className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Consola SuperAdmin</span>
              </Link>
            )}
            {(!isSuperAdmin || hasActiveTenant) && (
              <Link
                href="/facturas"
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black border transition-colors ${
                  cajaAbierta
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                    : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                }`}
              >
                <Wallet className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">
                  {cajaAbierta ? 'Caja Abierta' : 'Caja Cerrada'}
                </span>
              </Link>
            )}

            <Link
              href="/configuracion"
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100/80 hover:bg-slate-200/70 transition-colors border border-slate-200/60"
            >
              <div
                className={`h-6 w-6 rounded-full text-white flex items-center justify-center text-xs font-black ${
                  isSuperAdmin ? 'bg-indigo-600' : 'bg-emerald-600'
                }`}
              >
                {userName.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs font-bold text-slate-800 max-w-[140px] truncate hidden sm:inline">
                {userName}
              </span>
              <span
                className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  isSuperAdmin
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                {isSuperAdmin ? (
                  <ShieldCheck className="h-2.5 w-2.5 text-indigo-600" />
                ) : userRole === 'admin' ? (
                  <Shield className="h-2.5 w-2.5 text-purple-600" />
                ) : (
                  <User className="h-2.5 w-2.5 text-blue-600" />
                )}
                {userRole}
              </span>
            </Link>
          </div>
        </header>

        <main className="flex-1 relative overflow-y-auto focus:outline-none p-4 md:p-8 bg-slate-50/50">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
      <Toaster position="top-right" richColors theme="light" />
    </div>
  )
}
