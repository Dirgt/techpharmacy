/* eslint-disable @typescript-eslint/no-explicit-any */
'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth/session'
import { invalidateMiddlewareProfileCache } from '@/lib/supabase/middleware'

async function logActividad(supabase: any, accion: string, detalles: string, entidad_id?: string) {
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    await supabase.from('logs_actividad').insert({
      usuario_id: user.id,
      accion,
      detalles,
      tipo_entidad: 'USUARIO',
      entidad_id
    })
  }
}

export async function createTestUser(formData: FormData) {
  const adminCheck = await requireAdmin()
  if (!adminCheck.ok) return { error: adminCheck.error }

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const full_name = formData.get('full_name') as string
  const username = formData.get('username') as string
  const role = formData.get('role') as string

  if (!email || !password || !username) {
    return { error: 'Los campos obligatorios están vacíos' }
  }

  const supabase = await createClient()

  if (adminCheck.profile.role !== 'superadmin' && adminCheck.profile.drogueria) {
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('drogueria_id', adminCheck.profile.drogueria.id)
      .eq('status', 'activo')

    if ((count ?? 0) >= adminCheck.profile.drogueria.max_usuarios) {
      return {
        error: `Has alcanzado el límite de ${adminCheck.profile.drogueria.max_usuarios} usuarios activos de tu plan.`,
      }
    }
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  let createdUserId: string | undefined

  if (serviceRoleKey) {
    const supabaseAdmin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        username,
        role,
        ...(adminCheck.profile.drogueria_id ? { drogueria_id: adminCheck.profile.drogueria_id } : {}),
      }
    })

    if (authError) {
      return { error: authError.message }
    }
    createdUserId = data.user?.id
  } else {
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name,
          username,
          role,
        }
      }
    })

    if (authError) {
      return { error: authError.message }
    }
    createdUserId = data.user?.id
  }

  if (createdUserId) {
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: createdUserId,
        username,
        full_name,
        role,
        status: 'activo'
      }, { onConflict: 'id' })

    if (!profileError) {
      await logActividad(
        supabase, 
        'CREAR_USUARIO', 
        `Se creó el usuario ${full_name} (@${username}) con rol ${role}`,
        createdUserId
      )
    }
  }

  revalidatePath('/usuarios')
  return { success: true }
}

export async function updateUser(id: string, formData: FormData) {
  const adminCheck = await requireAdmin()
  if (!adminCheck.ok) return { error: adminCheck.error }

  const supabase = await createClient()
  
  const updateData: any = {}
  if (formData.has('full_name')) updateData.full_name = formData.get('full_name')
  if (formData.has('username')) updateData.username = formData.get('username')
  if (formData.has('role')) updateData.role = formData.get('role')
  if (formData.has('status')) updateData.status = formData.get('status')

  if (
    id === adminCheck.user.id &&
    (updateData.status === 'inactivo' || (updateData.role && updateData.role !== 'admin'))
  ) {
    return { error: 'No puedes desactivar o quitar privilegios a tu propia cuenta.' }
  }
  
  updateData.updated_at = new Date().toISOString()

  // Obtener datos actuales para el log
  const { data: oldUser } = await supabase.from('profiles').select('*').eq('id', id).single()

  if (
    updateData.status === 'activo' &&
    oldUser?.status !== 'activo' &&
    adminCheck.profile.role !== 'superadmin' &&
    adminCheck.profile.drogueria
  ) {
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('drogueria_id', adminCheck.profile.drogueria.id)
      .eq('status', 'activo')
      .neq('id', id)

    if ((count ?? 0) >= adminCheck.profile.drogueria.max_usuarios) {
      return {
        error: `Has alcanzado el límite de ${adminCheck.profile.drogueria.max_usuarios} usuarios activos de tu plan.`,
      }
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  invalidateMiddlewareProfileCache(id)

  // Registrar en el log
  const cambios = []
  if (updateData.full_name && updateData.full_name !== oldUser?.full_name) cambios.push(`nombre: ${oldUser?.full_name} -> ${updateData.full_name}`)
  if (updateData.role && updateData.role !== oldUser?.role) cambios.push(`rol: ${oldUser?.role} -> ${updateData.role}`)
  if (updateData.status && updateData.status !== oldUser?.status) cambios.push(`estado: ${oldUser?.status} -> ${updateData.status}`)

  if (cambios.length > 0) {
    await logActividad(
      supabase, 
      'EDITAR_USUARIO', 
      `Se actualizó el usuario @${oldUser?.username}. Cambios: ${cambios.join(', ')}`,
      id
    )
  }

  revalidatePath('/usuarios')
  return { success: true }
}

export async function deleteUser(id: string) {
  const adminCheck = await requireAdmin()
  if (!adminCheck.ok) return { error: adminCheck.error }

  if (id === adminCheck.user.id) {
    return { error: 'No puedes eliminar tu propia cuenta.' }
  }

  const supabase = await createClient()

  const { data: userToDelete } = await supabase.from('profiles').select('full_name, username').eq('id', id).single()

  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

  invalidateMiddlewareProfileCache(id)

  await logActividad(
    supabase,
    'ELIMINAR_USUARIO',
    `Se eliminó al usuario ${userToDelete?.full_name} (@${userToDelete?.username})`,
    id
  )

  revalidatePath('/usuarios')
  return { success: true }
}

export async function resetAdminUserPassword(userId: string, newPassword: string) {
  const adminCheck = await requireAdmin()
  if (!adminCheck.ok) return { error: adminCheck.error }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return { error: 'Falta la clave maestra SUPABASE_SERVICE_ROLE_KEY en .env.local para cambiar contraseñas de otros usuarios.' }
  }
  
  if (newPassword.length < 6) {
    return { error: 'La contraseña debe tener al menos 6 caracteres' }
  }

  const supabaseAdmin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password: newPassword
  })

  if (error) return { error: error.message }

  const supabase = await createClient()
  await logActividad(supabase, 'CAMBIO_CONTRASEÑA_ADMIN', `El administrador cambió la contraseña del usuario ${userId}`)

  return { success: true }
}
