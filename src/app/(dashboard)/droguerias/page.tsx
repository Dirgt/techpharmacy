import { redirect } from 'next/navigation'
import { requireSuperAdmin } from '@/lib/auth/session'
import { getPlatformOverview } from '@/app/actions/superadmin'
import { DrogueriasClient } from './droguerias-client'

export const dynamic = 'force-dynamic'

export default async function DrogueriasPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const auth = await requireSuperAdmin()
  if (!auth.ok) redirect('/dashboard')

  const [res, params] = await Promise.all([getPlatformOverview(), searchParams])

  if (!res.success || !res.data) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700 font-bold">
          {res.error || 'No se pudo cargar la consola de plataforma.'}
        </div>
      </div>
    )
  }

  const initialTab =
    params.tab === 'usuarios'
      ? 'usuarios'
      : params.tab === 'apikeys'
        ? 'apikeys'
        : 'droguerias'

  return <DrogueriasClient initialData={res.data} initialTab={initialTab} />
}
