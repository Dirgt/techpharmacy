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
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-8 text-center shadow-2xl space-y-6">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
          {suspension.expired ? (
            <CalendarX2 className="h-8 w-8 text-amber-400" />
          ) : (
            <ShieldAlert className="h-8 w-8 text-rose-400" />
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-black uppercase tracking-widest text-amber-400">
            {suspension.expired ? 'Suscripción Vencida' : 'Servicio Suspendido'}
          </p>
          <h1 className="text-2xl font-black text-white">
            {drogueria?.nombre || 'Tu Droguería'}
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            {suspension.reason ||
              'El acceso operativo de esta sede se encuentra temporalmente restringido.'}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-950/70 border border-slate-800 p-4 text-xs text-slate-400">
          Tus datos, inventario e historial de facturación están seguros. Comunícate con el
          administrador de la plataforma TechPharmacy para reactivar el servicio.
        </div>

        <form action={logout}>
          <Button
            type="submit"
            variant="outline"
            className="w-full border-slate-700 bg-slate-800/60 hover:bg-slate-800 text-slate-200 font-bold py-5 rounded-xl"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Cerrar Sesión
          </Button>
        </form>
      </div>
    </div>
  )
}
