'use client'

import { useCatalogo, useFilasPOS } from '@/lib/catalogo/use-catalogo'
import { FacturacionClient } from './facturacion-client'

type FacturacionClientProps = Parameters<typeof FacturacionClient>[0]

export function FacturacionLoader({
  drogueriaId,
  ...props
}: Omit<FacturacionClientProps, 'inventario' | 'catalogo'> & { drogueriaId: string | null }) {
  const catalogo = useCatalogo(drogueriaId)
  const inventario = useFilasPOS(catalogo.items)

  return <FacturacionClient {...props} inventario={inventario} catalogo={catalogo} />
}
