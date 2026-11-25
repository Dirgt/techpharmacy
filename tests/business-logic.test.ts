import test from 'node:test'
import assert from 'node:assert/strict'
import { calculatePV, formatCurrency } from '../src/lib/utils.ts'
import { CrearClienteSchema } from '../src/lib/validations/cliente.schema.ts'
import { UpsertInventarioSchema } from '../src/lib/validations/inventario.schema.ts'
import {
  ProveedorSchema,
  GastoSchema,
  CompraSchema,
} from '../src/lib/validations/tesoreria.schema.ts'
import {
  DrogueriaSchema,
  CreateTenantUserSchema,
  CreateApiKeySchema,
} from '../src/lib/validations/superadmin.schema.ts'
import {
  extractSubdomainFromHost,
  buildDrogueriaUrl,
  isTenantSuspended,
} from '../src/lib/tenant/domain.ts'
import {
  generateApiKeyPair,
  hashApiKey,
  checkRateLimit,
} from '../src/lib/api/api-key-utils.ts'
import {
  generateInventarioCsvTemplate,
  parseInventarioCsv,
} from '../src/lib/inventario/csv-import.ts'
import {
  checkLoginRateLimit,
  recordFailedLoginAttempt,
  clearLoginAttempts,
} from '../src/lib/auth/login-rate-limit.ts'
import {
  isLotExpired,
  computeSellableStockFromLots,
  canFulfillWithUnpacking,
  simulateUnpackingAndDeduct,
  suggestPackConsolidation,
} from '../src/lib/inventario/fraccionamiento.ts'
import {
  validateAndNormalizePago,
  calcularEfectivoEsperadoCaja,
} from '../src/lib/pos/pago-mixto.ts'

test('calculatePV calcula el precio de venta según margen sobre venta', () => {
  assert.equal(calculatePV(10000, 20), 12500)
  assert.equal(calculatePV(7000, 30), 10000)
  assert.equal(calculatePV('10000', '20'), 12500)
})

test('calculatePV maneja bordes: costo <= 0, margen <= 0 y margen >= 100', () => {
  assert.equal(calculatePV(0, 20), 0)
  assert.equal(calculatePV(-500, 20), 0)
  assert.equal(calculatePV(8500, 0), 8500)
  assert.equal(calculatePV(8500, -10), 8500)
  assert.equal(calculatePV(8500, 100), 0)
  assert.equal(calculatePV(8500, 120), 0)
  assert.equal(calculatePV(null, undefined), 0)
})

test('formatCurrency formatea moneda consistentemente sin decimales', () => {
  const formattedPositive = formatCurrency(15000)
  assert.match(formattedPositive, /15\.000|15,000/)
  assert.ok(formattedPositive.includes('$'))

  const formattedZero = formatCurrency(null)
  assert.ok(formattedZero.includes('0'))

  const formattedInvalid = formatCurrency('abc')
  assert.ok(formattedInvalid.includes('0'))
})

test('UpsertInventarioSchema valida campos obligatorios y rechaza negativos', () => {
  const valid = UpsertInventarioSchema.safeParse({
    codigo: '770123456',
    nombre: 'Acetaminofen 500mg',
    cajas: 5,
    blisters: 2,
    unidades: 10,
    precio_caja: 12000,
  })
  assert.equal(valid.success, true)

  const invalid = UpsertInventarioSchema.safeParse({
    codigo: '',
    nombre: '',
    cajas: -1,
  })
  assert.equal(invalid.success, false)
})

test('ProveedorSchema valida NIT, email y días de crédito', () => {
  assert.equal(
    ProveedorSchema.safeParse({
      nombre: 'Droguería Central',
      email: 'ventas@drogueria.com',
      dias_credito: 30,
    }).success,
    true
  )

  assert.equal(
    ProveedorSchema.safeParse({
      nombre: 'A',
      email: 'correo-invalido',
      dias_credito: -5,
    }).success,
    false
  )
})

test('GastoSchema exige UUID de caja, concepto y monto > 0', () => {
  const validUuid = '82d5f924-0465-4e49-9e34-6da6e8b731ac'
  assert.equal(
    GastoSchema.safeParse({
      caja_sesion_id: validUuid,
      concepto: 'Compra de papelería',
      monto: 15000,
      tipo: 'operativo',
    }).success,
    true
  )

  assert.equal(
    GastoSchema.safeParse({
      caja_sesion_id: 'no-uuid',
      concepto: 'Ok',
      monto: 0,
      tipo: 'otro',
    }).success,
    false
  )
})

