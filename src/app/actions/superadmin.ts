'use server'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { Database } from '@/lib/supabase/database.types'
import { requireSuperAdmin } from '@/lib/auth/session'
import { invalidateMiddlewareProfileCache } from '@/lib/supabase/middleware'
import { invalidateTenantHostCache } from '@/lib/tenant/resolve'
import { generateApiKeyPair } from '@/lib/api/api-key-utils'
import { fetchAllPages } from '@/lib/supabase/fetch-all'
import {
  AssignUserInput,
  AssignUserSchema,
  CreateApiKeyInput,
  CreateApiKeySchema,
  CreateTenantUserInput,
  CreateTenantUserSchema,
  DrogueriaInput,
  DrogueriaSchema,
  ToggleDrogueriaStatusInput,
  ToggleDrogueriaStatusSchema,
} from '@/lib/validations/superadmin.schema'

export interface DrogueriaAdminSummary {
  id: string
  full_name: string | null
  username: string
  email: string | null
  status: string | null
  role: string | null
}

export interface DrogueriaOverview {
  id: string
  nombre: string
  subdominio: string
  url_personalizada: string | null
  nit: string | null
  direccion: string | null
  telefono: string | null
  regimen: string | null
  estado: string
  plan: string
  max_usuarios: number
  fecha_vencimiento: string | null
  motivo_suspension: string | null
  created_at: string | null
  admins: DrogueriaAdminSummary[]
  usuariosTotal: number
  usuariosActivos: number
  productosCount: number
  facturasCount: number
  clientesCount: number
  comprasCount: number
  cajasAbiertas: number
  volumenFacturado: number
  ultimaActividad: string | null
}

export interface PlatformUserOverview {
  id: string
  email: string | null
  username: string
  full_name: string | null
  role: string | null
  status: string | null
  drogueria_id: string | null
  drogueria_nombre: string
  created_at: string | null
  last_sign_in_at: string | null
}

export interface PlatformApiKeyOverview {
  id: string
  drogueria_id: string
  drogueria_nombre: string
  nombre: string
  key_prefix: string
  scopes: string[]
  estado: string
  last_used_at: string | null
  expires_at: string | null
  created_at: string
}

