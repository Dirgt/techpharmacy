const BOGOTA_TIME_ZONE = 'America/Bogota'
const BOGOTA_OFFSET = '-05:00'

export function getBogotaDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BOGOTA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function getBogotaMonthString(date: Date = new Date()): string {
  return getBogotaDateString(date).slice(0, 7)
}

export function addDaysToDateOnly(dateOnly: string, days: number): string {
  const [year, month, day] = dateOnly.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days, 12))
  return date.toISOString().slice(0, 10)
}

export function getBogotaDayRange(dateOnly = getBogotaDateString()) {
  return {
    start: `${dateOnly}T00:00:00${BOGOTA_OFFSET}`,
    endExclusive: `${addDaysToDateOnly(dateOnly, 1)}T00:00:00${BOGOTA_OFFSET}`,
  }
}

export function getBogotaMonthRange(month = getBogotaMonthString()) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Mes inválido')
  const [year, monthNumber] = month.split('-').map(Number)
  if (monthNumber < 1 || monthNumber > 12) throw new Error('Mes inválido')
  const nextYear = monthNumber === 12 ? year + 1 : year
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1
  return {
    start: `${month}-01T00:00:00${BOGOTA_OFFSET}`,
    endExclusive: `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00${BOGOTA_OFFSET}`,
  }
}

export function formatBogotaDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: BOGOTA_TIME_ZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(typeof value === 'string' ? new Date(value) : value)
}

export function formatDateOnlyEsCO(dateOnly: string): string {
  const [year, month, day] = dateOnly.split('-').map(Number)
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(year, month - 1, day))
}
