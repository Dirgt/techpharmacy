import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '@/lib/supabase/database.types'
import { isTenantSuspended } from '@/lib/tenant/domain'
import { ApiScope, checkRateLimit, hashApiKey } from './api-key-utils'

export interface RateLimitInfo {
  limit: number
  remaining: number
  resetAt: number
}

export interface ApiKeyAuthResult {
  drogueriaId: string
  drogueria: {
    id: string
    nombre: string
    subdominio: string
    estado: string
    plan: string
  }
  keyId: string
  scopes: string[]
  rateLimit: RateLimitInfo
  adminClient: ReturnType<typeof getServiceRoleClient>
}

const lastUsedTouchMap = new Map<string, number>()

export function getServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey || serviceRoleKey.includes('PEGA_AQUI')) {
    throw new Error('Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.')
  }

  return createSupabaseClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export function apiJson(body: unknown, status = 200, rateLimit?: RateLimitInfo) {
  const headers: Record<string, string> = {}
  if (rateLimit) {
    headers['X-RateLimit-Limit'] = String(rateLimit.limit)
    headers['X-RateLimit-Remaining'] = String(rateLimit.remaining)
    headers['X-RateLimit-Reset'] = String(Math.ceil(rateLimit.resetAt / 1000))
  }
  return NextResponse.json(body, { status, headers })
}

export function parsePagination(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const rawPage = Number(sp.get('page') || 1)
  const rawLimit = Number(sp.get('limit') || 50)
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1
  const limit =
    Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.min(100, Math.floor(rawLimit)) : 50
  const from = (page - 1) * limit
  const to = from + limit - 1
  return { page, limit, from, to }
}

function extractRawKey(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim()
    if (token) return token
  }
  const xApiKey = request.headers.get('x-api-key')?.trim()
  return xApiKey || null
}

export async function authenticateApiKey(
  request: NextRequest,
  requiredScope: ApiScope
): Promise<
  | { ok: true; auth: ApiKeyAuthResult }
  | { ok: false; response: NextResponse }
> {
  const rawKey = extractRawKey(request)
  if (!rawKey || !rawKey.startsWith('tp_live_')) {
    return {
      ok: false,
      response: apiJson(
        {
          success: false,
          error: 'API Key faltante o formato inválido. Usa Authorization: Bearer tp_live_... o x-api-key.',
        },
        401
      ),
    }
  }

  let adminClient: ReturnType<typeof getServiceRoleClient>
  try {
    adminClient = getServiceRoleClient()
  } catch (err: unknown) {
    return {
      ok: false,
      response: apiJson(
        {
          success: false,
          error: err instanceof Error ? err.message : 'Error de configuración de servidor',
        },
        500
      ),
    }
  }

  const keyHash = hashApiKey(rawKey)
  const { data: keyRow, error } = await adminClient
    .from('api_keys')
    .select(
      'id, drogueria_id, scopes, estado, expires_at, drogueria:drogueria_id ( id, nombre, subdominio, estado, plan, fecha_vencimiento, motivo_suspension )'
    )
    .eq('key_hash', keyHash)
    .single()

  if (error || !keyRow || keyRow.estado !== 'activa') {
    return {
      ok: false,
      response: apiJson({ success: false, error: 'API Key inválida o revocada.' }, 401),
    }
  }

  if (keyRow.expires_at && new Date(keyRow.expires_at).getTime() <= Date.now()) {
    return {
      ok: false,
      response: apiJson({ success: false, error: 'API Key expirada.' }, 401),
    }
  }

  const drogueriaRaw = Array.isArray(keyRow.drogueria) ? keyRow.drogueria[0] : keyRow.drogueria
  if (!drogueriaRaw) {
    return {
      ok: false,
      response: apiJson({ success: false, error: 'Droguería asociada no encontrada.' }, 403),
    }
  }

  const suspension = isTenantSuspended(drogueriaRaw)
  if (suspension.suspended) {
    return {
      ok: false,
      response: apiJson(
        {
          success: false,
          error: suspension.reason || 'El servicio de esta droguería se encuentra suspendido.',
        },
        403
      ),
    }
  }

  const scopes = keyRow.scopes || []
  if (!scopes.includes(requiredScope)) {
    return {
      ok: false,
      response: apiJson(
        {
          success: false,
          error: `Permiso insuficiente. Se requiere el scope "${requiredScope}".`,
        },
        403
      ),
    }
  }

  const rateLimit = checkRateLimit(keyRow.id, 120)
  if (!rateLimit.allowed) {
    return {
      ok: false,
      response: apiJson(
        {
          success: false,
          error: 'Límite de peticiones excedido (120 req/min). Intenta nuevamente en unos segundos.',
        },
        429,
        rateLimit
      ),
    }
  }

  const now = Date.now()
  const lastTouch = lastUsedTouchMap.get(keyRow.id) ?? 0
  if (now - lastTouch > 60_000) {
    lastUsedTouchMap.set(keyRow.id, now)
    void adminClient
      .from('api_keys')
      .update({ last_used_at: new Date(now).toISOString() })
      .eq('id', keyRow.id)
  }

  return {
    ok: true,
    auth: {
      drogueriaId: keyRow.drogueria_id,
      drogueria: {
        id: drogueriaRaw.id,
        nombre: drogueriaRaw.nombre,
        subdominio: drogueriaRaw.subdominio,
        estado: drogueriaRaw.estado,
        plan: drogueriaRaw.plan,
      },
      keyId: keyRow.id,
      scopes,
      rateLimit,
      adminClient,
    },
  }
}
