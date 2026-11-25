import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/database.types'
import { extractSubdomainFromHost, normalizeHost } from './domain'

export interface PublicTenantInfo {
  id: string
  nombre: string
  subdominio: string
  estado: string
  fecha_vencimiento: string | null
  motivo_suspension: string | null
}

const TENANT_HOST_CACHE_TTL_MS = 30_000
const hostTenantCache = new Map<
  string,
  { tenant: PublicTenantInfo | null; expiresAt: number }
>()

export function invalidateTenantHostCache() {
  hostTenantCache.clear()
}

export async function resolveTenantWithSupabase(
  supabase: SupabaseClient<Database>,
  rawHost: string | null | undefined
): Promise<PublicTenantInfo | null> {
  const normalizedHost = normalizeHost(rawHost)
  if (!normalizedHost) return null
  if (normalizedHost === 'localhost' || normalizedHost === '127.0.0.1') return null
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(normalizedHost)) return null

  const cached = hostTenantCache.get(normalizedHost)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.tenant
  }

  const subdominio = extractSubdomainFromHost(normalizedHost)

  const { data, error } = await supabase.rpc('get_public_tenant_by_host', {
    p_subdominio: subdominio ?? undefined,
    p_host: normalizedHost,
  })

  if (error) {
    return null
  }

  const row = Array.isArray(data) ? data[0] : data
  const tenant: PublicTenantInfo | null = row
    ? {
        id: row.id,
        nombre: row.nombre,
        subdominio: row.subdominio,
        estado: row.estado,
        fecha_vencimiento: row.fecha_vencimiento ?? null,
        motivo_suspension: row.motivo_suspension ?? null,
      }
    : null

  hostTenantCache.set(normalizedHost, {
    tenant,
    expiresAt: Date.now() + TENANT_HOST_CACHE_TTL_MS,
  })

  return tenant
}

export async function resolveTenantFromHost(
  rawHost: string | null | undefined
): Promise<PublicTenantInfo | null> {
  const supabase = await createClient()
  return resolveTenantWithSupabase(supabase, rawHost)
}
