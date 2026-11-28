import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/session'
import { getCompras, getProveedores } from '@/app/actions/tesoreria'
import { getSesionCajaAbierta } from '@/app/actions/caja'
import { ComprasLoader } from './compras-loader'

export default async function ComprasPage() {
  const auth = await requireAdmin()
  if (!auth.ok) redirect('/dashboard')

  // Productos, costos y stock salen del catálogo local del navegador; aquí solo
  // viajan las compras recientes/pendientes y los proveedores.
  const [comprasRes, proveedoresRes, cajaRes] = await Promise.all([
    getCompras(),
    getProveedores(),
    getSesionCajaAbierta(),
  ])

  const compras = comprasRes.success && comprasRes.data ? comprasRes.data : []
  const proveedores = proveedoresRes.success && proveedoresRes.data ? proveedoresRes.data : []

  return (
    <ComprasLoader
      drogueriaId={auth.profile.drogueria_id}
      initialData={compras}
      proveedores={proveedores}
      caja={cajaRes}
      drogueria={auth.profile.drogueria}
      historialDesde={comprasRes.success ? (comprasRes.desde ?? null) : null}
    />
  )
}
