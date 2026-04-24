'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Valida si un usuario ya tiene un turno en una fecha específica
 */
async function checkTurnoConflict(usuario_id: string, fecha: string, excludeId?: string) {
  const supabase = await createClient()
  let query = supabase
    .from('cronogramas')
    .select('id, turno')
    .eq('usuario_id', usuario_id)
    .eq('fecha', fecha)

  if (excludeId) {
    query = query.neq('id', excludeId)
  }

  const { data } = await query
  return data && data.length > 0
}

export async function createTurno(formData: FormData) {
  const supabase = await createClient()
  
  const usuario_id = formData.get('usuario_id') as string
  const fecha = formData.get('fecha') as string
  const turno = formData.get('turno') as string

  // 1. Validar conflicto
  const hasConflict = await checkTurnoConflict(usuario_id, fecha)
  if (hasConflict) {
    return { error: 'Este empleado ya tiene un turno asignado para esta fecha.' }
  }

  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase.from('cronogramas').insert({
    usuario_id,
    fecha,
    turno,
    creado_por: user?.id
  })

  if (error) return { error: error.message }

  // Registro en logs
  await supabase.from('logs_actividad').insert({
    usuario_id: user?.id,
    accion: 'CREAR_TURNO',
    detalles: `Turno ${turno} creado para el ${fecha}`
  })

  revalidatePath('/cronograma')
  return { success: true }
}

export async function updateTurno(id: string, formData: FormData) {
  const supabase = await createClient()
  
  const fecha = formData.get('fecha') as string
  const turno = formData.get('turno') as string
  const usuario_id = formData.get('usuario_id') as string

  // 1. Validar conflicto (excluyendo el turno actual)
  const hasConflict = await checkTurnoConflict(usuario_id, fecha, id)
  if (hasConflict) {
    return { error: 'Conflicto detectado: El empleado ya tiene otra asignación ese día.' }
  }

  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('cronogramas')
    .update({ fecha, turno, usuario_id })
    .eq('id', id)

  if (error) return { error: error.message }

  await supabase.from('logs_actividad').insert({
    usuario_id: user?.id,
    accion: 'ACTUALIZAR_TURNO',
    detalles: `Turno ID ${id} actualizado a ${turno} en ${fecha}`
  })

  revalidatePath('/cronograma')
  return { success: true }
}

export async function deleteTurno(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase.from('cronogramas').delete().eq('id', id)
  if (error) return { error: error.message }

  await supabase.from('logs_actividad').insert({
    usuario_id: user?.id,
    accion: 'ELIMINAR_TURNO',
    detalles: `Turno ID ${id} eliminado`
  })

  revalidatePath('/cronograma')
  return { success: true }
}

/**
 * Clona todos los turnos del mes anterior al mes actual
 */
export async function clonePreviousMonth(targetDate: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  const target = new Date(targetDate)
  const prevMonth = new Date(target.getFullYear(), target.getMonth() - 1, 1)
  
  const startPrev = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 1).toISOString().split('T')[0]
  const endPrev = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).toISOString().split('T')[0]

  // 1. Obtener turnos del mes anterior
  const { data: oldTurnos, error: fetchError } = await supabase
    .from('cronogramas')
    .select('usuario_id, turno, fecha')
    .gte('fecha', startPrev)
    .lte('fecha', endPrev)

  if (fetchError) return { error: fetchError.message }
  if (!oldTurnos || oldTurnos.length === 0) return { error: 'No se encontraron turnos en el mes anterior para clonar.' }

  // 2. Preparar nuevos turnos ajustando la fecha al mes actual
  const newTurnos = oldTurnos.map(t => {
    const oldDate = new Date(t.fecha + 'T00:00:00')
    const newDate = new Date(target.getFullYear(), target.getMonth(), oldDate.getDate())
    
    // Validar que el día exista en el mes actual (ej: 31 de marzo -> abril tiene 30)
    if (newDate.getMonth() !== target.getMonth()) return null

    return {
      usuario_id: t.usuario_id,
      turno: t.turno,
      fecha: newDate.toISOString().split('T')[0],
      creado_por: user?.id
    }
  }).filter(Boolean)

  // 3. Insertar masivamente
  const { error: insertError } = await supabase.from('cronogramas').insert(newTurnos)
  
  if (insertError) return { error: insertError.message }

  revalidatePath('/cronograma')
  return { success: true, count: newTurnos.length }
}
