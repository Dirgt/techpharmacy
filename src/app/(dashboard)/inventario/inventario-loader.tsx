'use client'

import { EstadoCatalogo } from '@/components/catalogo/estado-catalogo'
import { useCatalogo, useFilasInventario } from '@/lib/catalogo/use-catalogo'
import InventarioClient from './inventario-client'

type InventarioClientProps = Parameters<typeof InventarioClient>[0]

export function InventarioLoader({
  drogueriaId,
  laboratorios,
}: {
  drogueriaId: string | null
  laboratorios: InventarioClientProps['laboratorios']
}) {
  const catalogo = useCatalogo(drogueriaId)
  const filas = useFilasInventario(catalogo.items)

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <EstadoCatalogo catalogo={catalogo} />
      </div>
      <InventarioClient
        initialData={filas}
        laboratorios={laboratorios}
        // Tras guardar, importar o dar de baja se traen solo los productos que cambiaron.
        onDatosCambiados={() => void catalogo.sincronizar()}
      />
    </div>
  )
}
