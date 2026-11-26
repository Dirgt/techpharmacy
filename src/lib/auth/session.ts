import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { isTenantSuspended } from '@/lib/tenant/domain'

export type UserDrogueria = {
  id: string
  nombre: string
  subdominio: string
  nit: string | null
  direccion: string | null
  telefono: string | null
  regimen: string | null
  estado: string
  plan: string
  max_usuarios: number
  fecha_vencimiento: string | null
  motivo_suspension: string | null
  mensaje_pie_factura: string | null
  prefijo_factura: string | null
  resolucion_dian: string | null
}

export type UserProfile = {
  id: string
  username: string
  full_name: string | null
  role: string | null
  status: string | null
  drogueria_id: string | null
  drogueria: UserDrogueria | null
}

export const getCurrentUserWithProfile = cache(async () => {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims as { sub?: string; email?: string } | undefined
  const userId = claims?.sub

  if (!userId) return null

  const user = {
    id: userId,
    email: claims?.email ?? '',
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select(`
      id,
      username,
      full_name,
      role,
      status,
      drogueria_id,
      drogueria:drogueria_id (
        id,
        nombre,
        subdominio,
        nit,
        direccion,
        telefono,
        regimen,
        estado,
        plan,
        max_usuarios,
        fecha_vencimiento,
        motivo_suspension,
        mensaje_pie_factura,
        prefijo_factura,
        resolucion_dian
      )
    `)
    .eq('id', user.id)
    .single()

  if (!profile) {
    return { user, profile: null }
  }

  const drogueriaRaw = Array.isArray(profile.drogueria) ? profile.drogueria[0] : profile.drogueria

  return {
    user,
    profile: {
      id: profile.id,
      username: profile.username,
      full_name: profile.full_name,
      role: profile.role,
      status: profile.status,
      drogueria_id: profile.drogueria_id,
      drogueria: drogueriaRaw ?? null,
    } satisfies UserProfile,
  }
})

export async function requireActiveUser() {
  const session = await getCurrentUserWithProfile()
  if (!session || !session.user || !session.profile) {
    return { ok: false as const, error: 'Usuario no autenticado' }
  }
  if (session.profile.status !== 'activo') {
    return { ok: false as const, error: 'Tu cuenta se encuentra inactiva. Contacta al administrador.' }
  }
  if (session.profile.role !== 'superadmin') {
    const suspension = isTenantSuspended(session.profile.drogueria)
    if (suspension.suspended) {
      return {
        ok: false as const,
        error: suspension.reason || 'El servicio de tu droguería está suspendido.',
      }
    }
  }
  return { ok: true as const, user: session.user, profile: session.profile }
}

export async function requireAdmin() {
  const active = await requireActiveUser()
  if (!active.ok) return active

  if (active.profile.role !== 'admin' && active.profile.role !== 'superadmin') {
    return { ok: false as const, error: 'Acceso denegado: se requieren permisos de administrador.' }
  }
  return active
}

export async function requireSuperAdmin() {
  const active = await requireActiveUser()
  if (!active.ok) return active

  if (active.profile.role !== 'superadmin') {
    return { ok: false as const, error: 'Acceso denegado: se requieren permisos de superadministrador.' }
  }
  return active
}
