import { redirect } from 'next/navigation'
import { ShieldAlert, LogOut, CalendarX2 } from 'lucide-react'
import { getCurrentUserWithProfile } from '@/lib/auth/session'
import { isTenantSuspended } from '@/lib/tenant/domain'
import { logout } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'

export const dynamic = 'force-dynamic'

export default async function SuspendidoPage() {
  const session = await getCurrentUserWithProfile()
  if (!session || !session.profile) {
    redirect('/login')
  }

  if (session.profile.role === 'superadmin') {
    redirect('/droguerias')
  }

  const drogueria = session.profile.drogueria
  const suspension = isTenantSuspended(drogueria)

  if (!suspension.suspended) {
    redirect('/dashboard')
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-emerald-50 via-teal-50/80 to-sky-100 flex items-center justify-center p-6">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-emerald-300/30 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-sky-300/30 blur-3xl" />
      </div>

      <div className="relative z-10 max-w-md w-full bg-white/95 backdrop-blur-xl border border-emerald-100 ring-1 ring-slate-200/60 rounded-3xl p-8 text-center shadow-2xl shadow-emerald-900/10 space-y-6">
        <div
          className={`mx-auto w-16 h-16 rounded-2xl border flex items-center justify-center ${
            suspension.expired
              ? 'bg-amber-50 border-amber-200'
              : 'bg-rose-50 border-rose-200'
          }`}
        >
          {suspension.expired ? (
            <CalendarX2 className="h-8 w-8 text-amber-600" />
          ) : (
            <ShieldAlert className="h-8 w-8 text-rose-600" />
          )}
        </div>

        <div className="space-y-2">
          <p
            className={`text-xs font-black uppercase tracking-widest ${
              suspension.expired ? 'text-amber-600' : 'text-rose-600'
            }`}
          >
            {suspension.expired ? 'Suscripción Vencida' : 'Servicio Suspendido'}
          </p>
          <h1 className="text-2xl font-black text-slate-900">
            {drogueria?.nombre || 'Tu Droguería'}
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            {suspension.reason ||
              'El acceso operativo de esta sede se encuentra temporalmente restringido.'}
          </p>
        </div>

        <div className="rounded-2xl bg-emerald-50/70 border border-emerald-200/80 p-4 text-xs text-emerald-900 leading-relaxed">
          Tus datos, inventario e historial de facturación están seguros. Comunícate con el
          administrador de la plataforma TechPharmacy para reactivar el servicio.
        </div>

        <form action={logout}>
          <Button
            type="submit"
            variant="outline"
            className="w-full border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold py-5 rounded-xl shadow-sm"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Cerrar Sesión
          </Button>
        </form>
      </div>
    </div>
  )
}
