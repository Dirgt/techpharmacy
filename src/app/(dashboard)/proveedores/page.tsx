import { getProveedores } from '@/app/actions/tesoreria'
import ProveedoresClient from './proveedores-client'
import { Database } from '@/lib/supabase/database.types'

export default async function ProveedoresPage() {
  const res = await getProveedores()
  const proveedores = res.success && res.data ? res.data : []

  return (
    <div className="p-6">
      <ProveedoresClient initialData={proveedores} />
    </div>
  )
}