test('CompraSchema exige al menos un detalle con producto UUID válido', () => {
  const validUuid = '82d5f924-0465-4e49-9e34-6da6e8b731ac'
  assert.equal(
    CompraSchema.safeParse({
      proveedor_id: validUuid,
      numero_factura: 'F-001',
      total: 50000,
      estado_pago: 'pagado',
      metodo_pago: 'efectivo',
      caja_sesion_id: validUuid,
      detalles: [{ producto_id: validUuid, cantidad: 2, costo_unitario: 25000 }],
    }).success,
    true
  )

  assert.equal(
    CompraSchema.safeParse({
      proveedor_id: validUuid,
      numero_factura: 'F-001',
      total: 0,
      estado_pago: 'pagado',
      detalles: [],
    }).success,
    false
  )
})

test('CrearClienteSchema valida nombre obligatorio y email opcional', () => {
  assert.equal(
    CrearClienteSchema.safeParse({ nombre: 'Juan Pérez', email: '' }).success,
    true
  )
  assert.equal(
    CrearClienteSchema.safeParse({ nombre: '', email: 'mal-email' }).success,
    false
  )
})

test('DrogueriaSchema valida subdominio alfanumérico con guiones y URL opcional', () => {
  assert.equal(
    DrogueriaSchema.safeParse({
      nombre: 'Farmacia Norte',
      subdominio: 'farmacia-norte',
      url_personalizada: 'https://norte.techpharmacy.app',
      nit: '900123456-7',
    }).success,
    true
  )

  assert.equal(
    DrogueriaSchema.safeParse({
      nombre: 'Farmacia Norte',
      subdominio: 'con espacios!',
      url_personalizada: 'no-es-url',
    }).success,
    false
  )
})

test('CreateTenantUserSchema exige email, contraseña >= 6, rol válido y drogueria_id UUID', () => {
  const validUuid = 'dc01561b-ed2d-46c3-b97a-1b5529464e8f'
  assert.equal(
    CreateTenantUserSchema.safeParse({
      email: 'admin@sede.com',
      password: 'Password123',
      full_name: 'Admin Sede',
      username: 'adminsede',
      role: 'admin',
      drogueria_id: validUuid,
    }).success,
    true
  )

  assert.equal(
    CreateTenantUserSchema.safeParse({
      email: 'super@plataforma.com',
      password: 'Password123',
      full_name: 'Super Admin',
      username: 'superadmin',
      role: 'superadmin',
      drogueria_id: null,
    }).success,
    true
  )

  assert.equal(
    CreateTenantUserSchema.safeParse({
      email: 'admin@sede.com',
      password: 'Password123',
      full_name: 'Admin Sede',
      username: 'adminsede',
      role: 'admin',
      drogueria_id: null,
    }).success,
    false
  )

  assert.equal(
    CreateTenantUserSchema.safeParse({
      email: 'invalido',
      password: '123',
      full_name: 'A',
      username: 'a',
      role: 'invalido',
      drogueria_id: 'no-uuid',
    }).success,
    false
  )
})

test('extractSubdomainFromHost extrae subdominio válido e ignora localhost, IPs y dominio raíz', () => {
  assert.equal(extractSubdomainFromHost('farmaliados.vercel.app'), 'farmaliados')
  assert.equal(extractSubdomainFromHost('auxisurab.techpharmacy.co:443'), 'auxisurab')
  assert.equal(extractSubdomainFromHost('www.techpharmacy.co'), null)
  assert.equal(extractSubdomainFromHost('techpharmacy.co'), null)
  assert.equal(extractSubdomainFromHost('localhost:3000'), null)
  assert.equal(extractSubdomainFromHost('127.0.0.1:3000'), null)
  assert.equal(extractSubdomainFromHost('172.24.128.1:3000'), null)
})

test('buildDrogueriaUrl prioriza url_personalizada o usa subdominio + rootDomain', () => {
  assert.equal(
    buildDrogueriaUrl('farmaliados', null, 'vercel.app'),
    'https://farmaliados.vercel.app'
  )
  assert.equal(
    buildDrogueriaUrl('farmaliados', 'https://pos.farmaliados.com', 'vercel.app'),
    'https://pos.farmaliados.com'
  )
})

