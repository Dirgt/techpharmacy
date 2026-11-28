import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aFilaInventario,
  aFilaPOS,
  decodificarCatalogo,
  fusionarCatalogo,
  ordenarPorNombre,
  type CatalogoItem,
} from '../src/lib/catalogo/modelo.ts'
import { calculatePV } from '../src/lib/utils.ts'
import { aplicarDescuento, calcularIvaLinea } from '../src/lib/pos/montos.ts'

const COLS = [
  'inventario_id', 'producto_id', 'codigo', 'nombre_producto', 'principio_activo',
  'laboratorio_id', 'laboratorio', 'cajas', 'blisters', 'unidades', 'stock_minimo',
  'precio_caja', 'precio_blister', 'precio_unidad', 'margen_caja', 'margen_blister',
  'margen_unidad', 'fecha_vencimiento', 'lote', 'registro_invima', 'seccion', 'ubicacion',
  'blisters_por_caja', 'unidades_por_blister', 'updated_at', 'iva_porcentaje',
  'requiere_formula', 'tiene_lotes', 'lotes',
]
const LCOLS = ['id', 'lote', 'fecha_vencimiento', 'cajas', 'blisters', 'unidades', 'costo_caja', 'created_at']

// Tupla como la arma catalogo_sync (mismo orden de COLS).
function tupla(over: Partial<Record<string, unknown>> = {}): unknown[] {
  const base: Record<string, unknown> = {
    inventario_id: 'inv-1', producto_id: 'prod-1', codigo: '7701', nombre_producto: 'ACETAMINOFEN 500',
    principio_activo: 'Acetaminofén', laboratorio_id: 'lab-1', laboratorio: 'GENFAR', cajas: 2, blisters: 0,
    unidades: 7, stock_minimo: 2, precio_caja: 10000, precio_blister: 5000, precio_unidad: 500,
    margen_caja: 20, margen_blister: 20, margen_unidad: 30, fecha_vencimiento: '2027-01-26', lote: 'L2',
    registro_invima: null, seccion: 'Analgésicos', ubicacion: null, blisters_por_caja: 2,
    unidades_por_blister: 10, updated_at: '2026-11-27T20:00:00+00:00', iva_porcentaje: 0,
    requiere_formula: false, tiene_lotes: true,
    lotes: [
      ['lote-x', 'LX', '2026-11-26', 1, 0, 0, 10000, '2026-11-18T00:00:00+00:00'],
      ['lote-2', 'L2', '2027-01-26', 1, 0, 7, 10000, '2026-11-25T00:00:00+00:00'],
    ],
    ...over,
  }
  return COLS.map((c) => base[c])
}

function respuesta(items: unknown[][], extra: Record<string, unknown> = {}) {
  return { v: 1, corte: '2026-11-27T19:58:00+00:00', completo: true, total: items.length, cols: COLS, lcols: LCOLS, items, ...extra }
}

test('decodificarCatalogo convierte tuplas en productos con sus lotes', () => {
  const r = decodificarCatalogo(respuesta([tupla()]))
  assert.equal(r.completo, true)
  assert.equal(r.total, 1)
  assert.equal(r.corte, '2026-11-27T19:58:00+00:00')
  const item = r.items[0]
  assert.equal(item.nombre_producto, 'ACETAMINOFEN 500')
  assert.equal(item.margen_caja, 20)
  assert.equal(item.tiene_lotes, true)
  assert.equal(item.lotes.length, 2)
  assert.deepEqual(item.lotes[1], {
    id: 'lote-2', lote: 'L2', fecha_vencimiento: '2027-01-26', cajas: 1, blisters: 0, unidades: 7,
    costo_caja: 10000, created_at: '2026-11-25T00:00:00+00:00',
  })
})

test('decodificarCatalogo lee por nombre de columna, no por posición', () => {
  const cols = [...COLS].reverse()
  const t = tupla()
  const invertida = cols.map((c) => t[COLS.indexOf(c)])
  const r = decodificarCatalogo({ ...respuesta([]), cols, items: [invertida] })
  assert.equal(r.items[0].codigo, '7701')
  assert.equal(r.items[0].lotes.length, 2)
})

test('decodificarCatalogo rechaza formatos desconocidos', () => {
  assert.throws(() => decodificarCatalogo(null))
  assert.throws(() => decodificarCatalogo({ corte: 'x', items: [], cols: ['inventario_id'], lcols: LCOLS }))
})

