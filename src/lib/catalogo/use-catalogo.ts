'use client'

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { getTodayLocalIsoDate } from '@/lib/inventario/fraccionamiento'
import {
  aFilaInventario,
  aFilaPOS,
  ordenarPorNombre,
  type CatalogoItem,
  type FilaInventario,
  type FilaPOS,
} from './modelo'
import {
  iniciarCatalogo,
  obtenerCatalogo,
  obtenerCatalogoServidor,
  sincronizarCatalogo,
  suscribirCatalogo,
  type EstadoCatalogo,
} from './store'

/** Al volver a la pestaña solo se sincroniza si pasó al menos este tiempo. */
const MIN_ENTRE_SYNC_MS = 60_000
/** Con la pestaña visible, se revisan cambios de otras cajas cada 5 minutos. */
const INTERVALO_SYNC_MS = 5 * 60_000

export interface CatalogoHook extends EstadoCatalogo {
  sincronizar: (opciones?: { completo?: boolean }) => Promise<void>
}

export function useCatalogo(drogueriaId: string | null): CatalogoHook {
  const estado = useSyncExternalStore(suscribirCatalogo, obtenerCatalogo, obtenerCatalogoServidor)

  useEffect(() => {
    if (!drogueriaId) return
    void iniciarCatalogo(drogueriaId)

    const alVolver = () => {
      if (document.visibilityState !== 'visible') return
      const ultima = obtenerCatalogo().ultimaSync
      if (!ultima || Date.now() - ultima >= MIN_ENTRE_SYNC_MS) void sincronizarCatalogo()
    }
    const intervalo = window.setInterval(() => {
      if (document.visibilityState === 'visible') void sincronizarCatalogo()
    }, INTERVALO_SYNC_MS)

    document.addEventListener('visibilitychange', alVolver)
    window.addEventListener('focus', alVolver)
    return () => {
      window.clearInterval(intervalo)
      document.removeEventListener('visibilitychange', alVolver)
      window.removeEventListener('focus', alVolver)
    }
  }, [drogueriaId])

  const propio = estado.drogueriaId === drogueriaId ? estado : obtenerCatalogoServidor()
  return { ...propio, sincronizar: sincronizarCatalogo }
}

// Las filas derivadas se reutilizan mientras el producto no cambie (mismo objeto)
// y el día sea el mismo: un delta de 2 productos no recalcula los 3.000.
const cacheInventario = new WeakMap<CatalogoItem, { hoy: string; fila: FilaInventario }>()
const cachePOS = new WeakMap<CatalogoItem, { hoy: string; fila: FilaPOS }>()

function derivar<F>(
  items: ReadonlyMap<string, CatalogoItem>,
  hoy: string,
  cache: WeakMap<CatalogoItem, { hoy: string; fila: F }>,
  crear: (item: CatalogoItem, hoy: string) => F
): F[] {
  const filas: F[] = []
  for (const item of items.values()) {
    const previa = cache.get(item)
    if (previa && previa.hoy === hoy) {
      filas.push(previa.fila)
      continue
    }
    const fila = crear(item, hoy)
    cache.set(item, { hoy, fila })
    filas.push(fila)
  }
  return filas
}

export function useFilasInventario(items: ReadonlyMap<string, CatalogoItem>): FilaInventario[] {
  const hoy = getTodayLocalIsoDate()
  return useMemo(
    () => ordenarPorNombre(derivar(items, hoy, cacheInventario, aFilaInventario)),
    [items, hoy]
  )
}

export function useFilasPOS(items: ReadonlyMap<string, CatalogoItem>): FilaPOS[] {
  const hoy = getTodayLocalIsoDate()
  return useMemo(() => ordenarPorNombre(derivar(items, hoy, cachePOS, aFilaPOS)), [items, hoy])
}
