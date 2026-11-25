import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function calculatePV(
  costo: number | string | null | undefined,
  margen: number | string | null | undefined
): number {
  const c = typeof costo === "string" ? parseFloat(costo) : Number(costo)
  const m = typeof margen === "string" ? parseFloat(margen) : Number(margen)
  if (isNaN(c) || c <= 0) return 0
  if (!isNaN(m) && m >= 100) return 0
  if (isNaN(m) || m <= 0) return Math.round(c)
  return Math.round(c / (1 - m / 100))
}

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
})

export function formatCurrency(amount: number | string | null | undefined): string {
  const n = typeof amount === "string" ? parseFloat(amount) : Number(amount ?? 0)
  if (!Number.isFinite(n)) return currencyFormatter.format(0)
  return currencyFormatter.format(Math.round(n))
}
