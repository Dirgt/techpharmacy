/**
 * Catálogo compartido por las pantallas del navegador (POS, inventario, compras).
 *
 * - Arranca desde la copia de IndexedDB (instantáneo, sin red).
 * - Se pone al día con catalogo_sync(p_desde): solo viajan los productos que
 *   cambiaron desde el último corte. La primera vez en un equipo baja todo.
 * - Las lecturas van directo del navegador a Supabase: no consumen Vercel.
 */
import { createClient } from '@/lib/supabase/client'
import { decodificarCatalogo, fusionarCatalogo, type CatalogoItem } from './modelo'
import { borrarCatalogosLocales, guardarCatalogoLocal, leerCatalogoLocal } from './almacen-local'

export interface EstadoCatalogo {
  drogueriaId: string | null
  items: ReadonlyMap<string, CatalogoItem>
  /** Sube cada vez que cambia el contenido. */
  version: number
  /** Hay datos para mostrar (de la copia local o de la red). */
  listo: boolean
  sincronizando: boolean
  error: string | null
  /** Date.now() de la última sincronización correcta. */
  ultimaSync: number | null
}

const VACIO: ReadonlyMap<string, CatalogoItem> = new Map()

const INICIAL: EstadoCatalogo = {
  drogueriaId: null,
  items: VACIO,
  version: 0,
  listo: false,
  sincronizando: false,
  error: null,
  ultimaSync: null,
}

let estado: EstadoCatalogo = INICIAL
let corte: string | null = null
let generacion = 0
let cargaLocal: Promise<void> | null = null
let enCurso: Promise<void> | null = null
let repetir = false
let pedirCompleto = false
let timerGuardado: ReturnType<typeof setTimeout> | null = null
let guardadoRegistrado = false
const oyentes = new Set<() => void>()

function emitir(cambios: Partial<EstadoCatalogo>) {
  estado = { ...estado, ...cambios }
  for (const oyente of oyentes) oyente()
}

export function suscribirCatalogo(oyente: () => void): () => void {
  oyentes.add(oyente)
  return () => {
    oyentes.delete(oyente)
  }
}

export function obtenerCatalogo(): EstadoCatalogo {
  return estado
}

export function obtenerCatalogoServidor(): EstadoCatalogo {
  return INICIAL
}

async function guardarAhora() {
  timerGuardado = null
  const { drogueriaId, items } = estado
  if (!drogueriaId || !corte) return
  await guardarCatalogoLocal(drogueriaId, { corte, items: Array.from(items.values()) })
}

function programarGuardado() {
  if (typeof window === 'undefined') return
  if (!guardadoRegistrado) {
    guardadoRegistrado = true
    // Si la pestaña se cierra con un guardado pendiente, se intenta en ese momento.
    window.addEventListener('pagehide', () => {
      if (timerGuardado) {
        clearTimeout(timerGuardado)
        void guardarAhora()
      }
    })
  }
  if (timerGuardado) clearTimeout(timerGuardado)
  timerGuardado = setTimeout(() => void guardarAhora(), 1500)
}

function mensajeError(error: { message?: string | null; code?: string | null }): string {
  if (!error.code) return 'Sin conexión: se muestra la última copia guardada del catálogo.'
  if (error.code === 'P0001' && error.message) return error.message
  return 'No se pudo actualizar el catálogo.'
}

async function ejecutarSincronizacion() {
  const gen = generacion
  if (cargaLocal) await cargaLocal
  if (gen !== generacion || !estado.drogueriaId) return

  const completo = pedirCompleto || !corte
  pedirCompleto = false
  emitir({ sincronizando: true })

  let data: unknown
  try {
    const supabase = createClient()
    const res = await supabase.rpc('catalogo_sync', completo ? {} : { p_desde: corte as string })
    if (gen !== generacion) return
    if (res.error) {
      emitir({ sincronizando: false, error: mensajeError(res.error) })
      return
    }
    data = res.data
  } catch {
    if (gen !== generacion) return
    emitir({ sincronizando: false, error: mensajeError({}) })
    return
  }

  let respuesta
  try {
    respuesta = decodificarCatalogo(data)
  } catch (error) {
    console.error('Catálogo con formato inesperado:', error)
    emitir({ sincronizando: false, error: 'No se pudo leer el catálogo.' })
    return
  }

  const { items, consistente } = fusionarCatalogo(completo ? null : estado.items, respuesta)
  corte = respuesta.corte

  // Con el delta el número de productos no cuadra: hubo borrados en el servidor.
  if (!consistente && !respuesta.completo) {
    pedirCompleto = true
    repetir = true
  }

  const cambio = items !== estado.items
  emitir({
    items,
    version: cambio ? estado.version + 1 : estado.version,
    listo: true,
    sincronizando: false,
    error: null,
    ultimaSync: Date.now(),
  })
  programarGuardado()
}

/**
 * Pone el catálogo al día. Las llamadas simultáneas comparten la misma petición
 * y, si llega una durante otra, se hace una vuelta más al terminar (para no
 * perder cambios confirmados mientras tanto).
 */
export function sincronizarCatalogo(opciones?: { completo?: boolean }): Promise<void> {
  if (!estado.drogueriaId) return Promise.resolve()
  if (opciones?.completo) pedirCompleto = true
  if (enCurso) {
    repetir = true
    return enCurso
  }
  enCurso = (async () => {
    try {
      do {
        repetir = false
        await ejecutarSincronizacion()
      } while (repetir)
    } finally {
      enCurso = null
    }
  })()
  return enCurso
}

/** Prepara el catálogo de la droguería y lo sincroniza (delta si ya hay copia). */
export function iniciarCatalogo(drogueriaId: string): Promise<void> {
  if (estado.drogueriaId === drogueriaId) return sincronizarCatalogo()

  generacion++
  const gen = generacion
  corte = null
  if (timerGuardado) {
    clearTimeout(timerGuardado)
    timerGuardado = null
  }
  emitir({ ...INICIAL, drogueriaId, version: estado.version + 1 })

  cargaLocal = (async () => {
    const local = await leerCatalogoLocal(drogueriaId)
    if (gen !== generacion || !local) return
    corte = local.corte
    emitir({
      items: new Map(local.items.map((item) => [item.inventario_id, item])),
      version: estado.version + 1,
      listo: true,
    })
  })().finally(() => {
    if (gen === generacion) cargaLocal = null
  })

  return sincronizarCatalogo()
}

/** Al cerrar sesión: vacía la memoria y borra la copia del equipo. */
export async function limpiarCatalogoLocal(): Promise<void> {
  generacion++
  corte = null
  cargaLocal = null
  pedirCompleto = false
  if (timerGuardado) {
    clearTimeout(timerGuardado)
    timerGuardado = null
  }
  emitir({ ...INICIAL, version: estado.version + 1 })
  await borrarCatalogosLocales()
}
