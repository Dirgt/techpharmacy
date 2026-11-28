import { getVendedores } from '@/app/actions/facturas'
import { getSesionCajaAbierta } from '@/app/actions/caja'
import { getCurrentUserWithProfile } from '@/lib/auth/session'
import { FacturacionLoader } from './facturacion-loader'

export const dynamic = 'force-dynamic'

// El catálogo no se descarga aquí: el navegador lo guarda en IndexedDB y solo
// pide los productos que cambiaron (ver src/lib/catalogo). Esta página envía
// unos pocos KB aunque la droguería tenga miles de productos.
export default async function FacturacionPage() {
  const [vendedores, cajaAbierta, session] = await Promise.all([
    getVendedores(),
    getSesionCajaAbierta(),
    getCurrentUserWithProfile(),
  ])

  return (
    <FacturacionLoader
      drogueriaId={session?.profile?.drogueria_id ?? null}
      vendedores={vendedores}
      cajaAbierta={cajaAbierta}
      userRole={session?.profile?.role || 'vendedor'}
      prefijoFactura={session?.profile?.drogueria?.prefijo_factura || null}
    />
  )
}
