'use server'

import '@/lib/validations/zod-es'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  ProveedorInput,
  ProveedorSchema,
  GastoInput,
  GastoSchema,
  CompraInput,
  CompraSchema,
} from '@/lib/validations/tesoreria.schema'
import { requireActiveUser, requireAdmin } from '@/lib/auth/session'
import { fetchAllPages } from '@/lib/supabase/fetch-all'
import { mensajeErrorBD, primerErrorZod } from '@/lib/errors'
import { addDaysToDateOnly, getBogotaDateString, getBogotaDayRange } from '@/lib/date/bogota'

const COMPRAS_SELECT =
  '*, proveedores(nombre, documento_nit), caja_sesiones(abierto_por), compra_detalles(id, cantidad, costo_unitario, subtotal, lote, fecha_vencimiento, productos(nombre, codigo))'

export async function getProveedores() {
  const auth = await requireActiveUser()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  const { data, error } = await fetchAllPages((from, to) =>
    supabase
      .from('proveedores')
      .select('*')
      .order('nombre', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
  )

  if (error) {
    console.error('Error consultando proveedores:', error)
    return { success: false, error: 'No se pudieron cargar los proveedores.' }
  }
  return { success: true, data }
}

/** Días de historial que carga la pantalla de compras (más todas las pendientes). */
const DIAS_HISTORIAL_COMPRAS = 90

export async function getCompras(opciones?: { completo?: boolean }) {
  const auth = await requireActiveUser()
  if (!auth.ok) return { success: false, error: auth.error }

  const completo = Boolean(opciones?.completo)
  const desde = getBogotaDayRange(addDaysToDateOnly(getBogotaDateString(), -DIAS_HISTORIAL_COMPRAS)).start

  const supabase = await createClient()
  const { data, error } = await fetchAllPages((from, to) => {
    let query = supabase.from('compras').select(COMPRAS_SELECT)
    // Sin esto la página descargaba todas las compras con su detalle en cada visita.
    if (!completo) query = query.or(`estado_pago.neq.pagado,created_at.gte."${desde}"`)
    return query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)
  })

  if (error) {
    console.error('Error consultando compras:', error)
    return { success: false, error: 'No se pudieron cargar las compras.' }
  }
  return { success: true, data, desde: completo ? null : desde }
}

export async function createProveedor(input: ProveedorInput) {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!auth.profile.drogueria_id) return { success: false, error: 'No hay una droguería activa.' }

  const parsed = ProveedorSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: primerErrorZod(parsed.error.issues) }
  const validated = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('proveedores')
    .insert({
      drogueria_id: auth.profile.drogueria_id,
      nombre: validated.nombre.trim(),
      documento_nit: validated.documento_nit?.trim() || null,
      telefono: validated.telefono?.trim() || null,
      email: validated.email?.trim() || null,
      dias_credito: validated.dias_credito,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creando proveedor:', error)
    return { success: false, error: mensajeErrorBD(error, 'No se pudo crear el proveedor.') }
  }
  revalidatePath('/proveedores')
  revalidatePath('/compras')
  return { success: true, data }
}

export async function updateProveedor(id: string, input: ProveedorInput) {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!auth.profile.drogueria_id) return { success: false, error: 'No hay una droguería activa.' }
  if (!z.string().uuid().safeParse(id).success) return { success: false, error: 'Proveedor inválido.' }

  const parsed = ProveedorSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: primerErrorZod(parsed.error.issues) }
  const validated = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('proveedores')
    .update({
      nombre: validated.nombre.trim(),
      documento_nit: validated.documento_nit?.trim() || null,
      telefono: validated.telefono?.trim() || null,
      email: validated.email?.trim() || null,
      dias_credito: validated.dias_credito,
    })
    .eq('id', id)
    .eq('drogueria_id', auth.profile.drogueria_id)
    .select()
    .single()

  if (error) {
    console.error('Error actualizando proveedor:', error)
    return { success: false, error: mensajeErrorBD(error, 'No se pudo actualizar el proveedor.') }
  }
  revalidatePath('/proveedores')
  revalidatePath('/compras')
  return { success: true, data }
}

