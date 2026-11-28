export type TenantPlan = 'basico' | 'pro' | 'enterprise'
export type TenantStatus = 'activo' | 'prueba' | 'suspendido'

export const PLAN_CONFIG: Record<TenantPlan, { label: string; defaultMaxUsers: number }> = {
  basico: { label: 'Básico', defaultMaxUsers: 5 },
  pro: { label: 'Pro', defaultMaxUsers: 15 },
  enterprise: { label: 'Enterprise', defaultMaxUsers: 100 },
}

export function normalizeHost(rawHost: string | null | undefined): string | null {
  if (!rawHost) return null
  const first = rawHost.split(',')[0]?.trim().toLowerCase()
  if (!first) return null
  const withoutPort = first.split(':')[0]?.replace(/\.+$/, '')
  return withoutPort || null
}

export function extractSubdomainFromHost(rawHost: string | null | undefined): string | null {
  const host = normalizeHost(rawHost)
  if (!host) return null
  if (host === 'localhost' || host === '127.0.0.1') return null
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null

  const parts = host.split('.').filter(Boolean)
  if (parts.length < 3) return null

  const candidate = parts[0]
  if (!candidate || candidate === 'www') return null
  return candidate
}

export function buildDrogueriaUrl(
  subdominio: string,
  urlPersonalizada?: string | null,
  rootDomain?: string
): string {
  const custom = urlPersonalizada?.trim()
  if (custom) return custom
  const domain = rootDomain || process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'vercel.app'
  return `https://${subdominio}.${domain}`
}

export function isTenantSuspended(
  drogueria:
    | {
        estado?: string | null
        fecha_vencimiento?: string | null
        motivo_suspension?: string | null
      }
    | null
    | undefined,
  todayIso?: string
): { suspended: boolean; expired: boolean; reason: string | null } {
  if (!drogueria) {
    return { suspended: false, expired: false, reason: null }
  }

  if (drogueria.estado === 'suspendido') {
    return {
      suspended: true,
      expired: false,
      reason:
        drogueria.motivo_suspension?.trim() ||
        'Servicio suspendido por administración de plataforma.',
    }
  }

  if (drogueria.fecha_vencimiento) {
    const today =
      todayIso ||
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date())
    if (drogueria.fecha_vencimiento < today) {
      return {
        suspended: true,
        expired: true,
        reason: `El plan de tu droguería venció el ${drogueria.fecha_vencimiento}.`,
      }
    }
  }

  return { suspended: false, expired: false, reason: null }
}