export interface PlatformOverviewData {
  droguerias: DrogueriaOverview[]
  usuarios: PlatformUserOverview[]
  apiKeys: PlatformApiKeyOverview[]
  resumenGlobal: {
    totalDroguerias: number
    totalUsuarios: number
    usuariosActivos: number
    totalProductos: number
    totalFacturas: number
    volumenTotal: number
  }
}

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!supabaseUrl || !serviceRoleKey || serviceRoleKey.includes('PEGA_AQUI')) {
    throw new Error(
      'Falta configurar una clave válida SUPABASE_SERVICE_ROLE_KEY en .env.local para administrar la plataforma.'
    )
  }

  return createSupabaseClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function getPlatformOverview(): Promise<{
  success: boolean
  data?: PlatformOverviewData
  error?: string
}> {
  try {
    const auth = await requireSuperAdmin()
    if (!auth.ok) return { success: false, error: auth.error }

    const adminClient = getAdminClient()

    const listAllAuthUsers = async () => {
      const users: Array<{
        id: string
        email?: string | null
        last_sign_in_at?: string | null
        created_at?: string | null
        user_metadata?: { full_name?: unknown } | null
      }> = []
      for (let page = 1; page <= 50; page++) {
        const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 })
        if (error) return { users, error }
        users.push(...data.users)
        if (data.users.length < 1000) break
      }
      return { users, error: null }
    }

    // Los conteos y el volumen por droguería se calculan en SQL (platform_tenant_metrics):
    // antes se descargaban tablas completas y PostgREST las cortaba en 1.000 filas.
    const [
      { data: droguerias, error: drogueriasErr },
      { data: profiles, error: profilesErr },
      authUsersRes,
      { data: metricas, error: metricasErr },
      { data: apiKeysRows },
    ] = await Promise.all([
      adminClient.from('droguerias').select('*').order('created_at', { ascending: true }),
      fetchAllPages((from, to) =>
        adminClient
          .from('profiles')
          .select('id, username, full_name, role, status, drogueria_id, created_at')
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to)
      ),
      listAllAuthUsers(),
      adminClient.rpc('platform_tenant_metrics'),
      adminClient
        .from('api_keys')
        .select('id, drogueria_id, nombre, key_prefix, scopes, estado, last_used_at, expires_at, created_at')
        .order('created_at', { ascending: false }),
    ])

    if (drogueriasErr) return { success: false, error: drogueriasErr.message }
    if (profilesErr) return { success: false, error: profilesErr.message }
    if (authUsersRes.error) return { success: false, error: authUsersRes.error.message }
    if (metricasErr) return { success: false, error: metricasErr.message }

    const metricasMap = new Map((metricas || []).map((m) => [m.drogueria_id, m]))

    const authUserMap = new Map(
      authUsersRes.users.map((u) => [
        u.id,
        { email: u.email ?? null, last_sign_in_at: u.last_sign_in_at ?? null },
      ])
    )

    const drogueriaNameMap = new Map((droguerias || []).map((d) => [d.id, d.nombre]))

    const usuarios: PlatformUserOverview[] = (profiles || []).map((p) => {
      const authInfo = authUserMap.get(p.id)
      const drogueriaNombre =
        p.role === 'superadmin' && !p.drogueria_id
          ? 'Plataforma (Global)'
          : p.drogueria_id
            ? drogueriaNameMap.get(p.drogueria_id) || 'Sin asignar'
            : 'Sin asignar'

      return {
        id: p.id,
        email: authInfo?.email ?? null,
        username: p.username,
        full_name: p.full_name,
        role: p.role,
        status: p.status,
        drogueria_id: p.drogueria_id,
        drogueria_nombre: drogueriaNombre,
        created_at: p.created_at,
        last_sign_in_at: authInfo?.last_sign_in_at ?? null,
      }
    })

    // Cuentas de Auth sin perfil (por ejemplo, registros abiertos antes de cerrar el
    // signup): no pueden entrar hasta que el superadmin les asigne droguería y rol.
    const profileIds = new Set((profiles || []).map((p) => p.id))
    for (const u of authUsersRes.users) {
      if (profileIds.has(u.id)) continue
      const metaName = u.user_metadata?.full_name
      usuarios.push({
        id: u.id,
        email: u.email ?? null,
        username: u.email?.split('@')[0] || u.id.slice(0, 8),
        full_name: typeof metaName === 'string' && metaName.trim() ? metaName.trim() : null,
        role: null,
        status: 'sin_perfil',
        drogueria_id: null,
        drogueria_nombre: 'Sin perfil (asignar droguería)',
        created_at: u.created_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
      })
    }

    const latest = (a: string | null, b: string | null) => {
      if (!a) return b
      if (!b) return a
      return new Date(b).getTime() > new Date(a).getTime() ? b : a
    }

    const drogueriasOverview: DrogueriaOverview[] = (droguerias || []).map((d) => {
      const tenantUsers = usuarios.filter((u) => u.drogueria_id === d.id)
      const m = metricasMap.get(d.id)

      let ultimaActividad: string | null = latest(d.created_at, m?.ultima_factura_at ?? null)
      for (const u of tenantUsers) {
        ultimaActividad = latest(ultimaActividad, u.last_sign_in_at)
      }

      return {
        id: d.id,
        nombre: d.nombre,
        subdominio: d.subdominio,
        url_personalizada: d.url_personalizada ?? null,
        nit: d.nit ?? null,
        direccion: d.direccion ?? null,
        telefono: d.telefono ?? null,
        regimen: d.regimen ?? null,
        estado: d.estado,
        plan: d.plan,
        max_usuarios: d.max_usuarios,
        fecha_vencimiento: d.fecha_vencimiento ?? null,
        motivo_suspension: d.motivo_suspension ?? null,
        created_at: d.created_at,
        admins: tenantUsers
          .filter((u) => u.role === 'admin' || u.role === 'superadmin')
          .map((u) => ({
            id: u.id,
            full_name: u.full_name,
            username: u.username,
            email: u.email,
            status: u.status,
            role: u.role,
          })),
        usuariosTotal: tenantUsers.length,
        usuariosActivos: tenantUsers.filter((u) => u.status === 'activo' && u.role !== 'superadmin').length,
        productosCount: Number(m?.productos_count ?? 0),
        facturasCount: Number(m?.facturas_count ?? 0),
        clientesCount: Number(m?.clientes_count ?? 0),
        comprasCount: Number(m?.compras_count ?? 0),
        cajasAbiertas: Number(m?.cajas_abiertas ?? 0),
        volumenFacturado: Number(m?.volumen_facturado ?? 0),
        ultimaActividad,
      }
    })

    const volumenTotal = drogueriasOverview.reduce((acc, d) => acc + d.volumenFacturado, 0)

    const apiKeys: PlatformApiKeyOverview[] = (apiKeysRows || []).map((k) => ({
      id: k.id,
      drogueria_id: k.drogueria_id,
      drogueria_nombre: drogueriaNameMap.get(k.drogueria_id) || 'Desconocida',
      nombre: k.nombre,
      key_prefix: k.key_prefix,
      scopes: k.scopes || [],
      estado: k.estado,
      last_used_at: k.last_used_at ?? null,
      expires_at: k.expires_at ?? null,
      created_at: k.created_at,
    }))

    return {
      success: true,
      data: {
        droguerias: drogueriasOverview,
        usuarios,
        apiKeys,
        resumenGlobal: {
          totalDroguerias: drogueriasOverview.length,
          totalUsuarios: usuarios.length,
          usuariosActivos: usuarios.filter((u) => u.status === 'activo').length,
          totalProductos: drogueriasOverview.reduce((acc, d) => acc + d.productosCount, 0),
          totalFacturas: drogueriasOverview.reduce((acc, d) => acc + d.facturasCount, 0),
          volumenTotal,
        },
      },
    }
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error al cargar resumen de plataforma',
    }
  }
}

