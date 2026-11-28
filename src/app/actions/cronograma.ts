'use server'

import '@/lib/validations/zod-es'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/session'

const UuidSchema = z.string().uuid()
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
// Debe coincidir con la restricción cronogramas_turno_check de la base de datos.
const TurnoSchema = z.enum(['Apertura', 'Cierre', 'Turno Largo'])

function toDateOnly(year: number, monthIndex: number, day: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

async function validateTenantUser(userId: string, tenantId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .eq('drogueria_id', tenantId)
    .eq('status', 'activo')
    .maybeSingle()
  return Boolean(data)
}

async function logTurno(
  actorId: string,
  tenantId: string,
  accion: string,
  detalles: string,
  entidadId?: string
) {
  const supabase = await createClient()
  const { error } = await supabase.from('logs_actividad').insert({
    drogueria_id: tenantId,
    usuario_id: actorId,
    accion,
    detalles,
    tipo_entidad: 'CRONOGRAMA',
    entidad_id: entidadId,
  })
  if (error) console.error('No se pudo registrar el cambio de turno:', error)
}

export async function createTurno(formData: FormData) {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: auth.error }
  const tenantId = auth.profile.drogueria_id
  if (!tenantId) return { error: 'No hay una droguería activa.' }

  const parsed = z
    .object({ usuario_id: UuidSchema, fecha: DateSchema, turno: TurnoSchema })
    .safeParse({
      usuario_id: formData.get('usuario_id'),
      fecha: formData.get('fecha'),
      turno: formData.get('turno'),
    })
  if (!parsed.success) return { error: 'Los datos del turno no son válidos.' }
  if (!(await validateTenantUser(parsed.data.usuario_id, tenantId))) {
    return { error: 'El empleado no pertenece a esta droguería o está inactivo.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cronogramas')
    .insert({ ...parsed.data, drogueria_id: tenantId })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') return { error: 'Este empleado ya tiene un turno asignado para esta fecha.' }
    console.error('No se pudo crear el turno:', error)
    return { error: 'No se pudo crear el turno.' }
  }

  await logTurno(
    auth.user.id,
    tenantId,
    'CREAR_TURNO',
    `Turno ${parsed.data.turno} creado para el ${parsed.data.fecha}`,
    data.id
  )
  revalidatePath('/cronograma')
  return { success: true }
}

export async function updateTurno(id: string, formData: FormData) {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: auth.error }
  const tenantId = auth.profile.drogueria_id
  if (!tenantId) return { error: 'No hay una droguería activa.' }

  const parsed = z
    .object({ id: UuidSchema, usuario_id: UuidSchema, fecha: DateSchema, turno: TurnoSchema })
    .safeParse({
      id,
      usuario_id: formData.get('usuario_id'),
      fecha: formData.get('fecha'),
      turno: formData.get('turno'),
    })
  if (!parsed.success) return { error: 'Los datos del turno no son válidos.' }
  if (!(await validateTenantUser(parsed.data.usuario_id, tenantId))) {
    return { error: 'El empleado no pertenece a esta droguería o está inactivo.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cronogramas')
    .update({
      fecha: parsed.data.fecha,
      turno: parsed.data.turno,
      usuario_id: parsed.data.usuario_id,
    })
    .eq('id', parsed.data.id)
    .eq('drogueria_id', tenantId)
    .select('id')
    .maybeSingle()

  if (error) {
    if (error.code === '23505') return { error: 'El empleado ya tiene otra asignación ese día.' }
    console.error('No se pudo actualizar el turno:', error)
    return { error: 'No se pudo actualizar el turno.' }
  }
  if (!data) return { error: 'Turno no encontrado en esta droguería.' }

  await logTurno(
    auth.user.id,
    tenantId,
    'ACTUALIZAR_TURNO',
    `Turno ${parsed.data.id} actualizado a ${parsed.data.turno} en ${parsed.data.fecha}`,
    parsed.data.id
  )
  revalidatePath('/cronograma')
  return { success: true }
}

export async function deleteTurno(id: string) {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: auth.error }
  const tenantId = auth.profile.drogueria_id
  const parsedId = UuidSchema.safeParse(id)
  if (!tenantId || !parsedId.success) return { error: 'Turno inválido.' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('cronogramas')
    .delete()
    .eq('id', parsedId.data)
    .eq('drogueria_id', tenantId)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('No se pudo eliminar el turno:', error)
    return { error: 'No se pudo eliminar el turno.' }
  }
  if (!data) return { error: 'Turno no encontrado en esta droguería.' }

  await logTurno(
    auth.user.id,
    tenantId,
    'ELIMINAR_TURNO',
    `Turno ${parsedId.data} eliminado`,
    parsedId.data
  )
  revalidatePath('/cronograma')
  return { success: true }
}

export async function clonePreviousMonth(targetDate: string) {
  const auth = await requireAdmin()
  if (!auth.ok) return { error: auth.error }
  const tenantId = auth.profile.drogueria_id
  const dateResult = DateSchema.safeParse(targetDate)
  if (!tenantId || !dateResult.success) return { error: 'El mes de destino no es válido.' }

  const [year, month, day] = dateResult.data.split('-').map(Number)
  const target = new Date(year, month - 1, day)
  const previous = new Date(year, month - 2, 1)
  const startPrev = toDateOnly(previous.getFullYear(), previous.getMonth(), 1)
  const lastPrevDay = new Date(previous.getFullYear(), previous.getMonth() + 1, 0).getDate()
  const endPrev = toDateOnly(previous.getFullYear(), previous.getMonth(), lastPrevDay)

  const supabase = await createClient()
  const { data: oldTurnos, error: fetchError } = await supabase
    .from('cronogramas')
    .select('usuario_id, turno, fecha')
    .eq('drogueria_id', tenantId)
    .gte('fecha', startPrev)
    .lte('fecha', endPrev)

  if (fetchError) {
    console.error('No se pudieron consultar los turnos anteriores:', fetchError)
    return { error: 'No se pudieron consultar los turnos del mes anterior.' }
  }
  if (!oldTurnos?.length) return { error: 'No se encontraron turnos en el mes anterior para clonar.' }

  const newTurnos = oldTurnos.flatMap((turno) => {
    const originalDay = Number(turno.fecha.slice(8, 10))
    const candidate = new Date(target.getFullYear(), target.getMonth(), originalDay)
    if (candidate.getMonth() !== target.getMonth()) return []
    return [
      {
        drogueria_id: tenantId,
        usuario_id: turno.usuario_id,
        turno: turno.turno,
        fecha: toDateOnly(candidate.getFullYear(), candidate.getMonth(), candidate.getDate()),
      },
    ]
  })

  const { data: inserted, error: insertError } = await supabase
    .from('cronogramas')
    .upsert(newTurnos, {
      onConflict: 'drogueria_id,usuario_id,fecha',
      ignoreDuplicates: true,
    })
    .select('id')

  if (insertError) {
    console.error('No se pudieron clonar los turnos:', insertError)
    return { error: 'No se pudieron clonar los turnos.' }
  }

  revalidatePath('/cronograma')
  return { success: true, count: inserted?.length ?? 0 }
}
