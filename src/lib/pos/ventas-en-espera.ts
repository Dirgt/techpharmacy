/**
 * Ventas en espera del POS: el carrito se guarda en este equipo (localStorage)
 * para atender a otro cliente y retomarlo después. No viaja a la base de datos.
 * Funciones puras sobre un "almacén" inyectable para poder probarlas.
 */

export const MAX_VENTAS_EN_ESPERA = 10
const PREFIJO = 'techpharmacy:ventas-en-espera:'

export interface ItemEnEspera {
  producto_id: string
  nombre: string
  cantidad_cajas: number
  cantidad_blisters: number
  cantidad_unidades: number
  precio_unitario_base: number
  descuento_porcentaje: number
  precio_linea: number
  precio_linea_original: number
  iva_porcentaje: number
}

export interface VentaEnEspera {
  id: string
  creada: string
  etiqueta: string
  items: ItemEnEspera[]
  cliente: Record<string, unknown> | null
  descuentoPct: number
  tipoVenta: 'contado' | 'credito'
  condicionPagoDias: number
  ordenCompra: string
}

type Almacen = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export const claveVentasEnEspera = (drogueriaId: string) => `${PREFIJO}${drogueriaId}`

function esItem(v: unknown): v is ItemEnEspera {
  const i = v as ItemEnEspera
  return (
    !!i &&
    typeof i.producto_id === 'string' &&
    typeof i.nombre === 'string' &&
    [i.cantidad_cajas, i.cantidad_blisters, i.cantidad_unidades].every((n) => Number.isInteger(n) && n >= 0)
  )
}

function esVenta(v: unknown): v is VentaEnEspera {
  const s = v as VentaEnEspera
  return (
    !!s &&
    typeof s.id === 'string' &&
    typeof s.creada === 'string' &&
    Array.isArray(s.items) &&
    s.items.length > 0 &&
    s.items.every(esItem) &&
    (s.tipoVenta === 'contado' || s.tipoVenta === 'credito')
  )
}

/** Lee la lista; cualquier dato dañado se descarta sin romper el POS. */
export function leerVentasEnEspera(almacen: Almacen, drogueriaId: string): VentaEnEspera[] {
  try {
    const crudo = almacen.getItem(claveVentasEnEspera(drogueriaId))
    if (!crudo) return []
    const lista = JSON.parse(crudo)
    return Array.isArray(lista) ? lista.filter(esVenta).slice(0, MAX_VENTAS_EN_ESPERA) : []
  } catch {
    return []
  }
}

export function guardarVentasEnEspera(almacen: Almacen, drogueriaId: string, lista: VentaEnEspera[]) {
  try {
    if (lista.length === 0) almacen.removeItem(claveVentasEnEspera(drogueriaId))
    else almacen.setItem(claveVentasEnEspera(drogueriaId), JSON.stringify(lista))
  } catch {
    // Almacenamiento lleno o bloqueado: la venta sigue en pantalla.
  }
}

/** Agrega al inicio. Devuelve null si ya hay el máximo permitido. */
export function agregarVentaEnEspera(lista: VentaEnEspera[], venta: VentaEnEspera): VentaEnEspera[] | null {
  if (lista.length >= MAX_VENTAS_EN_ESPERA) return null
  return [venta, ...lista.filter((v) => v.id !== venta.id)]
}

export function quitarVentaEnEspera(lista: VentaEnEspera[], id: string): VentaEnEspera[] {
  return lista.filter((v) => v.id !== id)
}

/** Nombre corto para la lista: cliente o el primer producto. */
export function etiquetaVentaEnEspera(clienteNombre: string | null | undefined, items: ItemEnEspera[]): string {
  const cliente = (clienteNombre || '').trim()
  if (cliente && cliente.toLowerCase() !== 'consumidor final') return cliente
  const primero = items[0]?.nombre || 'Venta'
  return items.length > 1 ? `${primero} y ${items.length - 1} más` : primero
}

/** Al cerrar sesión: no deja carritos (con datos de clientes) en el equipo. */
export function borrarTodasLasVentasEnEspera(almacen: Pick<Storage, 'length' | 'key' | 'removeItem'>) {
  try {
    const claves: string[] = []
    for (let i = 0; i < almacen.length; i++) {
      const k = almacen.key(i)
      if (k && k.startsWith(PREFIJO)) claves.push(k)
    }
    claves.forEach((k) => almacen.removeItem(k))
  } catch {
    // Sin acceso al almacenamiento: no hay nada que borrar.
  }
}