async function checkDrogueriaUserLimit(
  adminClient: ReturnType<typeof getAdminClient>,
  drogueriaId: string,
  excludeUserId?: string
): Promise<string | null> {
  const { data: drogueria } = await adminClient
    .from('droguerias')
    .select('nombre, max_usuarios')
    .eq('id', drogueriaId)
    .single()

  if (!drogueria) return 'La droguería seleccionada no existe.'

  let query = adminClient
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('drogueria_id', drogueriaId)
    .eq('status', 'activo')
    .neq('role', 'superadmin')

  if (excludeUserId) {
    query = query.neq('id', excludeUserId)
  }

  const { count } = await query
  if ((count ?? 0) >= drogueria.max_usuarios) {
    return `La droguería "${drogueria.nombre}" alcanzó el límite de ${drogueria.max_usuarios} usuarios activos de su plan.`
  }

  return null
}

export async function createDrogueria(input: DrogueriaInput) {
  try {
    const auth = await requireSuperAdmin()
    if (!auth.ok) return { success: false, error: auth.error }

    const parsed = DrogueriaSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join(', ') }
    }

    const adminClient = getAdminClient()
    const v = parsed.data
    const { data, error } = await adminClient
      .from('droguerias')
      .insert({
        nombre: v.nombre,
        subdominio: v.subdominio,
        url_personalizada: v.url_personalizada || null,
        nit: v.nit || null,
        direccion: v.direccion || null,
        telefono: v.telefono || null,
        regimen: v.regimen || null,
        plan: v.plan,
        estado: v.estado,
        max_usuarios: v.max_usuarios,
        fecha_vencimiento: v.fecha_vencimiento || null,
        motivo_suspension: v.estado === 'suspendido' ? v.motivo_suspension || null : null,
      })
      .select()
      .single()

    if (error) return { success: false, error: error.message }

    invalidateTenantHostCache()
    revalidatePath('/droguerias')
    return { success: true, data }
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error al crear la droguería',
    }
  }
}

export async function updateDrogueria(id: string, input: DrogueriaInput) {
  try {
    const auth = await requireSuperAdmin()
    if (!auth.ok) return { success: false, error: auth.error }

    const parsed = DrogueriaSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join(', ') }
    }

    const adminClient = getAdminClient()
    const v = parsed.data
    const { data, error } = await adminClient
      .from('droguerias')
      .update({
        nombre: v.nombre,
        subdominio: v.subdominio,
        url_personalizada: v.url_personalizada || null,
        nit: v.nit || null,
        direccion: v.direccion || null,
        telefono: v.telefono || null,
        regimen: v.regimen || null,
        plan: v.plan,
        estado: v.estado,
        max_usuarios: v.max_usuarios,
        fecha_vencimiento: v.fecha_vencimiento || null,
        motivo_suspension: v.estado === 'suspendido' ? v.motivo_suspension || null : null,
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return { success: false, error: error.message }

    invalidateMiddlewareProfileCache()
    invalidateTenantHostCache()
    revalidatePath('/droguerias')
    revalidatePath('/', 'layout')
    return { success: true, data }
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error al actualizar la droguería',
    }
  }
}

export async function toggleDrogueriaStatus(input: ToggleDrogueriaStatusInput) {
  try {
    const auth = await requireSuperAdmin()
    if (!auth.ok) return { success: false, error: auth.error }

    const parsed = ToggleDrogueriaStatusSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join(', ') }
    }

    const v = parsed.data
    const adminClient = getAdminClient()
    const { error } = await adminClient
      .from('droguerias')
      .update({
        estado: v.estado,
        motivo_suspension: v.estado === 'suspendido' ? v.motivo_suspension || null : null,
      })
      .eq('id', v.drogueria_id)

    if (error) return { success: false, error: error.message }

    invalidateMiddlewareProfileCache()
    invalidateTenantHostCache()
    revalidatePath('/droguerias')
    revalidatePath('/', 'layout')
    return { success: true }
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error al cambiar el estado de la droguería',
    }
  }
}

