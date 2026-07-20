import { getCompras, getProveedores } from '@/app/actions/tesoreria'
import { getProductos } from '@/app/actions/inventario'
import { getSesionCajaAbierta } from '@/app/actions/caja'
import ComprasClient from './compras-client'

export default async function ComprasPage() {
  const [comprasRes, proveedoresRes, productosRes, cajaRes] = await Promise.all([
    getCompras(),
    getProveedores(),
    getProductos(),
    getSesionCajaAbierta()
  ])

  const compras = comprasRes.success && comprasRes.data ? comprasRes.data : []
  const proveedores = proveedoresRes.success && proveedoresRes.data ? proveedoresRes.data : []
  const productos = productosRes.success && productosRes.data ? productosRes.data : []
  const caja = cajaRes

  return (
    <div className="p-6">
      <ComprasClient 
        initialData={compras} 
        proveedores={proveedores} 
        productos={productos}
        caja={caja}
      />
    </div>
  )
}
