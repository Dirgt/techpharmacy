/**
 * Copia local del catálogo en IndexedDB (una entrada por droguería).
 * Es solo caché: cualquier error se ignora y el catálogo se vuelve a pedir.
 */
import type { CatalogoItem } from './modelo'

const DB_NOMBRE = 'techpharmacy'
const DB_VERSION = 1
const STORE = 'catalogo'
/** Subir si cambia la forma de CatalogoItem: las copias viejas se descartan. */
const ESQUEMA = 1

export interface CatalogoGuardado {
  corte: string
  items: CatalogoItem[]
}

interface Registro extends CatalogoGuardado {
  esquema: number
  drogueriaId: string
  guardadoEn: number
}

let conexion: Promise<IDBDatabase | null> | null = null

function abrir(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  if (conexion) return conexion

  conexion = new Promise<IDBDatabase | null>((resolve) => {
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB_NOMBRE, DB_VERSION)
    } catch {
      resolve(null)
      return
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => {
      const db = req.result
      // Otra pestaña con una versión nueva pide cerrar: se suelta la conexión.
      db.onversionchange = () => {
        db.close()
        conexion = null
      }
      resolve(db)
    }
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })
  return conexion
}

function operar<T>(
  modo: IDBTransactionMode,
  accion: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T | null> {
  return abrir().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null)
        try {
          const tx = db.transaction(STORE, modo)
          const req = accion(tx.objectStore(STORE))
          tx.oncomplete = () => resolve((req.result as T) ?? null)
          tx.onerror = () => resolve(null)
          tx.onabort = () => resolve(null)
        } catch {
          resolve(null)
        }
      })
  )
}

export async function leerCatalogoLocal(drogueriaId: string): Promise<CatalogoGuardado | null> {
  const r = await operar<Registro>('readonly', (s) => s.get(drogueriaId) as IDBRequest<Registro>)
  if (
    !r ||
    r.esquema !== ESQUEMA ||
    r.drogueriaId !== drogueriaId ||
    typeof r.corte !== 'string' ||
    !Array.isArray(r.items)
  ) {
    return null
  }
  return { corte: r.corte, items: r.items }
}

export async function guardarCatalogoLocal(drogueriaId: string, datos: CatalogoGuardado): Promise<void> {
  const registro: Registro = {
    esquema: ESQUEMA,
    drogueriaId,
    guardadoEn: Date.now(),
    corte: datos.corte,
    items: datos.items,
  }
  await operar('readwrite', (s) => s.put(registro, drogueriaId))
}

/** Al cerrar sesión: no deja datos de la droguería en el equipo. */
export async function borrarCatalogosLocales(): Promise<void> {
  await operar('readwrite', (s) => s.clear())
}
