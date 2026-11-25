import { getInventarioPOS, getVendedores, getCartera } from '@/app/actions/facturas'
import { getSesionCajaAbierta } from '@/app/actions/caja'
import { FacturacionClient } from './facturacion-client'

export const dynamic = 'force-dynamic'

export default async function FacturacionPage() {
  const [inventario, vendedores, cajaAbierta, cartera] = await Promise.all([
    getInventarioPOS(),
    getVendedores(),
    getSesionCajaAbierta(),
    getCartera(),
  ])

  return (
    <FacturacionClient
      inventarioInitial={inventario}
      vendedores={vendedores}
      cajaAbierta={cajaAbierta}
      carteraInitial={cartera}
    />
  )
}
