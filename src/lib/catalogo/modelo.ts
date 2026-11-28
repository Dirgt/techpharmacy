/**
 * Modelo del catálogo local (inventario + lotes) que el navegador guarda en
 * IndexedDB y mantiene al día con la RPC catalogo_sync.
 *
 * Funciones puras: sin React, sin Supabase y con imports relativos .ts para que
 * las pruebas de node:test puedan cargarlas directamente.
 */
import {
  computeSellableStockFromLots,
  type NormalizedLoteStock,
} from '../inventario/fraccionamiento.ts'

export interface CatalogoLote {
  id: string
  lote: string | null
  fecha_vencimiento: string | null
  cajas: number
  blisters: number
  unidades: number
  costo_caja: number | null
  created_at: string | null
}

export interface CatalogoItem {
  inventario_id: string
  producto_id: string
  codigo: string
  nombre_producto: string
  principio_activo: string | null
  laboratorio_id: string | null
  laboratorio: string | null
  cajas: number
  blisters: number
  unidades: number
  stock_minimo: number | null
  precio_caja: number | null
  precio_blister: number | null
  precio_unidad: number | null
  margen_caja: number | null
  margen_blister: number | null
  margen_unidad: number | null
  fecha_vencimiento: string | null
  lote: string | null
  registro_invima: string | null
  seccion: string | null
  ubicacion: string | null
  blisters_por_caja: number | null
  unidades_por_blister: number | null
  updated_at: string | null
  iva_porcentaje: number
  requiere_formula: boolean
  /** El producto tiene filas en inventario_lotes (aunque estén en cero). */
  tiene_lotes: boolean
  /** Solo lotes con stock, en orden FEFO. */
  lotes: CatalogoLote[]
}

export interface RespuestaCatalogo {
  corte: string
  completo: boolean
  total: number
  items: CatalogoItem[]
}

const COLUMNAS_ITEM = [
  'inventario_id', 'producto_id', 'codigo', 'nombre_producto', 'principio_activo',
  'laboratorio_id', 'laboratorio', 'cajas', 'blisters', 'unidades', 'stock_minimo',
  'precio_caja', 'precio_blister', 'precio_unidad', 'margen_caja', 'margen_blister',
  'margen_unidad', 'fecha_vencimiento', 'lote', 'registro_invima', 'seccion', 'ubicacion',
  'blisters_por_caja', 'unidades_por_blister', 'updated_at', 'iva_porcentaje',
  'requiere_formula', 'tiene_lotes', 'lotes',
] as const

const COLUMNAS_LOTE = [
  'id', 'lote', 'fecha_vencimiento', 'cajas', 'blisters', 'unidades', 'costo_caja', 'created_at',
] as const

type ColItem = (typeof COLUMNAS_ITEM)[number]
type ColLote = (typeof COLUMNAS_LOTE)[number]

function indices<T extends string>(cols: unknown, requeridas: readonly T[]): Record<T, number> {
  if (!Array.isArray(cols)) throw new Error('Formato de catálogo no reconocido')
  const mapa = {} as Record<T, number>
  for (const nombre of requeridas) {
    const i = cols.indexOf(nombre)
    if (i < 0) throw new Error(`Formato de catálogo no reconocido (falta ${nombre})`)
    mapa[nombre] = i
  }
  return mapa
}