test('isTenantSuspended detecta suspensión explícita y vencimiento por fecha', () => {
  assert.deepEqual(
    isTenantSuspended({ estado: 'activo', fecha_vencimiento: '2026-12-31' }, '2026-11-24'),
    { suspended: false, expired: false, reason: null }
  )

  const manual = isTenantSuspended(
    { estado: 'suspendido', motivo_suspension: 'Pago pendiente' },
    '2026-11-24'
  )
  assert.equal(manual.suspended, true)
  assert.equal(manual.expired, false)
  assert.equal(manual.reason, 'Pago pendiente')

  const expired = isTenantSuspended(
    { estado: 'activo', fecha_vencimiento: '2026-11-20' },
    '2026-11-24'
  )
  assert.equal(expired.suspended, true)
  assert.equal(expired.expired, true)
})

test('DrogueriaSchema valida campos de plan, estado, max_usuarios y fecha_vencimiento', () => {
  const valid = DrogueriaSchema.safeParse({
    nombre: 'Farmacia Pro',
    subdominio: 'farmacia-pro',
    plan: 'pro',
    estado: 'prueba',
    max_usuarios: 15,
    fecha_vencimiento: '2026-12-31',
  })
  assert.equal(valid.success, true)

  const invalid = DrogueriaSchema.safeParse({
    nombre: 'Farmacia Pro',
    subdominio: 'farmacia-pro',
    plan: 'inexistente',
    max_usuarios: 0,
    fecha_vencimiento: '31/12/2026',
  })
  assert.equal(invalid.success, false)
})

test('generateApiKeyPair y hashApiKey generan llaves tp_live_ y hash SHA-256 consistente', () => {
  const pair1 = generateApiKeyPair()
  const pair2 = generateApiKeyPair()

  assert.ok(pair1.rawKey.startsWith('tp_live_'))
  assert.equal(pair1.keyPrefix, pair1.rawKey.slice(0, 14))
  assert.equal(pair1.keyHash, hashApiKey(pair1.rawKey))
  assert.equal(pair1.keyHash.length, 64)
  assert.notEqual(pair1.rawKey, pair2.rawKey)
})

test('checkRateLimit controla cuota por minuto y reinicia al cambiar de ventana', () => {
  const bucket = `test-bucket-${Date.now()}`
  const r1 = checkRateLimit(bucket, 2, 1_000)
  const r2 = checkRateLimit(bucket, 2, 2_000)
  const r3 = checkRateLimit(bucket, 2, 3_000)
  const r4 = checkRateLimit(bucket, 2, 62_000)

  assert.equal(r1.allowed, true)
  assert.equal(r1.remaining, 1)
  assert.equal(r2.allowed, true)
  assert.equal(r2.remaining, 0)
  assert.equal(r3.allowed, false)
  assert.equal(r4.allowed, true)
})

test('CreateApiKeySchema valida drogueria_id, nombre, scopes y expires_at', () => {
  const validUuid = 'dc01561b-ed2d-46c3-b97a-1b5529464e8f'
  assert.equal(
    CreateApiKeySchema.safeParse({
      drogueria_id: validUuid,
      nombre: 'Integración Siigo',
      scopes: ['read:productos', 'read:facturas'],
      expires_at: '2027-01-01',
    }).success,
    true
  )

  assert.equal(
    CreateApiKeySchema.safeParse({
      drogueria_id: validUuid,
      nombre: 'Sin scopes',
      scopes: [],
    }).success,
    false
  )
})

test('generateInventarioCsvTemplate y parseInventarioCsv procesan plantilla Excel con punto y coma y comas', () => {
  const template = generateInventarioCsvTemplate()
  const parsedTemplate = parseInventarioCsv(template)
  assert.equal(parsedTemplate.errors.length, 0)
  assert.equal(parsedTemplate.rows.length, 2)
  assert.equal(parsedTemplate.rows[0].codigo, '7702057070112')
  assert.equal(parsedTemplate.rows[0].laboratorio, 'GENFAR')
  assert.equal(parsedTemplate.rows[0].requiere_formula, false)
  assert.equal(parsedTemplate.rows[1].requiere_formula, true)

  const commaCsv = [
    'codigo,nombre,cajas,precio_caja,fecha_vencimiento,requiere_formula',
    '111222,Amoxicilina 500mg,12,25000,31/12/2027,si',
    ',Sin Codigo,5,1000,2027-01-01,no',
  ].join('\n')
  const parsedComma = parseInventarioCsv(commaCsv)
  assert.equal(parsedComma.rows.length, 1)
  assert.equal(parsedComma.rows[0].fecha_vencimiento, '2027-12-31')
  assert.equal(parsedComma.rows[0].requiere_formula, true)
  assert.equal(parsedComma.errors.length, 1)
  assert.equal(parsedComma.errors[0].line, 3)
})

