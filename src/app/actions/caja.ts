'use server'

import '@/lib/validations/zod-es'

import { cache } from 'react'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireActiveUser } from '@/lib/auth/session'
import { mensajeErrorBD } from '@/lib/errors'

const MoneySchema = z.number().finite().min(0).max(999_999_999_999)
const UuidSchema = z.string().uuid()

export const getSesionCajaAbierta = cache(async () => {
  const auth = await requireActiveUser()
  if (!auth.ok || !auth.profile.drogueria_id) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('caja_sesiones')
    .select('*')
    .eq('drogueria_id', auth.profile.drogueria_id)
    .in('estado', ['abierto', 'abierta'])
    .order('fecha_apertura', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('Error consultando la caja abierta:', error)
    return null
  }

  return data || null
})

export async function abrirCaja(montoApertura: number) {
  const auth = await requireActiveUser()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!auth.profile.drogueria_id) {
    return { success: false, error: 'No hay una droguería activa para abrir caja.' }
  }

  const amount = MoneySchema.safeParse(montoApertura)
  if (!amount.success) return { success: false, error: 'El monto de apertura no es válido.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('caja_sesiones')
    .insert({
      drogueria_id: auth.profile.drogueria_id,
      abierto_por: auth.user.id,
      monto_apertura: amount.data,
      // La restricción caja_sesiones_estado_check solo admite 'abierto' / 'cerrado'.
      estado: 'abierto',
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return { success: false, error: 'Ya existe una caja abierta en esta droguería.' }
    }
    console.error('Error al abrir caja:', error)
    return { success: false, error: 'No se pudo abrir la caja.' }
  }

  revalidatePath('/facturas')
  revalidatePath('/compras')
  revalidatePath('/reportes')
  return { success: true, caja: data }
}

export async function cerrarCaja(cajaId: string, montoCierre: number) {
  const auth = await requireActiveUser()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = z
    .object({ cajaId: UuidSchema, montoCierre: MoneySchema })
    .safeParse({ cajaId, montoCierre })
  if (!parsed.success) return { success: false, error: 'Los datos del cierre no son válidos.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('cerrar_caja_tx', {
    p_caja_id: parsed.data.cajaId,
    p_monto_cierre: parsed.data.montoCierre,
  })

  if (error) {
    console.error('Error al cerrar caja:', error)
    return { success: false, error: mensajeErrorBD(error, 'No se pudo cerrar la caja.') }
  }

  revalidatePath('/facturas')
  revalidatePath('/compras')
  revalidatePath('/reportes')
  return { success: true, data }
}
