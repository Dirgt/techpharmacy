'use server'

import { createClient } from '@/lib/supabase/server'
import { ProveedorInput, ProveedorSchema, GastoInput, GastoSchema, CompraInput, CompraSchema } from '@/lib/validations/tesoreria.schema'
import { revalidatePath } from 'next/cache'
import { requireActiveUser, requireAdmin } from '@/lib/auth/session'

export async function getProveedores() {
  const auth = await requireActiveUser()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('proveedores')
    .select('*')
    .order('nombre', { ascending: true })

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function getCompras() {
  const auth = await requireActiveUser()
  if (!auth.ok) return { success: false, error: auth.error }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('compras')
    .select('*, proveedores(nombre), caja_sesiones(abierto_por), compra_detalles(id, cantidad, costo_unitario, subtotal, productos(nombre, codigo))')
    .order('created_at', { ascending: false })

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function createProveedor(input: ProveedorInput) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return { success: false, error: auth.error }

    const validated = ProveedorSchema.parse(input)
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('proveedores')
      .insert(validated)
      .select()
      .single()

    if (error) return { success: false, error: error.message }
    revalidatePath('/proveedores')
    return { success: true, data }
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Error de validación' }
  }
}

export async function updateProveedor(id: string, input: ProveedorInput) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return { success: false, error: auth.error }

    const validated = ProveedorSchema.parse(input)
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('proveedores')
      .update({
        nombre: validated.nombre,
        documento_nit: validated.documento_nit ?? null,
        telefono: validated.telefono ?? null,
        email: validated.email ?? null,
        dias_credito: validated.dias_credito
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return { success: false, error: error.message }
    revalidatePath('/proveedores')
    return { success: true, data }
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Error de validación' }
  }
}

export async function registrarGasto(input: GastoInput) {
  try {
    const auth = await requireActiveUser()
    if (!auth.ok) return { success: false, error: auth.error }

    const validated = GastoSchema.parse(input)
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('registrar_gasto_tx', {
      p_caja_sesion_id: validated.caja_sesion_id,
      p_concepto: validated.concepto,
      p_monto: validated.monto,
      p_tipo: validated.tipo,
      p_comprobante: validated.comprobante || undefined
    })

    if (error) return { success: false, error: error.message }

    revalidatePath('/facturas')
    revalidatePath('/reportes')
    return { success: true, data }
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Error de validación' }
  }
}

export async function registrarCompra(input: CompraInput) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return { success: false, error: auth.error }

    const validated = CompraSchema.parse(input)
    const supabase = await createClient()

    const detalles_rpc = validated.detalles.map(d => ({
      producto_id: d.producto_id,
      cantidad: d.cantidad,
      costo_unitario: d.costo_unitario
    }))

    const { data, error } = await supabase.rpc('registrar_compra_tx', {
      p_proveedor_id: validated.proveedor_id,
      p_numero_factura: validated.numero_factura,
      p_total: validated.total,
      p_estado_pago: validated.estado_pago,
      p_metodo_pago: validated.metodo_pago || 'efectivo',
      p_caja_sesion_id: (validated.estado_pago === 'pagado' && validated.metodo_pago === 'efectivo') ? (validated.caja_sesion_id as string) : (null as unknown as string),
      p_detalles: detalles_rpc,
      p_user_id: auth.user.id
    })

    if (error) return { success: false, error: error.message }

    revalidatePath('/compras')
    revalidatePath('/inventario')
    if (validated.estado_pago === 'pagado' && validated.metodo_pago === 'efectivo') {
      revalidatePath('/facturas')
      revalidatePath('/reportes')
    }

    return { success: true, data }
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Error de validación' }
  }
}

export async function pagarCompraProveedor(
  compraId: string,
  metodoPago: 'efectivo' | 'transferencia' | 'tarjeta',
  cajaSesionId?: string | null
) {
  try {
    const auth = await requireAdmin()
    if (!auth.ok) return { success: false, error: auth.error }

    const supabase = await createClient()
    const { data, error } = await supabase.rpc('pagar_compra_tx', {
      p_compra_id: compraId,
      p_metodo_pago: metodoPago,
      p_caja_sesion_id: metodoPago === 'efectivo' ? (cajaSesionId || undefined) : undefined,
    })

    if (error) return { success: false, error: error.message }

    revalidatePath('/compras')
    revalidatePath('/facturas')
    revalidatePath('/reportes')
    return { success: true, data }
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error al pagar la compra',
    }
  }
}
