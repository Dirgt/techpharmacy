'use server'

import '@/lib/validations/zod-es'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth/session'
import { createAdminClient } from '@/lib/supabase/admin'
import { invalidateMiddlewareProfileCache } from '@/lib/supabase/middleware'
import { mensajeErrorBD } from '@/lib/errors'

const TenantUserRoleSchema = z.enum(['admin', 'vendedor'])
const UserStatusSchema = z.enum(['activo', 'inactivo'])

const CreateTenantUserSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(72),
  full_name: z.string().trim().min(2).max(120),
  username: z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9._-]+$/),
  role: TenantUserRoleSchema,
})

const UpdateTenantUserSchema = z
  .object({
    full_name: z.string().trim().min(2).max(120).optional(),
    username: z.string().trim().min(2).max(40).regex(/^[a-zA-Z0-9._-]+$/).optional(),
    role: TenantUserRoleSchema.optional(),
    status: UserStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'No hay cambios válidos para guardar.')

function getManagedTenantId(profile: { drogueria_id: string | null }) {
  return profile.drogueria_id
}

async function logActividad(
  adminClient: ReturnType<typeof createAdminClient>,
  actorId: string,
  tenantId: string,
  accion: string,
  detalles: string,
  entidadId?: string
) {
  const { error } = await adminClient.from('logs_actividad').insert({
    drogueria_id: tenantId,
    usuario_id: actorId,
    accion,
    detalles,
    tipo_entidad: 'USUARIO',
    entidad_id: entidadId,
  })

  if (error) console.error('No se pudo registrar la actividad de usuario:', error)
}

export async function createTestUser(formData: FormData) {
  const adminCheck = await requireAdmin()
  if (!adminCheck.ok) return { error: adminCheck.error }

  const parsed = CreateTenantUserSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    full_name: formData.get('full_name'),
    username: formData.get('username'),
    role: formData.get('role'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Datos de usuario inválidos.' }
  }

  const tenantId = getManagedTenantId(adminCheck.profile)
  if (!tenantId || !adminCheck.profile.drogueria) {
    return { error: 'Selecciona una droguería antes de administrar sus usuarios.' }
  }

  const input = parsed.data
  const adminClient = createAdminClient()
  const [{ count, error: countError }, { data: usernameTaken, error: usernameError }] = await Promise.all([
    adminClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('drogueria_id', tenantId)
      .eq('status', 'activo')
      .neq('role', 'superadmin'),
    adminClient.from('profiles').select('id').eq('username', input.username).maybeSingle(),
  ])

  if (countError || usernameError) return { error: 'No se pudo validar el usuario. Intenta de nuevo.' }
  if (usernameTaken) return { error: 'El nombre de usuario ya está en uso. Elige otro.' }
  if ((count ?? 0) >= adminCheck.profile.drogueria.max_usuarios) {
    return {
      error: `Has alcanzado el límite de ${adminCheck.profile.drogueria.max_usuarios} usuarios activos de tu plan.`,
    }
  }

  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      full_name: input.full_name,
      username: input.username,
      role: input.role,
      drogueria_id: tenantId,
    },
  })

  if (authError || !authData.user) {
    console.error('No se pudo crear el usuario en Auth:', authError)
    return { error: 'No se pudo crear el usuario. Verifica que el correo no esté registrado.' }
  }

  const { error: profileError } = await adminClient.from('profiles').upsert(
    {
      id: authData.user.id,
      username: input.username,
      full_name: input.full_name,
      role: input.role,
      status: 'activo',
      drogueria_id: tenantId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  )

  if (profileError) {
    console.error('No se pudo crear el perfil del usuario:', profileError)
    const { error: cleanupError } = await adminClient.auth.admin.deleteUser(authData.user.id)
    if (cleanupError) console.error('No se pudo limpiar el usuario huérfano:', cleanupError)
    return {
      error:
        profileError.code === '23505'
          ? 'El nombre de usuario ya está en uso. Elige otro.'
          : mensajeErrorBD(profileError, 'No se pudo completar la creación del usuario.'),
    }
  }

  await logActividad(
    adminClient,
    adminCheck.user.id,
    tenantId,
    'CREAR_USUARIO',
    `Se creó el usuario ${input.full_name} (@${input.username}) con rol ${input.role}`,
    authData.user.id
  )

  revalidatePath('/usuarios')
  return { success: true }
}

