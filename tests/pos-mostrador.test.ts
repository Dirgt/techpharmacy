import test from 'node:test'
import assert from 'node:assert/strict'
import { buscarEnCatalogo, claveBusqueda, esCodigoDeBarras, normalizarTexto } from '../src/lib/catalogo/busqueda.ts'
import {
  MAX_VENTAS_EN_ESPERA,
  agregarVentaEnEspera,
  borrarTodasLasVentasEnEspera,
  claveVentasEnEspera,
  etiquetaVentaEnEspera,
  guardarVentasEnEspera,
  leerVentasEnEspera,
  quitarVentaEnEspera,
  type VentaEnEspera,
} from '../src/lib/pos/ventas-en-espera.ts'

function fila(codigo: string, nombre: string, extra: { lab?: string; molecula?: string; seccion?: string } = {}) {
  return {
    codigo,
    nombre_producto: nombre,
    busqueda: claveBusqueda([nombre, codigo, extra.lab, extra.molecula, extra.seccion]),
  }
}

const catalogo = [
  fila('7701', 'ACETAMINOFÉN 500 MG', { lab: 'Genfar', molecula: 'Acetaminofén' }),
  fila('7702', 'ADVIL MAX', { lab: 'Pfizer', molecula: 'Ibuprofeno' }),
  fila('7703', 'DOLEX FORTE', { lab: 'GSK', molecula: 'Acetaminofén + cafeína' }),
  fila('7707184160683', 'HIOSCINA N-BUTIL BROMURO 20MG/1ML', { lab: 'Biosano', seccion: 'Inyectables' }),
]

test('normalizarTexto quita tildes, mayúsculas y espacios de más', () => {
  assert.equal(normalizarTexto('  ACETAMINOFÉN   Ñandú  '), 'acetaminofen nandu')
  assert.equal(normalizarTexto(null), '')
})

test('la búsqueda ignora tildes y mayúsculas', () => {
  assert.deepEqual(buscarEnCatalogo(catalogo, 'acetaminofen').map((f) => f.codigo), ['7701', '7703'])
  assert.deepEqual(buscarEnCatalogo(catalogo, 'ACETAMINOFÉN').map((f) => f.codigo), ['7701', '7703'])
})

test('la búsqueda exige todas las palabras, en cualquier campo y orden', () => {
  assert.deepEqual(buscarEnCatalogo(catalogo, 'acet genfar').map((f) => f.codigo), ['7701'])
  assert.deepEqual(buscarEnCatalogo(catalogo, '500 acet').map((f) => f.codigo), ['7701'])
  assert.deepEqual(buscarEnCatalogo(catalogo, 'inyectables hioscina').map((f) => f.codigo), ['7707184160683'])
  assert.deepEqual(buscarEnCatalogo(catalogo, 'acet pfizer'), [])
})

test('la búsqueda prioriza código exacto y nombres que empiezan por la palabra', () => {
  // "dolex" está en el nombre de 7703; "acetaminofen" en la molécula de 7703 y el nombre de 7701.
  assert.deepEqual(buscarEnCatalogo(catalogo, 'acetaminofen').map((f) => f.codigo)[0], '7701')
  assert.deepEqual(buscarEnCatalogo(catalogo, '7702').map((f) => f.codigo), ['7702'])
  assert.equal(buscarEnCatalogo(catalogo, '').length, 0)
  assert.equal(buscarEnCatalogo(catalogo, 'a', 2).length, 2)
})

test('esCodigoDeBarras reconoce códigos y no nombres', () => {
  assert.equal(esCodigoDeBarras('7707184160683'), true)
  assert.equal(esCodigoDeBarras(' 770718 '), true)
  assert.equal(esCodigoDeBarras('77071'), false)
  assert.equal(esCodigoDeBarras('acet 500'), false)
})

function almacenFalso() {
  const datos = new Map<string, string>()
  return {
    datos,
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
    get length() {
      return datos.size
    },
    key: (i: number) => Array.from(datos.keys())[i] ?? null,
  }
}

function venta(id: string, nombre = 'ADVIL MAX'): VentaEnEspera {
  return {
    id,
    creada: '2026-11-28T15:00:00.000Z',
    etiqueta: nombre,
    items: [
      {
        producto_id: 'p-' + id,
        nombre,
        cantidad_cajas: 1,
        cantidad_blisters: 0,
        cantidad_unidades: 2,
        precio_unitario_base: 10000,
        descuento_porcentaje: 0,
        precio_linea: 10000,
        precio_linea_original: 10000,
        iva_porcentaje: 0,
      },
    ],
    cliente: null,
    descuentoPct: 0,
    tipoVenta: 'contado',
    condicionPagoDias: 0,
    ordenCompra: '',
  }
}

test('ventas en espera: guardar, leer por droguería y quitar', () => {
  const almacen = almacenFalso()
  let lista = agregarVentaEnEspera([], venta('a'))!
  lista = agregarVentaEnEspera(lista, venta('b'))!
  assert.deepEqual(lista.map((v) => v.id), ['b', 'a'])

  guardarVentasEnEspera(almacen, 'sede-1', lista)
  assert.deepEqual(leerVentasEnEspera(almacen, 'sede-1').map((v) => v.id), ['b', 'a'])
  assert.deepEqual(leerVentasEnEspera(almacen, 'sede-2'), [])

  lista = quitarVentaEnEspera(lista, 'b')
  guardarVentasEnEspera(almacen, 'sede-1', lista)
  assert.deepEqual(leerVentasEnEspera(almacen, 'sede-1').map((v) => v.id), ['a'])

  guardarVentasEnEspera(almacen, 'sede-1', [])
  assert.equal(almacen.getItem(claveVentasEnEspera('sede-1')), null)
})

test('ventas en espera: tope máximo y datos dañados', () => {
  let lista: VentaEnEspera[] = []
  for (let i = 0; i < MAX_VENTAS_EN_ESPERA; i++) lista = agregarVentaEnEspera(lista, venta(String(i)))!
  assert.equal(agregarVentaEnEspera(lista, venta('extra')), null)

  const almacen = almacenFalso()
  almacen.setItem(claveVentasEnEspera('sede-1'), '{no es json')
  assert.deepEqual(leerVentasEnEspera(almacen, 'sede-1'), [])
  almacen.setItem(claveVentasEnEspera('sede-1'), JSON.stringify([{ id: 'x', items: [] }, venta('ok')]))
  assert.deepEqual(leerVentasEnEspera(almacen, 'sede-1').map((v) => v.id), ['ok'])
})

test('ventas en espera: etiqueta y borrado al cerrar sesión', () => {
  assert.equal(etiquetaVentaEnEspera('María López', venta('a').items), 'María López')
  assert.equal(etiquetaVentaEnEspera('Consumidor Final', venta('a').items), 'ADVIL MAX')
  assert.equal(etiquetaVentaEnEspera(null, [...venta('a').items, ...venta('b', 'DOLEX').items]), 'ADVIL MAX y 1 más')

  const almacen = almacenFalso()
  guardarVentasEnEspera(almacen, 'sede-1', [venta('a')])
  guardarVentasEnEspera(almacen, 'sede-2', [venta('b')])
  almacen.setItem('otra-clave', 'se conserva')
  borrarTodasLasVentasEnEspera(almacen)
  assert.deepEqual(Array.from(almacen.datos.keys()), ['otra-clave'])
})