const texto = (v: unknown): string | null => (v === null || v === undefined ? null : String(v))
const numeroONulo = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const entero = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Convierte la respuesta compacta (tuplas + nombres de columna) en objetos. */
export function decodificarCatalogo(raw: unknown): RespuestaCatalogo {
  if (!raw || typeof raw !== 'object') throw new Error('Respuesta de catálogo vacía')
  const r = raw as Record<string, unknown>
  if (typeof r.corte !== 'string' || !Array.isArray(r.items)) {
    throw new Error('Formato de catálogo no reconocido')
  }

  const ci = indices<ColItem>(r.cols, COLUMNAS_ITEM)
  const cl = indices<ColLote>(r.lcols, COLUMNAS_LOTE)

  const items: CatalogoItem[] = (r.items as unknown[]).map((tupla) => {
    if (!Array.isArray(tupla)) throw new Error('Formato de catálogo no reconocido')
    const lotesRaw = Array.isArray(tupla[ci.lotes]) ? (tupla[ci.lotes] as unknown[]) : []
    return {
      inventario_id: String(tupla[ci.inventario_id]),
      producto_id: String(tupla[ci.producto_id]),
      codigo: String(tupla[ci.codigo] ?? ''),
      nombre_producto: String(tupla[ci.nombre_producto] ?? ''),
      principio_activo: texto(tupla[ci.principio_activo]),
      laboratorio_id: texto(tupla[ci.laboratorio_id]),
      laboratorio: texto(tupla[ci.laboratorio]),
      cajas: entero(tupla[ci.cajas]),
      blisters: entero(tupla[ci.blisters]),
      unidades: entero(tupla[ci.unidades]),
      stock_minimo: numeroONulo(tupla[ci.stock_minimo]),
      precio_caja: numeroONulo(tupla[ci.precio_caja]),
      precio_blister: numeroONulo(tupla[ci.precio_blister]),
      precio_unidad: numeroONulo(tupla[ci.precio_unidad]),
      margen_caja: numeroONulo(tupla[ci.margen_caja]),
      margen_blister: numeroONulo(tupla[ci.margen_blister]),
      margen_unidad: numeroONulo(tupla[ci.margen_unidad]),
      fecha_vencimiento: texto(tupla[ci.fecha_vencimiento]),
      lote: texto(tupla[ci.lote]),
      registro_invima: texto(tupla[ci.registro_invima]),
      seccion: texto(tupla[ci.seccion]),
      ubicacion: texto(tupla[ci.ubicacion]),
      blisters_por_caja: numeroONulo(tupla[ci.blisters_por_caja]),
      unidades_por_blister: numeroONulo(tupla[ci.unidades_por_blister]),
      updated_at: texto(tupla[ci.updated_at]),
      iva_porcentaje: entero(tupla[ci.iva_porcentaje]),
      requiere_formula: Boolean(tupla[ci.requiere_formula]),
      tiene_lotes: Boolean(tupla[ci.tiene_lotes]),
      lotes: lotesRaw.map((l) => {
        if (!Array.isArray(l)) throw new Error('Formato de catálogo no reconocido')
        return {
          id: String(l[cl.id]),
          lote: texto(l[cl.lote]),
          fecha_vencimiento: texto(l[cl.fecha_vencimiento]),
          cajas: entero(l[cl.cajas]),
          blisters: entero(l[cl.blisters]),
          unidades: entero(l[cl.unidades]),
          costo_caja: numeroONulo(l[cl.costo_caja]),
          created_at: texto(l[cl.created_at]),
        }
      }),
    }
  })

  return {
    corte: r.corte,
    completo: Boolean(r.completo),
    total: entero(r.total),
    items,
  }
}

function mismoItem(a: CatalogoItem, b: CatalogoItem): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Aplica una respuesta al catálogo en memoria. Un delta reemplaza cada producto
 * recibido completo (incluidos sus lotes). Si no cambió nada devuelve el mismo
 * Map, para que la interfaz no se vuelva a calcular.
 * `consistente` es falso cuando el número de productos no coincide con el del
 * servidor (hubo borrados): el llamador debe pedir el catálogo completo.
 */
export function fusionarCatalogo(
  actual: ReadonlyMap<string, CatalogoItem> | null,
  respuesta: RespuestaCatalogo
): { items: ReadonlyMap<string, CatalogoItem>; cambiados: number; consistente: boolean } {
  if (respuesta.completo || !actual) {
    const items = new Map(respuesta.items.map((item) => [item.inventario_id, item]))
    return { items, cambiados: items.size, consistente: items.size === respuesta.total }
  }

  let siguiente: Map<string, CatalogoItem> | null = null
  let cambiados = 0
  for (const item of respuesta.items) {
    const previo = actual.get(item.inventario_id)
    if (previo && mismoItem(previo, item)) continue
    if (!siguiente) siguiente = new Map(actual)
    siguiente.set(item.inventario_id, item)
    cambiados++
  }

  const items = siguiente ?? actual
  return { items, cambiados, consistente: items.size === respuesta.total }
}

