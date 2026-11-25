export type MetodoPagoPos = 'efectivo' | 'tarjeta' | 'transferencia' | 'mixto'

export interface ValidatePagoInput {
  total: number
  tipoVenta: 'contado' | 'credito'
  metodoPago: MetodoPagoPos
  pagoEfectivo?: number
  pagoTarjeta?: number
  pagoTransferencia?: number
}

export type ValidatePagoResult =
  | {
      ok: true
      metodoPago: MetodoPagoPos
      pagoEfectivo: number
      pagoTarjeta: number
      pagoTransferencia: number
    }
  | {
      ok: false
      error: string
      diff: number
    }

const sanitizeAmount = (val: number | undefined): number => {
  const num = Number(val ?? 0)
  if (!Number.isFinite(num) || num < 0) return -1
  return Math.round(num * 100) / 100
}

export function validateAndNormalizePago(input: ValidatePagoInput): ValidatePagoResult {
  const total = Math.max(0, Math.round((Number(input.total) || 0) * 100) / 100)

  if (input.tipoVenta === 'credito') {
    const metodoCredito: MetodoPagoPos =
      input.metodoPago === 'tarjeta' || input.metodoPago === 'transferencia'
        ? input.metodoPago
        : 'efectivo'
    return {
      ok: true,
      metodoPago: metodoCredito,
      pagoEfectivo: 0,
      pagoTarjeta: 0,
      pagoTransferencia: 0,
    }
  }

  if (input.metodoPago !== 'mixto') {
    return {
      ok: true,
      metodoPago: input.metodoPago,
      pagoEfectivo: input.metodoPago === 'efectivo' ? total : 0,
      pagoTarjeta: input.metodoPago === 'tarjeta' ? total : 0,
      pagoTransferencia: input.metodoPago === 'transferencia' ? total : 0,
    }
  }

  const ef = sanitizeAmount(input.pagoEfectivo)
  const tj = sanitizeAmount(input.pagoTarjeta)
  const tr = sanitizeAmount(input.pagoTransferencia)

  if (ef < 0 || tj < 0 || tr < 0) {
    return {
      ok: false,
      error: 'Los montos del pago mixto no pueden ser negativos',
      diff: total,
    }
  }

  const sum = Math.round((ef + tj + tr) * 100) / 100
  const diff = Math.round((total - sum) * 100) / 100

  if (Math.abs(diff) > 1) {
    return {
      ok: false,
      error:
        diff > 0
          ? `Faltan $${Math.round(diff).toLocaleString()} para completar el pago mixto`
          : `El pago mixto excede el total por $${Math.round(Math.abs(diff)).toLocaleString()}`,
      diff,
    }
  }

  const activos = [
    ef > 0 ? ('efectivo' as const) : null,
    tj > 0 ? ('tarjeta' as const) : null,
    tr > 0 ? ('transferencia' as const) : null,
  ].filter(Boolean) as Array<'efectivo' | 'tarjeta' | 'transferencia'>

  const metodoNormalizado: MetodoPagoPos = activos.length === 1 ? activos[0] : 'mixto'

  return {
    ok: true,
    metodoPago: metodoNormalizado,
    pagoEfectivo: ef,
    pagoTarjeta: tj,
    pagoTransferencia: tr,
  }
}

export function getFacturaEfectivoReal(factura: {
  estado_pago?: string | null
  tipo_venta?: string | null
  metodo_pago?: string | null
  total?: number | null
  pago_efectivo?: number | null
  monto_abonado?: number | null
}): number {
  if (factura.estado_pago !== 'pagado') return 0
  if (factura.tipo_venta !== 'contado' && (Number(factura.monto_abonado) || 0) > 0) return 0

  if (factura.metodo_pago === 'mixto') {
    return Number(factura.pago_efectivo) || 0
  }
  if (factura.metodo_pago === 'efectivo') {
    const pe = Number(factura.pago_efectivo) || 0
    return pe > 0 ? pe : Number(factura.total) || 0
  }
  return 0
}

export function calcularEfectivoEsperadoCaja(params: {
  montoApertura: number
  facturasSesion: Array<{
    estado_pago?: string | null
    tipo_venta?: string | null
    metodo_pago?: string | null
    total?: number | null
    pago_efectivo?: number | null
    monto_abonado?: number | null
  }>
  abonosEfectivoTotal: number
  gastosEfectivoTotal: number
  comprasEfectivoTotal: number
}): number {
  const ventasEfectivo = params.facturasSesion.reduce(
    (sum, f) => sum + getFacturaEfectivoReal(f),
    0
  )
  return (
    (Number(params.montoApertura) || 0) +
    ventasEfectivo +
    (Number(params.abonosEfectivoTotal) || 0) -
    (Number(params.gastosEfectivoTotal) || 0) -
    (Number(params.comprasEfectivoTotal) || 0)
  )
}
