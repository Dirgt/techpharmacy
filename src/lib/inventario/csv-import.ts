export interface CsvInventarioRow {
  codigo: string
  nombre: string
  principio_activo?: string
  laboratorio?: string
  cajas: number
  blisters: number
  unidades: number
  precio_caja: number
  porcentaje_ganancia: number
  margen_blister: number
  margen_unidad: number
  precio_blister: number
  precio_unidad: number
  stock_minimo: number
  lote?: string
  fecha_vencimiento?: string | null
  ubicacion?: string
  seccion?: string
  registro_invima?: string
  blisters_por_caja: number
  unidades_por_blister: number
  requiere_formula: boolean
}

export interface CsvParseError {
  line: number
  message: string
}

export function generateInventarioCsvTemplate(): string {
  const headers = [
    'codigo',
    'nombre',
    'principio_activo',
    'laboratorio',
    'cajas',
    'blisters',
    'unidades',
    'precio_caja',
    'porcentaje_ganancia',
    'stock_minimo',
    'lote',
    'fecha_vencimiento',
    'ubicacion',
    'seccion',
    'registro_invima',
    'blisters_por_caja',
    'unidades_por_blister',
    'requiere_formula',
  ]
  const sample1 = [
    '7702057070112',
    'Acetaminofen 500mg Caja x 100',
    'Acetaminofen',
    'GENFAR',
    '10',
    '0',
    '0',
    '12000',
    '25',
    '3',
    'L-2026A',
    '2027-08-30',
    'Estante A1',
    'Analgesicos',
    'INVIMA-2024M-001',
    '10',
    '10',
    'NO',
  ]
  const sample2 = [
    '7703153000123',
    'Ibuprofeno 400mg Caja x 50',
    'Ibuprofeno',
    'MK',
    '6',
    '2',
    '0',
    '18500',
    '30',
    '2',
    'IB-992',
    '2027-11-15',
    'Estante B2',
    'Antiinflamatorios',
    'INVIMA-2023M-045',
    '5',
    '10',
    'SI',
  ]

  return '\uFEFF' + [headers.join(';'), sample1.join(';'), sample2.join(';')].join('\n')
}

function normalizeHeader(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

function parseNumber(val: string | undefined, fallback = 0): number {
  if (!val) return fallback
  const cleaned = val.replace(/[$\s]/g, '').replace(',', '.')
  const num = Number(cleaned)
  return Number.isFinite(num) ? num : fallback
}

function normalizeDate(val: string | undefined): string | null {
  if (!val) return null
  const trimmed = val.trim()
  if (!trimmed) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  const slashMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (slashMatch) {
    return `${slashMatch[3]}-${slashMatch[2]}-${slashMatch[1]}`
  }
  return null
}

export function parseInventarioCsv(csvText: string): {
  rows: CsvInventarioRow[]
  errors: CsvParseError[]
} {
  const cleanText = csvText.replace(/^\uFEFF/, '').trim()
  if (!cleanText) {
    return { rows: [], errors: [{ line: 1, message: 'El archivo CSV está vacío.' }] }
  }

  const lines = cleanText.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (lines.length < 2) {
    return {
      rows: [],
      errors: [{ line: 1, message: 'El archivo debe tener encabezados y al menos una fila de datos.' }],
    }
  }

  const firstLine = lines[0]
  const semiCount = (firstLine.match(/;/g) || []).length
  const commaCount = (firstLine.match(/,/g) || []).length
  const delimiter = semiCount >= commaCount ? ';' : ','

  const headers = splitCsvLine(firstLine, delimiter).map(normalizeHeader)
  if (!headers.includes('codigo') || !headers.includes('nombre')) {
    return {
      rows: [],
      errors: [
        {
          line: 1,
          message: 'Faltan las columnas obligatorias "codigo" y "nombre" en el encabezado.',
        },
      ],
    }
  }

  const rows: CsvInventarioRow[] = []
  const errors: CsvParseError[] = []

  for (let idx = 1; idx < lines.length; idx++) {
    const lineNum = idx + 1
    const cols = splitCsvLine(lines[idx], delimiter)
    const record: Record<string, string> = {}
    headers.forEach((h, colIdx) => {
      record[h] = cols[colIdx] ?? ''
    })

    const codigo = (record.codigo || '').trim()
    const nombre = (record.nombre || '').trim()

    if (!codigo || !nombre) {
      errors.push({ line: lineNum, message: 'Falta código o nombre del producto.' })
      continue
    }

    const cajas = parseNumber(record.cajas, 0)
    const blisters = parseNumber(record.blisters, 0)
    const unidades = parseNumber(record.unidades, 0)
    const precio_caja = parseNumber(record.precio_caja, 0)

    if (cajas < 0 || blisters < 0 || unidades < 0 || precio_caja < 0) {
      errors.push({ line: lineNum, message: 'No se permiten cantidades o precios negativos.' })
      continue
    }

    const rawDate = (record.fecha_vencimiento || '').trim()
    const fecha_vencimiento = normalizeDate(rawDate)
    if (rawDate && !fecha_vencimiento) {
      errors.push({
        line: lineNum,
        message: `Fecha de vencimiento inválida ("${rawDate}"). Usa YYYY-MM-DD o DD/MM/YYYY.`,
      })
      continue
    }

    const margenCaja = parseNumber(record.porcentaje_ganancia, 20)
    const margenBlister = parseNumber(record.margen_blister, margenCaja)
    const margenUnidad = parseNumber(record.margen_unidad, Math.max(margenCaja, 30))

    const rawFormula = (record.requiere_formula || '').trim().toLowerCase()
    const requiere_formula = ['si', 'sí', 'true', '1', 'x'].includes(rawFormula)

    rows.push({
      codigo,
      nombre,
      principio_activo: (record.principio_activo || '').trim(),
      laboratorio: (record.laboratorio || '').trim(),
      cajas,
      blisters,
      unidades,
      precio_caja,
      porcentaje_ganancia: margenCaja,
      margen_blister: margenBlister,
      margen_unidad: margenUnidad,
      precio_blister: parseNumber(record.precio_blister, 0),
      precio_unidad: parseNumber(record.precio_unidad, 0),
      stock_minimo: Math.max(0, Math.floor(parseNumber(record.stock_minimo, 2))),
      lote: (record.lote || '').trim(),
      fecha_vencimiento,
      ubicacion: (record.ubicacion || '').trim(),
      seccion: (record.seccion || '').trim(),
      registro_invima: (record.registro_invima || '').trim(),
      blisters_por_caja: Math.max(1, Math.floor(parseNumber(record.blisters_por_caja, 1))),
      unidades_por_blister: Math.max(1, Math.floor(parseNumber(record.unidades_por_blister, 1))),
      requiere_formula,
    })
  }

  return { rows, errors }
}
