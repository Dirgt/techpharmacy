'use client'

import { useMemo } from 'react'
import { useCatalogo } from '@/lib/catalogo/use-catalogo'
import ComprasClient from './compras-client'

type ComprasClientProps = Parameters<typeof ComprasClient>[0]

const colador = new Intl.Collator('es', { sensitivity: 'base' })

export function ComprasLoader({
  drogueriaId,
  ...props
}: Omit<ComprasClientProps, 'productos' | 'inventario' | 'onCatalogoCambiado'> & {
  drogueriaId: string | null
}) {
  const catalogo = useCatalogo(drogueriaId)

  const { productos, inventario } = useMemo(() => {
    const items = Array.from(catalogo.items.values())
    return {
      productos: items
        .map((item) => ({
          id: item.producto_id,
          codigo: item.codigo,
          nombre: item.nombre_producto,
          principio_activo: item.principio_activo,
        }))
        .sort((a, b) => colador.compare(a.nombre, b.nombre) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      inventario: items.map((item) => ({
        producto_id: item.producto_id,
        precio_caja: item.precio_caja,
        cajas: item.cajas,
      })),
    }
  }, [catalogo.items])

  return (
    <ComprasClient
      {...props}
      productos={productos}
      inventario={inventario}
      onCatalogoCambiado={() => void catalogo.sincronizar()}
    />
  )
}