export async function registrarGasto(input: GastoInput) {
  const auth = await requireActiveUser()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = GastoSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: primerErrorZod(parsed.error.issues) }
  const validated = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('registrar_gasto_tx', {
    p_caja_sesion_id: validated.caja_sesion_id,
    p_concepto: validated.concepto,
    p_monto: validated.monto,
    p_tipo: validated.tipo,
    p_comprobante: validated.comprobante || undefined,
  })

  if (error) {
    console.error('Error registrando gasto:', error)
    return { success: false, error: mensajeErrorBD(error, 'No se pudo registrar el gasto.') }
  }

  revalidatePath('/facturas')
  revalidatePath('/reportes')
  return { success: true, data }
}

export async function registrarCompra(input: CompraInput) {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = CompraSchema.safeParse(input)
  if (!parsed.success) return { success: false, error: primerErrorZod(parsed.error.issues) }
  const validated = parsed.data
  const pagaEnEfectivo = validated.estado_pago === 'pagado' && validated.metodo_pago === 'efectivo'

  if (pagaEnEfectivo && !validated.caja_sesion_id) {
    return { success: false, error: 'Para pagar en efectivo debes tener una caja abierta.' }
  }

  const detallesRpc = validated.detalles.map((d) => ({
    producto_id: d.producto_id,
    cantidad: d.cantidad,
    costo_unitario: d.costo_unitario,
    lote: d.lote?.trim() || '',
    fecha_vencimiento: d.fecha_vencimiento?.trim() || '',
  }))

  const supabase = await createClient()
  // El total lo calcula la base de datos a partir de los detalles (cantidad × costo).
  const { data, error } = await supabase.rpc('registrar_compra_v2_tx', {
    p_proveedor_id: validated.proveedor_id,
    p_numero_factura: validated.numero_factura.trim(),
    p_estado_pago: validated.estado_pago,
    p_metodo_pago: validated.metodo_pago || 'efectivo',
    p_caja_sesion_id: pagaEnEfectivo ? (validated.caja_sesion_id as string) : (null as unknown as string),
    p_detalles: detallesRpc,
    p_estado_recepcion: validated.estado_recepcion || 'conforme',
    p_observaciones_recepcion: validated.observaciones_recepcion?.trim() || undefined,
  })

  if (error) {
    console.error('Error registrando compra:', error)
    return { success: false, error: mensajeErrorBD(error, 'No se pudo registrar la compra.') }
  }

  revalidatePath('/compras')
  revalidatePath('/inventario')
  revalidatePath('/dashboard')
  if (pagaEnEfectivo) {
    revalidatePath('/facturas')
    revalidatePath('/reportes')
  }

  return { success: true, data }
}

export async function pagarCompraProveedor(
  compraId: string,
  metodoPago: 'efectivo' | 'transferencia' | 'tarjeta',
  cajaSesionId?: string | null
) {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = z
    .object({
      compraId: z.string().uuid(),
      metodoPago: z.enum(['efectivo', 'transferencia', 'tarjeta']),
      cajaSesionId: z.string().uuid().nullable().optional(),
    })
    .safeParse({ compraId, metodoPago, cajaSesionId: cajaSesionId || null })
  if (!parsed.success) return { success: false, error: 'Los datos del pago no son válidos.' }
  if (parsed.data.metodoPago === 'efectivo' && !parsed.data.cajaSesionId) {
    return { success: false, error: 'Para pagar en efectivo debes tener una caja abierta.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('pagar_compra_tx', {
    p_compra_id: parsed.data.compraId,
    p_metodo_pago: parsed.data.metodoPago,
    p_caja_sesion_id:
      parsed.data.metodoPago === 'efectivo' ? parsed.data.cajaSesionId || undefined : undefined,
  })

  if (error) {
    console.error('Error pagando compra:', error)
    return { success: false, error: mensajeErrorBD(error, 'No se pudo registrar el pago de la compra.') }
  }

  revalidatePath('/compras')
  revalidatePath('/facturas')
  revalidatePath('/reportes')
  revalidatePath('/dashboard')
  return { success: true, data }
}
