import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/session'
import { getProveedores } from '@/app/actions/tesoreria'
import ProveedoresClient from './proveedores-client'

export default async function ProveedoresPage() {
  const auth = await requireAdmin()
  if (!auth.ok) redirect('/dashboard')

  const supabase = await createClient()

  const [proveedoresRes, comprasRes] = await Promise.all([
    getProveedores(),
    supabase
      .from('compras')
      .select('id, proveedor_id, numero_factura, total, estado_pago, metodo_pago, created_at')
      .order('created_at', { ascending: false }),
  ])

  const proveedores = proveedoresRes.success && proveedoresRes.data ? proveedoresRes.data : []
  const compras = comprasRes.data || []

  return (
    <ProveedoresClient
      initialData={proveedores}
      compras={compras}
      drogueriaNombre={auth.profile.drogueria?.nombre || 'TechPharmacy'}
    />
  )
}