export async function createUserForDrogueria(input: CreateTenantUserInput) {
  try {
    const auth = await requireSuperAdmin()
    if (!auth.ok) return { success: false, error: auth.error }

    const parsed = CreateTenantUserSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join(', ') }
    }

    const adminClient = getAdminClient()
    const v = parsed.data
    const finalDrogueriaId = v.role === 'superadmin' ? null : (v.drogueria_id ?? null)

    if (v.role !== 'superadmin' && finalDrogueriaId) {
      const limitErr = await checkDrogueriaUserLimit(adminClient, finalDrogueriaId)
      if (limitErr) return { success: false, error: limitErr }
    }

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email: v.email,
      password: v.password,
      email_confirm: true,
      user_metadata: {
        full_name: v.full_name,
        username: v.username,
        role: v.role,
        ...(finalDrogueriaId ? { drogueria_id: finalDrogueriaId } : {}),
      },
    })

    if (createErr || !created.user) {
      return { success: false, error: createErr?.message || 'No se pudo crear el usuario' }
    }

    const { error: profileErr } = await adminClient.from('profiles').upsert(
      {
        id: created.user.id,
        username: v.username,
        full_name: v.full_name,
        role: v.role,
        status: 'activo',
        drogueria_id: finalDrogueriaId,
      },
      { onConflict: 'id' }
    )

    if (profileErr) {
      // Sin perfil válido la cuenta no sirve: se elimina para no dejar usuarios huérfanos.
      const { error: cleanupErr } = await adminClient.auth.admin.deleteUser(created.user.id)
      if (cleanupErr) console.error('No se pudo limpiar el usuario huérfano:', cleanupErr)
      return {
        success: false,
        error:
          profileErr.code === '23505'
            ? 'El nombre de usuario ya está en uso.'
            : profileErr.code === 'P0001'
              ? profileErr.message
              : 'No se pudo crear el perfil del usuario.',
      }
    }

    revalidatePath('/droguerias')
    revalidatePath('/usuarios')
    return { success: true }
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error al crear el usuario',
    }
  }
}

async function crearPerfilFaltante(
  adminClient: ReturnType<typeof getAdminClient>,
  userId: string,
  datos: {
    drogueria_id: string | null
    role: AssignUserInput['role']
    status: AssignUserInput['status']
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: authData, error: authErr } = await adminClient.auth.admin.getUserById(userId)
  if (authErr || !authData?.user) return { ok: false, error: 'La cuenta no existe en Auth.' }

  const user = authData.user
  const local = (user.email || '')
    .split('@')[0]
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 30)
  const base = local.length >= 3 ? local : `usuario_${userId.slice(0, 8)}`
  const metaName = user.user_metadata?.full_name
  const fullName =
    typeof metaName === 'string' && metaName.trim() ? metaName.trim().slice(0, 120) : base

  // El nombre de usuario es único en toda la plataforma: si está tomado se agrega un sufijo.
  for (const username of [base, `${base}_${userId.slice(0, 4)}`, `${base}_${userId.slice(0, 8)}`]) {
    const { error } = await adminClient.from('profiles').insert({
      id: userId,
      username,
      full_name: fullName,
      role: datos.role,
      status: datos.status,
      drogueria_id: datos.drogueria_id,
    })
    if (!error) return { ok: true }
    if (error.code === 'P0001') return { ok: false, error: error.message }
    if (error.code !== '23505') return { ok: false, error: 'No se pudo crear el perfil del usuario.' }

    // 23505: o el nombre está tomado, o el perfil se creó en paralelo.
    const { data: existente } = await adminClient.from('profiles').select('id').eq('id', userId).maybeSingle()
    if (existente) {
      const { error: updErr } = await adminClient
        .from('profiles')
        .update({ drogueria_id: datos.drogueria_id, role: datos.role, status: datos.status })
        .eq('id', userId)
      if (!updErr) return { ok: true }
      return {
        ok: false,
        error: updErr.code === 'P0001' ? updErr.message : 'No se pudo actualizar el usuario.',
      }
    }
  }

  return { ok: false, error: 'No hay un nombre de usuario libre para esta cuenta.' }
}

