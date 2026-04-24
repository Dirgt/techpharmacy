import { getInventarioPOS, getVendedores } from '@/app/actions/facturas'
import { getSesionCajaAbierta } from '@/app/actions/caja'
import { FacturacionClient } from './facturacion-client'

export const dynamic = 'force-dynamic'

export default async function FacturacionPage() {
  const inventario = await getInventarioPOS()
  const vendedores = await getVendedores()
  const cajaAbierta = await getSesionCajaAbierta()

  return <FacturacionClient 
    inventarioInitial={inventario} 
    vendedores={vendedores}
    cajaAbierta={cajaAbierta}
  />
}
