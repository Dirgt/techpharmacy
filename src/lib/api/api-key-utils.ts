import { createHash, randomBytes } from 'node:crypto'

export const API_SCOPES = [
  'read:productos',
  'read:inventario',
  'read:facturas',
  'read:clientes',
  'write:clientes',
] as const

export type ApiScope = (typeof API_SCOPES)[number]

export const API_SCOPE_LABELS: Record<ApiScope, string> = {
  'read:productos': 'Leer Productos',
  'read:inventario': 'Leer Inventario',
  'read:facturas': 'Leer Facturas',
  'read:clientes': 'Leer Clientes',
  'write:clientes': 'Crear Clientes',
}

export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex')
}

export function generateApiKeyPair(): {
  rawKey: string
  keyPrefix: string
  keyHash: string
} {
  const rawKey = `tp_live_${randomBytes(24).toString('hex')}`
  return {
    rawKey,
    keyPrefix: rawKey.slice(0, 14),
    keyHash: hashApiKey(rawKey),
  }
}

interface RateLimitBucket {
  count: number
  resetAt: number
}

const rateLimitStore = new Map<string, RateLimitBucket>()

export function checkRateLimit(
  bucketKey: string,
  limitPerMinute = 120,
  nowMs = Date.now()
): { allowed: boolean; limit: number; remaining: number; resetAt: number } {
  const windowMs = 60_000
  const existing = rateLimitStore.get(bucketKey)

  if (!existing || existing.resetAt <= nowMs) {
    const resetAt = nowMs + windowMs
    rateLimitStore.set(bucketKey, { count: 1, resetAt })
    return {
      allowed: true,
      limit: limitPerMinute,
      remaining: Math.max(0, limitPerMinute - 1),
      resetAt,
    }
  }

  existing.count += 1
  const allowed = existing.count <= limitPerMinute
  return {
    allowed,
    limit: limitPerMinute,
    remaining: Math.max(0, limitPerMinute - existing.count),
    resetAt: existing.resetAt,
  }
}
