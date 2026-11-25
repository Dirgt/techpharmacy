import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/session'
import { getProveedores } from '@/app/actions/tesoreria'
import ProveedoresClient from './proveedores-client'

export default async function ProveedoresPage() {
  const auth = await requireAdmin()
  if (!auth.ok) redirect('/dashboard')
  const res = await getProveedores()
  const proveedores = res.success && res.data ? res.data : []

  return (
    <div className="p-6">
      <ProveedoresClient initialData={proveedores} />
    </div>
  )
}