export async function assignUserDrogueriaAndRole(input: AssignUserInput) {
  try {
    const auth = await requireSuperAdmin()
    if (!auth.ok) return { success: false, error: auth.error }

    const parsed = AssignUserSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join(', ') }
    }

    const v = parsed.data
    if (v.user_id === auth.user.id && (v.status !== 'activo' || v.role !== 'superadmin')) {
      return {
        success: false,
        error: 'No puedes desactivar ni quitar privilegios a tu propia cuenta de superadmin.',
      }
    }

    const adminClient = getAdminClient()
    const finalDrogueriaId = v.role === 'superadmin' ? null : (v.drogueria_id ?? null)

    if (v.role !== 'superadmin' && v.status === 'activo' && finalDrogueriaId) {
      const limitErr = await checkDrogueriaUserLimit(adminClient, finalDrogueriaId, v.user_id)
      if (limitErr) return { success: false, error: limitErr }
    }

    const { data: updatedRows, error } = await adminClient
      .from('profiles')
      .update({
        drogueria_id: finalDrogueriaId,
        role: v.role,
        status: v.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', v.user_id)
      .select('id')

    if (error) {
      return { success: false, error: error.code === 'P0001' ? error.message : 'No se pudo actualizar el usuario.' }
    }

    // Cuenta de Auth sin perfil: se crea el perfil (antes el UPDATE afectaba 0 filas
    // y la pantalla decía "actualizado" sin cambiar nada).
    if (!updatedRows || updatedRows.length === 0) {
      const created = await crearPerfilFaltante(adminClient, v.user_id, {
        drogueria_id: finalDrogueriaId,
        role: v.role,
        status: v.status,
      })
      if (!created.ok) return { success: false, error: created.error }
    }

    invalidateMiddlewareProfileCache(v.user_id)
    revalidatePath('/droguerias')
    revalidatePath('/usuarios')
    revalidatePath('/', 'layout')
    return { success: true }
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error al reasignar usuario',
    }
  }
}

export async function createApiKeyForDrogueria(input: CreateApiKeyInput): Promise<{
  success: boolean
  rawKey?: string
  keyPrefix?: string
  error?: string
}> {
  try {
    const auth = await requireSuperAdmin()
    if (!auth.ok) return { success: false, error: auth.error }

    const parsed = CreateApiKeySchema.safeParse(input)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join(', ') }
    }

    const v = parsed.data
    const adminClient = getAdminClient()
    const { rawKey, keyPrefix, keyHash } = generateApiKeyPair()

    const { error } = await adminClient.from('api_keys').insert({
      drogueria_id: v.drogueria_id,
      nombre: v.nombre,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      scopes: v.scopes,
      estado: 'activa',
      created_by: auth.user.id,
      expires_at: v.expires_at ? `${v.expires_at}T23:59:59.999Z` : null,
    })

    if (error) return { success: false, error: error.message }

    revalidatePath('/droguerias')
    return { success: true, rawKey, keyPrefix }
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error al generar API Key',
    }
  }
}

export async function revokeApiKey(apiKeyId: string): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const auth = await requireSuperAdmin()
    if (!auth.ok) return { success: false, error: auth.error }

    const adminClient = getAdminClient()
    const { error } = await adminClient
      .from('api_keys')
      .update({ estado: 'revocada' })
      .eq('id', apiKeyId)

    if (error) return { success: false, error: error.message }

    revalidatePath('/droguerias')
    return { success: true }
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error al revocar API Key',
    }
  }
}

export async function switchSuperAdminWorkspace(drogueriaId: string | null): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const auth = await requireSuperAdmin()
    if (!auth.ok) return { success: false, error: auth.error }

    const adminClient = getAdminClient()
    const { error } = await adminClient
      .from('profiles')
      .update({
        drogueria_id: drogueriaId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', auth.user.id)

    if (error) return { success: false, error: error.message }

    invalidateMiddlewareProfileCache(auth.user.id)
    revalidatePath('/', 'layout')
    revalidatePath('/droguerias')
    revalidatePath('/dashboard')
    revalidatePath('/inventario')
    revalidatePath('/facturas')
    return { success: true }
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'No se pudo cambiar la sede activa',
    }
  }
}

export async function resetPlatformUserPassword(input: {
  user_id: string
  password: string
}): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const auth = await requireSuperAdmin()
    if (!auth.ok) return { success: false, error: auth.error }

    if (!input.user_id || !input.password || input.password.length < 8 || input.password.length > 72) {
      return { success: false, error: 'La contraseña debe tener entre 8 y 72 caracteres' }
    }

    const adminClient = getAdminClient()
    const { error } = await adminClient.auth.admin.updateUserById(input.user_id, {
      password: input.password,
    })

    if (error) return { success: false, error: error.message }

    return { success: true }
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error al cambiar la contraseña del usuario',
    }
  }
}
