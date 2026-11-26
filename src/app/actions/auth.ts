'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { isTenantSuspended } from '@/lib/tenant/domain'
import { resolveTenantWithSupabase } from '@/lib/tenant/resolve'
import { primeMiddlewareProfileCache } from '@/lib/supabase/middleware'
import {
  checkLoginRateLimit,
  clearLoginAttempts,
  recordFailedLoginAttempt,
} from '@/lib/auth/login-rate-limit'

export async function login(formData: FormData) {
  const email = (formData.get('email') as string | null)?.trim() || ''
  const password = (formData.get('password') as string | null) || ''

  if (!email || !password) {
    return { error: 'El correo y la contraseña son obligatorios' }
  }

  const headersList = await headers()
  const rawHost = headersList.get('x-forwarded-host') || headersList.get('host')
  const ip =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headersList.get('x-real-ip') ||
    'local'
  const rateLimitKey = `${email.toLowerCase()}:${ip}`

  const limitCheck = checkLoginRateLimit(rateLimitKey)
  if (!limitCheck.allowed) {
    const minutos = Math.max(1, Math.ceil(limitCheck.retryAfterSeconds / 60))
    return {
      error: `Demasiados intentos fallidos. Espera ${minutos} minuto(s) antes de intentar nuevamente.`,
    }
  }

  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error || !data.user) {
    recordFailedLoginAttempt(rateLimitKey)
    const msg = error?.message || ''
    if (msg && !msg.toLowerCase().includes('invalid login credentials')) {
      return { error: `Error de autenticación: ${msg}` }
    }
    return { error: 'Credenciales inválidas o cuenta inactiva' }
  }

  clearLoginAttempts(rateLimitKey)

  const [{ data: profile }, hostTenant] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'status, role, drogueria_id, drogueria:drogueria_id ( id, nombre, subdominio, estado, fecha_vencimiento, motivo_suspension )'
      )
      .eq('id', data.user.id)
      .single(),
    resolveTenantWithSupabase(supabase, rawHost),
  ])

  if (!profile || profile.status !== 'activo') {
    await supabase.auth.signOut()
    return { error: 'Tu cuenta se encuentra inactiva. Contacta al administrador.' }
  }

  const drogueriaRaw = Array.isArray(profile.drogueria)
    ? profile.drogueria[0]
    : profile.drogueria

  if (profile.role === 'superadmin') {
    if (hostTenant) {
      await supabase
        .from('profiles')
        .update({ drogueria_id: hostTenant.id, updated_at: new Date().toISOString() })
        .eq('id', data.user.id)
      primeMiddlewareProfileCache(data.user.id, {
        role: 'superadmin',
        status: profile.status,
        drogueriaId: hostTenant.id,
        drogueriaEstado: hostTenant.estado,
        drogueriaFechaVencimiento: hostTenant.fecha_vencimiento,
        drogueriaMotivoSuspension: hostTenant.motivo_suspension,
      })
      return { success: true, redirectTo: '/dashboard' }
    }
    primeMiddlewareProfileCache(data.user.id, {
      role: 'superadmin',
      status: profile.status,
      drogueriaId: profile.drogueria_id,
      drogueriaEstado: drogueriaRaw?.estado ?? null,
      drogueriaFechaVencimiento: drogueriaRaw?.fecha_vencimiento ?? null,
      drogueriaMotivoSuspension: drogueriaRaw?.motivo_suspension ?? null,
    })
    return {
      success: true,
      redirectTo: profile.drogueria_id ? '/dashboard' : '/droguerias',
    }
  }

  if (hostTenant && hostTenant.id !== profile.drogueria_id) {
    await supabase.auth.signOut()
    return {
      error: `Esta cuenta no pertenece a ${hostTenant.nombre}. Ingresa desde el enlace de tu droguería.`,
    }
  }

  const suspension = isTenantSuspended(drogueriaRaw)

  if (suspension.suspended) {
    await supabase.auth.signOut()
    return {
      error:
        suspension.reason ||
        'El servicio de tu droguería se encuentra suspendido. Contacta a administración.',
    }
  }

  primeMiddlewareProfileCache(data.user.id, {
    role: profile.role,
    status: profile.status,
    drogueriaId: profile.drogueria_id,
    drogueriaEstado: drogueriaRaw?.estado ?? null,
    drogueriaFechaVencimiento: drogueriaRaw?.fecha_vencimiento ?? null,
    drogueriaMotivoSuspension: drogueriaRaw?.motivo_suspension ?? null,
  })

  return { success: true, redirectTo: '/dashboard' }
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

export async function updateOwnDrogueriaFiscal(input: {
  nit?: string | null
  regimen?: string | null
  telefono?: string | null
  direccion?: string | null
  mensaje_pie_factura?: string | null
  prefijo_factura?: string | null
  resolucion_dian?: string | null
}) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('actualizar_datos_fiscales_sede', {
    p_nit: input.nit?.trim() || '',
    p_regimen: input.regimen?.trim() || '',
    p_telefono: input.telefono?.trim() || '',
    p_direccion: input.direccion?.trim() || '',
    p_mensaje_pie: input.mensaje_pie_factura?.trim() || '',
    p_prefijo_factura: input.prefijo_factura?.trim() || '',
    p_resolucion_dian: input.resolucion_dian?.trim() || '',
  })

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/configuracion')
  revalidatePath('/facturas')
  revalidatePath('/', 'layout')
  return { success: true }
}
