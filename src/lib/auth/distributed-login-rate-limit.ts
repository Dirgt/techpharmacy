import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'

export interface DistributedRateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
}

type RpcRateLimitResult = {
  allowed?: boolean
  retry_after_seconds?: number
}

export function hashLoginRateLimitKey(email: string, ip: string) {
  return createHash('sha256')
    .update(`${email.trim().toLowerCase()}|${ip.trim()}`)
    .digest('hex')
}

function normalizeResult(value: unknown): DistributedRateLimitResult {
  const result = (value && typeof value === 'object' ? value : {}) as RpcRateLimitResult
  return {
    allowed: result.allowed !== false,
    retryAfterSeconds: Math.max(0, Number(result.retry_after_seconds || 0)),
  }
}

export async function checkDistributedLoginRateLimit(keyHash: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('check_login_rate_limit', { p_key_hash: keyHash })
  if (error) {
    console.error('No se pudo consultar el rate limit distribuido:', error)
    return { allowed: false, retryAfterSeconds: 60 } satisfies DistributedRateLimitResult
  }
  return normalizeResult(data)
}

export async function recordDistributedLoginFailure(keyHash: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('record_login_failure', { p_key_hash: keyHash })
  if (error) console.error('No se pudo registrar el intento fallido:', error)
  return normalizeResult(data)
}

export async function clearDistributedLoginFailures(keyHash: string) {
  const admin = createAdminClient()
  const { error } = await admin.rpc('clear_login_rate_limit', { p_key_hash: keyHash })
  if (error) console.error('No se pudo limpiar el rate limit de login:', error)
}
