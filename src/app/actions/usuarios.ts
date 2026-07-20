/* eslint-disable @typescript-eslint/no-explicit-any */
'use server'

import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

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
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const full_name = formData.get('full_name') as string
  const username = formData.get('username') as string
  const role = formData.get('role') as string

  if (!email || !password || !username) {
    return { error: 'Los campos obligatorios están vacíos' }
  }

  const supabase = await createClient()

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

  if (data.user) {
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: data.user.id,
        username,
        full_name,
        role,
        status: 'activo'
      })

    if (!profileError) {
      await logActividad(
        supabase, 
        'CREAR_USUARIO', 
        `Se creó el usuario ${full_name} (@${username}) con rol ${role}`,
        data.user.id
      )
    }
  }

  revalidatePath('/usuarios')
  return { success: true }
}

export async function updateUser(id: string, formData: FormData) {
  const supabase = await createClient()
  
  const updateData: any = {}
  if (formData.has('full_name')) updateData.full_name = formData.get('full_name')
  if (formData.has('username')) updateData.username = formData.get('username')
  if (formData.has('role')) updateData.role = formData.get('role')
  if (formData.has('status')) updateData.status = formData.get('status')
  
  updateData.updated_at = new Date().toISOString()

  // Obtener datos actuales para el log
  const { data: oldUser } = await supabase.from('profiles').select('*').eq('id', id).single()

  const { error } = await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

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
  const supabase = await createClient()

  const { data: userToDelete } = await supabase.from('profiles').select('full_name, username').eq('id', id).single()

  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', id)

  if (error) {
    return { error: error.message }
  }

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