/** Fila con la misma forma que devolvía getInventario() (stock físico + lotes). */
export interface FilaInventario {
  inventario_id: string
  producto_id: string
  codigo: string
  nombre_producto: string
  principio_activo: string | null
  laboratorio: string | null
  laboratorio_id: string | null
  cajas: number
  blisters: number
  unidades: number
  stock_minimo: number | null
  precio_caja: number | null
  precio_blister: number | null
  precio_unidad: number | null
  margen_caja: number | null
  margen_blister: number | null
  margen_unidad: number | null
  fecha_vencimiento: string | null
  lote: string | null
  registro_invima: string | null
  seccion: string | null
  ubicacion: string | null
  updated_at: string | null
  actualizado_por: string | null
  blisters_por_caja: number | null
  unidades_por_blister: number | null
  requiere_formula: boolean
  iva_porcentaje: number
  lotes_activos: NormalizedLoteStock[]
  tiene_stock_vencido: boolean
  todo_vencido: boolean
}

/** Fila del POS: igual que getInventarioPOS(), con el stock vendible (lotes vigentes). */
export interface FilaPOS extends FilaInventario {
  cajas_fisicas: number
  blisters_fisicos: number
  unidades_fisicas: number
  /** Texto en minúsculas para la búsqueda del POS (nombre, código, laboratorio, molécula, sección). */
  busqueda: string
}

function resumenLotes(item: CatalogoItem, hoy: string) {
  // Sin filas de lotes (inventario antiguo) la fila de inventario cuenta como lote único,
  // igual que en el servidor. Con lotes, solo cuentan los lotes.
  return computeSellableStockFromLots(
    item.lotes,
    item.tiene_lotes
      ? null
      : {
          lote: item.lote,
          fecha_vencimiento: item.fecha_vencimiento,
          cajas: item.cajas,
          blisters: item.blisters,
          unidades: item.unidades,
          precio_caja: item.precio_caja,
        },
    hoy
  )
}

function filaBase(item: CatalogoItem) {
  return {
    inventario_id: item.inventario_id,
    producto_id: item.producto_id,
    codigo: item.codigo,
    nombre_producto: item.nombre_producto,
    principio_activo: item.principio_activo,
    laboratorio: item.laboratorio,
    laboratorio_id: item.laboratorio_id,
    stock_minimo: item.stock_minimo,
    precio_caja: item.precio_caja,
    precio_blister: item.precio_blister,
    precio_unidad: item.precio_unidad,
    margen_caja: item.margen_caja,
    margen_blister: item.margen_blister,
    margen_unidad: item.margen_unidad,
    fecha_vencimiento: item.fecha_vencimiento,
    lote: item.lote,
    registro_invima: item.registro_invima,
    seccion: item.seccion,
    ubicacion: item.ubicacion,
    updated_at: item.updated_at,
    actualizado_por: null,
    blisters_por_caja: item.blisters_por_caja,
    unidades_por_blister: item.unidades_por_blister,
    requiere_formula: item.requiere_formula,
    iva_porcentaje: item.iva_porcentaje,
  }
}

export function aFilaInventario(item: CatalogoItem, hoy: string): FilaInventario {
  const resumen = resumenLotes(item, hoy)
  return {
    ...filaBase(item),
    cajas: item.cajas,
    blisters: item.blisters,
    unidades: item.unidades,
    lotes_activos: resumen.lotes_ordenados,
    tiene_stock_vencido: resumen.tiene_stock_vencido,
    todo_vencido: resumen.todo_vencido,
  }
}

export function aFilaPOS(item: CatalogoItem, hoy: string): FilaPOS {
  const resumen = resumenLotes(item, hoy)
  return {
    ...filaBase(item),
    cajas: resumen.cajas,
    blisters: resumen.blisters,
    unidades: resumen.unidades,
    cajas_fisicas: resumen.cajas_fisicas,
    blisters_fisicos: resumen.blisters_fisicos,
    unidades_fisicas: resumen.unidades_fisicas,
    lotes_activos: resumen.lotes_ordenados,
    tiene_stock_vencido: resumen.tiene_stock_vencido,
    todo_vencido: resumen.todo_vencido,
    busqueda: [item.nombre_producto, item.codigo, item.laboratorio, item.principio_activo, item.seccion]
      .map((v) => (v || '').toLowerCase())
      .join('\u0001'),
  }
}

const colador = new Intl.Collator('es', { sensitivity: 'base' })

/** Orden por nombre (como la consulta anterior: nombre y luego id). */
export function ordenarPorNombre<T extends { nombre_producto: string; inventario_id: string }>(filas: T[]): T[] {
  return filas.sort(
    (a, b) =>
      colador.compare(a.nombre_producto, b.nombre_producto) ||
      (a.inventario_id < b.inventario_id ? -1 : a.inventario_id > b.inventario_id ? 1 : 0)
  )
}
