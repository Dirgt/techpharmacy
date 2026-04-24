'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getSesionCajaAbierta() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('caja_sesiones')
    .select('*')
    .eq('estado', 'abierto')
    .order('fecha_apertura', { ascending: false })
    .limit(1)
    .single()

  if (error && error.code !== 'PGRST116') { // PGRST116 is not found
    console.error('Error fetching caja:', error)
    return null
  }
  
  return data || null
}

export async function abrirCaja(montoApertura: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autenticado' }

  // Verificar si ya hay una caja abierta
  const existente = await getSesionCajaAbierta()
  if (existente) {
    return { success: false, error: 'Ya existe una caja abierta' }
  }

  const { data, error } = await supabase
    .from('caja_sesiones')
    .insert({
      abierto_por: user.id,
      monto_apertura: montoApertura,
      estado: 'abierto'
    })
    .select()
    .single()

  if (error) {
    console.error('Error al abrir caja:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/facturas')
  return { success: true, caja: data }
}

export async function cerrarCaja(cajaId: string, montoCierre: number) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('caja_sesiones')
    .update({
      estado: 'cerrado',
      monto_cierre: montoCierre,
      fecha_cierre: new Date().toISOString()
    })
    .eq('id', cajaId)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/facturas')
  return { success: true }
}
