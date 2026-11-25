import { getInventarioPOS, getVendedores, getCartera } from '@/app/actions/facturas'
import { getSesionCajaAbierta } from '@/app/actions/caja'
import { getCurrentUserWithProfile } from '@/lib/auth/session'
import { FacturacionClient } from './facturacion-client'

export const dynamic = 'force-dynamic'

export default async function FacturacionPage() {
  const [inventario, vendedores, cajaAbierta, cartera, session] = await Promise.all([
    getInventarioPOS(),
    getVendedores(),
    getSesionCajaAbierta(),
    getCartera(),
    getCurrentUserWithProfile(),
  ])

  return (
    <FacturacionClient
      inventarioInitial={inventario}
      vendedores={vendedores}
      cajaAbierta={cajaAbierta}
      carteraInitial={cartera}
      userRole={session?.profile?.role || 'vendedor'}
      prefijoFactura={session?.profile?.drogueria?.prefijo_factura || null}
    />
  )
}
