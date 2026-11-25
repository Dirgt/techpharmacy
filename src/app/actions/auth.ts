'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isTenantSuspended } from '@/lib/tenant/domain'
import { resolveTenantWithSupabase } from '@/lib/tenant/resolve'

export async function login(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  if (!email || !password) {
    return { error: 'El correo y la contraseña son obligatorios' }
  }

  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error || !data.user) {
    return { error: 'Credenciales inválidas o cuenta inactiva' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'status, role, drogueria_id, drogueria:drogueria_id ( id, nombre, subdominio, estado, fecha_vencimiento, motivo_suspension )'
    )
    .eq('id', data.user.id)
    .single()

  if (!profile || profile.status !== 'activo') {
    await supabase.auth.signOut()
    return { error: 'Tu cuenta se encuentra inactiva. Contacta al administrador.' }
  }

  if (profile.role === 'superadmin') {
    redirect('/droguerias')
  }

  const headersList = await headers()
  const rawHost = headersList.get('x-forwarded-host') || headersList.get('host')
  const hostTenant = await resolveTenantWithSupabase(supabase, rawHost)

  if (hostTenant && hostTenant.id !== profile.drogueria_id) {
    await supabase.auth.signOut()
    return {
      error: `Esta cuenta no pertenece a ${hostTenant.nombre}. Ingresa desde el enlace de tu droguería.`,
    }
  }

  const drogueriaRaw = Array.isArray(profile.drogueria)
    ? profile.drogueria[0]
    : profile.drogueria
  const suspension = isTenantSuspended(drogueriaRaw)

  if (suspension.suspended) {
    await supabase.auth.signOut()
    return {
      error:
        suspension.reason ||
        'El servicio de tu droguería se encuentra suspendido. Contacta a administración.',
    }
  }

  redirect('/dashboard')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function changeOwnPassword(password: string) {
  const supabase = await createClient()

  if (!password || password.length < 6) {
    return { error: 'La contraseña debe tener al menos 6 caracteres' }
  }

  const { error } = await supabase.auth.updateUser({
    password: password,
  })

  if (error) {
    return { error: error.message }
  }

  return { success: true }
}