test('checkLoginRateLimit bloquea tras maxAttempts intentos fallidos y limpia al acertar', () => {
  const key = `login-test-${Date.now()}@correo.com:127.0.0.1`
  assert.equal(checkLoginRateLimit(key, 3, 1_000).allowed, true)
  recordFailedLoginAttempt(key, 60_000, 1_100)
  recordFailedLoginAttempt(key, 60_000, 1_200)
  recordFailedLoginAttempt(key, 60_000, 1_300)

  const blocked = checkLoginRateLimit(key, 3, 1_400)
  assert.equal(blocked.allowed, false)
  assert.equal(blocked.remaining, 0)

  clearLoginAttempts(key)
  assert.equal(checkLoginRateLimit(key, 3, 1_500).allowed, true)
})

test('Destape automático permite vender blísters o unidades desde cajas cerradas sin re-empacar hacia arriba', () => {
  const stockSoloCajas = { cajas: 2, blisters: 0, unidades: 0 }
  assert.equal(
    canFulfillWithUnpacking(stockSoloCajas, { cajas: 0, blisters: 0, unidades: 5 }, 10, 10),
    true
  )
  const res = simulateUnpackingAndDeduct(
    stockSoloCajas,
    { cajas: 0, blisters: 1, unidades: 5 },
    10,
    10
  )
  assert.equal(res.ok, true)
  assert.equal(res.cajas, 1)
  assert.equal(res.blisters, 8)
  assert.equal(res.unidades, 5)
  assert.equal(res.cajasDestapadas, 1)
  assert.equal(res.blistersDestapados, 1)

  assert.equal(
    canFulfillWithUnpacking(
      { cajas: 1, blisters: 15, unidades: 0 },
      { cajas: 2, blisters: 0, unidades: 0 },
      10,
      10
    ),
    false
  )
})

test('computeSellableStockFromLots filtra lotes vencidos y ordena vigentes por FEFO', () => {
  const hoy = '2026-11-25'
  assert.equal(isLotExpired('2026-11-24', hoy), true)
  assert.equal(isLotExpired('2026-11-25', hoy), false)

  const summary = computeSellableStockFromLots(
    [
      { id: '1', lote: 'VIEJO-VENCIDO', fecha_vencimiento: '2026-10-01', cajas: 3, blisters: 0, unidades: 0 },
      { id: '2', lote: 'NUEVO-FEB', fecha_vencimiento: '2027-06-01', cajas: 4, blisters: 1, unidades: 0 },
      { id: '3', lote: 'PROXIMO-ENE', fecha_vencimiento: '2027-01-15', cajas: 2, blisters: 0, unidades: 5 },
    ],
    null,
    hoy
  )
  assert.equal(summary.cajas, 6)
  assert.equal(summary.cajas_fisicas, 9)
  assert.equal(summary.tiene_stock_vencido, true)
  assert.equal(summary.todo_vencido, false)
  assert.equal(summary.lotes_ordenados[0].lote, 'PROXIMO-ENE')
  assert.equal(summary.lotes_ordenados[2].vencido, true)

  const soloVencido = computeSellableStockFromLots(
    [{ id: '1', lote: 'EXP', fecha_vencimiento: '2026-01-01', cajas: 5, blisters: 0, unidades: 0 }],
    null,
    hoy
  )
  assert.equal(soloVencido.todo_vencido, true)
  assert.equal(soloVencido.cajas, 0)
})

