/**
 * Cálculos de dinero del POS en pesos enteros, idénticos a los de la base
 * (crear_factura_v2_tx). Se usa aritmética entera antes de dividir para que
 * los casos de x,5 redondeen igual en el navegador y en PostgreSQL.
 */

export type TarifaIva = 0 | 5 | 19

export const TARIFAS_IVA: readonly TarifaIva[] = [0, 5, 19]

export function normalizarTarifaIva(value: unknown): TarifaIva {
  const n = Number(value)
  return n === 5 || n === 19 ? n : 0
}

/** Valor neto de una línea después del descuento porcentual. */
export function aplicarDescuento(base: number, descuentoPct: number): number {
  const b = Math.round(Number(base) || 0)
  const d = Math.min(100, Math.max(0, Number(descuentoPct) || 0))
  return Math.round((b * (100 - d)) / 100)
}

/** IVA de una línea neta, redondeado a peso. */
export function calcularIvaLinea(neto: number, tarifa: unknown): number {
  const n = Math.round(Number(neto) || 0)
  return Math.round((n * normalizarTarifaIva(tarifa)) / 100)
}