export async function updateUser(id: string, formData: FormData) {
  const adminCheck = await requireAdmin()
  if (!adminCheck.ok) return { error: adminCheck.error }

  const idResult = z.string().uuid().safeParse(id)
  if (!idResult.success) return { error: 'Usuario inválido.' }

  const raw: Record<string, FormDataEntryValue> = {}
  for (const key of ['full_name', 'username', 'role', 'status'] as const) {
    const value = formData.get(key)
    if (value !== null) raw[key] = value
  }
  const parsed = UpdateTenantUserSchema.safeParse(raw)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || 'Cambios de usuario inválidos.' }
  }

  const tenantId = getManagedTenantId(adminCheck.profile)
  if (!tenantId || !adminCheck.profile.drogueria) {
    return { error: 'Selecciona una droguería antes de administrar sus usuarios.' }
  }

  const adminClient = createAdminClient()
  const { data: oldUser, error: targetError } = await adminClient
    .from('profiles')
    .select('id, username, full_name, role, status, drogueria_id')
    .eq('id', id)
    .eq('drogueria_id', tenantId)
    .single()

  if (targetError || !oldUser || oldUser.role === 'superadmin') {
    return { error: 'El usuario no existe en esta droguería o no puede ser administrado.' }
  }

  const updateData = parsed.data
  if (
    id === adminCheck.user.id &&
    (updateData.status === 'inactivo' || (updateData.role && updateData.role !== 'admin'))
  ) {
    return { error: 'No puedes desactivar o quitar privilegios a tu propia cuenta.' }
  }

  if (updateData.status === 'activo' && oldUser.status !== 'activo') {
    const { count, error: countError } = await adminClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('drogueria_id', tenantId)
      .eq('status', 'activo')
      .neq('role', 'superadmin')
      .neq('id', id)

    if (countError) return { error: 'No se pudo validar el límite de usuarios.' }
    if ((count ?? 0) >= adminCheck.profile.drogueria.max_usuarios) {
      return {
        error: `Has alcanzado el límite de ${adminCheck.profile.drogueria.max_usuarios} usuarios activos de tu plan.`,
      }
    }
  }

  const { error } = await adminClient
    .from('profiles')
    .update({ ...updateData, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('drogueria_id', tenantId)
    .neq('role', 'superadmin')

  if (error) {
    console.error('No se pudo actualizar el usuario:', error)
    return {
      error:
        error.code === '23505'
          ? 'El nombre de usuario ya está en uso. Elige otro.'
          : mensajeErrorBD(error, 'No se pudo actualizar el usuario.'),
    }
  }

  invalidateMiddlewareProfileCache(id)

  const cambios: string[] = []
  if (updateData.full_name && updateData.full_name !== oldUser.full_name) {
    cambios.push(`nombre: ${oldUser.full_name ?? ''} -> ${updateData.full_name}`)
  }
  if (updateData.role && updateData.role !== oldUser.role) {
    cambios.push(`rol: ${oldUser.role ?? ''} -> ${updateData.role}`)
  }
  if (updateData.status && updateData.status !== oldUser.status) {
    cambios.push(`estado: ${oldUser.status ?? ''} -> ${updateData.status}`)
  }

  if (cambios.length > 0) {
    await logActividad(
      adminClient,
      adminCheck.user.id,
      tenantId,
      'EDITAR_USUARIO',
      `Se actualizó el usuario @${oldUser.username}. Cambios: ${cambios.join(', ')}`,
      id
    )
  }

  revalidatePath('/usuarios')
  return { success: true }
}

export async function deleteUser(id: string) {
  const adminCheck = await requireAdmin()
  if (!adminCheck.ok) return { error: adminCheck.error }

  const idResult = z.string().uuid().safeParse(id)
  if (!idResult.success) return { error: 'Usuario inválido.' }
  if (id === adminCheck.user.id) return { error: 'No puedes eliminar tu propia cuenta.' }

  const tenantId = getManagedTenantId(adminCheck.profile)
  if (!tenantId) return { error: 'Selecciona una droguería antes de administrar sus usuarios.' }

  const adminClient = createAdminClient()
  const { data: target, error: targetError } = await adminClient
    .from('profiles')
    .select('id, full_name, username, role')
    .eq('id', id)
    .eq('drogueria_id', tenantId)
    .single()

  if (targetError || !target || target.role === 'superadmin') {
    return { error: 'El usuario no existe en esta droguería o no puede ser eliminado.' }
  }

  // Primero el perfil: si el usuario tiene ventas, cajas o turnos registrados, la base
  // lo impide (llave foránea) y se recomienda desactivarlo para conservar el historial.
  const { error: profileError } = await adminClient
    .from('profiles')
    .delete()
    .eq('id', id)
    .eq('drogueria_id', tenantId)
    .neq('role', 'superadmin')

  if (profileError) {
    console.error('No se pudo eliminar el perfil:', profileError)
    return {
      error:
        profileError.code === '23503'
          ? 'Este usuario tiene ventas, cajas o turnos registrados. Desactívalo en lugar de eliminarlo para conservar el historial.'
          : 'No se pudo eliminar el usuario.',
    }
  }

  invalidateMiddlewareProfileCache(id)

  const { error: authError } = await adminClient.auth.admin.deleteUser(id)
  if (authError) {
    // El perfil ya no existe, así que la cuenta no puede entrar a la aplicación.
    console.error('Se eliminó el perfil pero no la cuenta de acceso:', authError)
  }

  await logActividad(
    adminClient,
    adminCheck.user.id,
    tenantId,
    'ELIMINAR_USUARIO',
    `Se eliminó al usuario ${target.full_name ?? ''} (@${target.username})`,
    id
  )

  revalidatePath('/usuarios')
  return { success: true }
}

export async function resetAdminUserPassword(userId: string, newPassword: string) {
  const adminCheck = await requireAdmin()
  if (!adminCheck.ok) return { error: adminCheck.error }

  const parsed = z
    .object({ userId: z.string().uuid(), password: z.string().min(8).max(72) })
    .safeParse({ userId, password: newPassword })
  if (!parsed.success) return { error: 'Usuario o contraseña inválidos. Usa mínimo 8 caracteres.' }

  const tenantId = getManagedTenantId(adminCheck.profile)
  if (!tenantId) return { error: 'Selecciona una droguería antes de administrar sus usuarios.' }

  const adminClient = createAdminClient()
  const { data: target, error: targetError } = await adminClient
    .from('profiles')
    .select('id, role')
    .eq('id', parsed.data.userId)
    .eq('drogueria_id', tenantId)
    .single()

  if (targetError || !target || target.role === 'superadmin') {
    return { error: 'El usuario no existe en esta droguería o no puede ser modificado.' }
  }

  const { error } = await adminClient.auth.admin.updateUserById(parsed.data.userId, {
    password: parsed.data.password,
  })

  if (error) {
    console.error('No se pudo cambiar la contraseña:', error)
    return { error: 'No se pudo cambiar la contraseña del usuario.' }
  }

  await logActividad(
    adminClient,
    adminCheck.user.id,
    tenantId,
    'CAMBIO_CONTRASEÑA_ADMIN',
    `El administrador cambió la contraseña del usuario ${parsed.data.userId}`,
    parsed.data.userId
  )

  return { success: true }
}
