import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/session'
import { getCompras, getProveedores } from '@/app/actions/tesoreria'
import { getInventario, getProductos } from '@/app/actions/inventario'
import { getSesionCajaAbierta } from '@/app/actions/caja'
import ComprasClient from './compras-client'

export default async function ComprasPage() {
  const auth = await requireAdmin()
  if (!auth.ok) redirect('/dashboard')

  const [comprasRes, proveedoresRes, productosRes, cajaRes, inventarioRes] = await Promise.all([
    getCompras(),
    getProveedores(),
    getProductos(),
    getSesionCajaAbierta(),
    getInventario(),
  ])

  const compras = comprasRes.success && comprasRes.data ? comprasRes.data : []
  const proveedores = proveedoresRes.success && proveedoresRes.data ? proveedoresRes.data : []
  const productos = productosRes.success && productosRes.data ? productosRes.data : []

  return (
    <ComprasClient
      initialData={compras}
      proveedores={proveedores}
      productos={productos}
      caja={cajaRes}
      inventario={inventarioRes}
      drogueria={auth.profile.drogueria}
    />
  )
}