test('fusionarCatalogo: el delta reemplaza solo lo que cambió y conserva el resto', () => {
  const inicial = fusionarCatalogo(
    null,
    decodificarCatalogo(respuesta([tupla(), tupla({ inventario_id: 'inv-2', producto_id: 'prod-2', codigo: '7702' })]))
  )
  assert.equal(inicial.items.size, 2)
  assert.equal(inicial.consistente, true)

  // Mismo contenido (traslape de 2 minutos): no cambia nada y devuelve el mismo Map.
  const igual = fusionarCatalogo(inicial.items, decodificarCatalogo(respuesta([tupla()], { completo: false, total: 2 })))
  assert.equal(igual.cambiados, 0)
  assert.equal(igual.items, inicial.items)

  // Venta: cambia el stock de inv-1.
  const delta = fusionarCatalogo(
    inicial.items,
    decodificarCatalogo(respuesta([tupla({ unidades: 3, lotes: [['lote-2', 'L2', '2027-01-26', 1, 0, 3, 10000, null]] })], { completo: false, total: 2 }))
  )
  assert.equal(delta.cambiados, 1)
  assert.notEqual(delta.items, inicial.items)
  assert.equal(delta.items.get('inv-1')?.unidades, 3)
  assert.equal(delta.items.get('inv-1')?.lotes.length, 1)
  assert.equal(delta.items.get('inv-2'), inicial.items.get('inv-2'))
  assert.equal(delta.consistente, true)
})

test('fusionarCatalogo detecta borrados con el total del servidor', () => {
  const inicial = fusionarCatalogo(
    null,
    decodificarCatalogo(respuesta([tupla(), tupla({ inventario_id: 'inv-2', producto_id: 'prod-2' })]))
  )
  const delta = fusionarCatalogo(inicial.items, decodificarCatalogo(respuesta([], { completo: false, total: 1 })))
  assert.equal(delta.consistente, false)
})

test('aFilaPOS: el stock vendible excluye lotes vencidos (igual que el servidor)', () => {
  const item = decodificarCatalogo(respuesta([tupla()])).items[0]
  const fila = aFilaPOS(item, '2026-11-27')
  assert.equal(fila.cajas, 1)
  assert.equal(fila.unidades, 7)
  assert.equal(fila.cajas_fisicas, 2)
  assert.equal(fila.tiene_stock_vencido, true)
  assert.equal(fila.todo_vencido, false)
  assert.equal(fila.lotes_activos[0].lote, 'L2')
  assert.ok(fila.busqueda.includes('acetaminofén'))
  assert.ok(fila.busqueda.includes('genfar'))
  assert.ok(fila.busqueda.includes('7701'))
})

test('aFilaInventario conserva el stock físico y marca lotes vencidos', () => {
  const item = decodificarCatalogo(respuesta([tupla()])).items[0]
  const fila = aFilaInventario(item, '2026-11-27')
  assert.equal(fila.cajas, 2)
  assert.equal(fila.unidades, 7)
  assert.equal(fila.tiene_stock_vencido, true)
  assert.equal(fila.lotes_activos.length, 2)
})

test('sin filas de lotes se usa la fila de inventario; con lotes en cero, no', () => {
  const sinLotes: CatalogoItem = {
    ...decodificarCatalogo(respuesta([tupla()])).items[0],
    tiene_lotes: false,
    lotes: [],
    cajas: 3,
    blisters: 0,
    unidades: 0,
    fecha_vencimiento: null,
  }
  assert.equal(aFilaPOS(sinLotes, '2026-11-27').cajas, 3)

  // Tiene lotes pero todos agotados (el servidor no los envía): no hay stock vendible.
  const agotado: CatalogoItem = { ...sinLotes, tiene_lotes: true }
  assert.equal(aFilaPOS(agotado, '2026-11-27').cajas, 0)
})

test('ordenarPorNombre ordena sin distinguir tildes ni mayúsculas', () => {
  const filas = [
    { nombre_producto: 'Ácido fólico', inventario_id: 'b' },
    { nombre_producto: 'acetaminofén', inventario_id: 'a' },
    { nombre_producto: 'Zinc', inventario_id: 'c' },
  ]
  assert.deepEqual(ordenarPorNombre(filas).map((f) => f.inventario_id), ['a', 'b', 'c'])
})

test('calculatePV usa centavos enteros, igual que pos_precio_venta en la base', () => {
  // Valores verificados contra la base en la prueba de migraciones.
  assert.equal(calculatePV(10000, 20), 12500)
  assert.equal(calculatePV(5000, 20), 6250)
  assert.equal(calculatePV(500, 30), 714)
  assert.equal(calculatePV(10, 20), 13) // 12,5 exacto: redondea hacia arriba en ambos lados
  // Total de la venta de prueba: P1 1C+1B+3U (IVA 0) + P2 2C a $3.000 con IVA 19 = $28.032
  const p1 = calculatePV(10000, 20) + calculatePV(5000, 20) + 3 * calculatePV(500, 30)
  const p2 = 2 * calculatePV(3000, 0)
  const total = aplicarDescuento(p1, 0) + aplicarDescuento(p2, 0) + calcularIvaLinea(aplicarDescuento(p2, 0), 19)
  assert.equal(total, 28032)
  // Crédito con 15% e IVA 19 sobre $3.000: $2.550 + $485 = $3.035
  assert.equal(aplicarDescuento(3000, 15) + calcularIvaLinea(aplicarDescuento(3000, 15), 19), 3035)
})