test('validateAndNormalizePago y calcularEfectivoEsperadoCaja cuadran exactamente con pago mixto y abonos', () => {
  const descuadrado = validateAndNormalizePago({
    total: 35000,
    tipoVenta: 'contado',
    metodoPago: 'mixto',
    pagoEfectivo: 20000,
    pagoTransferencia: 10000,
    pagoTarjeta: 0,
  })
  assert.equal(descuadrado.ok, false)

  const exacto = validateAndNormalizePago({
    total: 35000,
    tipoVenta: 'contado',
    metodoPago: 'mixto',
    pagoEfectivo: 20000,
    pagoTransferencia: 15000,
    pagoTarjeta: 0,
  })
  assert.equal(exacto.ok, true)
  if (exacto.ok) {
    assert.equal(exacto.metodoPago, 'mixto')
    assert.equal(exacto.pagoEfectivo, 20000)
    assert.equal(exacto.pagoTransferencia, 15000)
  }

  const soloTarjetaEnMixto = validateAndNormalizePago({
    total: 18000,
    tipoVenta: 'contado',
    metodoPago: 'mixto',
    pagoEfectivo: 0,
    pagoTarjeta: 18000,
    pagoTransferencia: 0,
  })
  assert.equal(soloTarjetaEnMixto.ok, true)
  if (soloTarjetaEnMixto.ok) {
    assert.equal(soloTarjetaEnMixto.metodoPago, 'tarjeta')
  }

  const esperado = calcularEfectivoEsperadoCaja({
    montoApertura: 50000,
    facturasSesion: [
      { estado_pago: 'pagado', tipo_venta: 'contado', metodo_pago: 'mixto', total: 35000, pago_efectivo: 20000 },
      { estado_pago: 'pagado', tipo_venta: 'contado', metodo_pago: 'efectivo', total: 10000, pago_efectivo: 10000 },
      { estado_pago: 'anulada', tipo_venta: 'contado', metodo_pago: 'efectivo', total: 99000, pago_efectivo: 99000 },
      { estado_pago: 'pagado', tipo_venta: 'credito', metodo_pago: 'efectivo', total: 40000, monto_abonado: 40000 },
    ],
    abonosEfectivoTotal: 40000,
    gastosEfectivoTotal: 5000,
    comprasEfectivoTotal: 15000,
  })
  assert.equal(esperado, 50000 + 20000 + 10000 + 40000 - 5000 - 15000)
})

test('CompraSchema valida detalle con lote, fecha_vencimiento y estado_recepcion', () => {
  const valid = CompraSchema.safeParse({
    proveedor_id: '82d5f924-0465-4e49-9e34-6da6e8b731ac',
    numero_factura: 'FC-901',
    total: 120000,
    estado_pago: 'pendiente',
    estado_recepcion: 'conforme',
    detalles: [
      {
        producto_id: '52d5f924-0465-4e49-9e34-6da6e8b731ab',
        cantidad: 5,
        costo_unitario: 24000,
        lote: 'L2511B',
        fecha_vencimiento: '2028-05-30',
      },
    ],
  })
  assert.equal(valid.success, true)
})

test('suggestPackConsolidation sugiere convertir unidades sueltas a blíster o caja al precio justo', () => {
  const avail = { cajas: 2, blisters: 0, unidades: 0 }
  const prices = { pvpCaja: 12000, pvpBlister: 1500, pvpUnidad: 200 }

  // 10 unidades = 1 blíster ($1.500 vs $2.000)
  const sug10 = suggestPackConsolidation(
    { cajas: 0, blisters: 0, unidades: 10 },
    avail,
    10,
    10,
    prices
  )
  assert.ok(sug10)
  assert.deepEqual(sug10.suggested, { cajas: 0, blisters: 1, unidades: 0 })
  assert.equal(sug10.newBasePrice, 1500)
  assert.equal(sug10.savings, 500)

  // 12 unidades = 1 blíster + 2 unidades
  const sug12 = suggestPackConsolidation(
    { cajas: 0, blisters: 0, unidades: 12 },
    avail,
    10,
    10,
    prices
  )
  assert.ok(sug12)
  assert.deepEqual(sug12.suggested, { cajas: 0, blisters: 1, unidades: 2 })

  // Si ya solo hay unidades sueltas (0 cajas y 0 blísters), no debe sugerir convertir a blíster
  const sinCajaParaRespaldo = suggestPackConsolidation(
    { cajas: 0, blisters: 0, unidades: 10 },
    { cajas: 0, blisters: 0, unidades: 12 },
    10,
    10,
    prices
  )
  assert.equal(sinCajaParaRespaldo, null)
})
