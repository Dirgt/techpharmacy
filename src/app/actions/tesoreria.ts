'use server'

import { createClient } from '@/lib/supabase/server'
import { ProveedorInput, ProveedorSchema, GastoInput, GastoSchema, CompraInput, CompraSchema } from '@/lib/validations/tesoreria.schema'
import { revalidatePath } from 'next/cache'

export async function getProveedores() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('proveedores')
    .select('*')
    .order('nombre', { ascending: true })

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function getCompras() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('compras')
    .select('*, proveedores(nombre), caja_sesiones(abierto_por)')
    .order('created_at', { ascending: false })

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function createProveedor(input: ProveedorInput) {
  try {
    const validated = ProveedorSchema.parse(input)
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('proveedores')
      .insert(validated)
      .select()
      .single()

    if (error) return { success: false, error: error.message }
    revalidatePath('/dashboard/proveedores')
    return { success: true, data }
  } catch (error: any) {
    return { success: false, error: error.message || 'Error de validación' }
  }
}

export async function registrarGasto(input: GastoInput) {
  try {
    const validated = GastoSchema.parse(input)
    const supabase = await createClient()

    // Llamamos al RPC para asegurar la validez de la caja
    const { data, error } = await supabase.rpc('registrar_gasto_tx', {
      p_caja_sesion_id: validated.caja_sesion_id,
      p_concepto: validated.concepto,
      p_monto: validated.monto,
      p_tipo: validated.tipo,
      p_comprobante: validated.comprobante || undefined
    })

    if (error) return { success: false, error: error.message }
    
    // Invalidamos facturación porque ahí se muestra la caja y gastos
    revalidatePath('/dashboard/facturas')
    revalidatePath('/dashboard/reportes')
    return { success: true, data }
  } catch (error: any) {
    return { success: false, error: error.message || 'Error de validación' }
  }
}

export async function registrarCompra(input: CompraInput) {
  try {
    const validated = CompraSchema.parse(input)
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { success: false, error: 'No autorizado' }

    // Map para coincidir con el Composite Type "compra_detalle_input" de Postgres
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
      p_caja_sesion_id: (validated.estado_pago === 'pagado' && validated.metodo_pago === 'efectivo') ? (validated.caja_sesion_id as string) : (null as any),
      p_detalles: detalles_rpc,
      p_user_id: user.id
    })

    if (error) return { success: false, error: error.message }
    
    revalidatePath('/dashboard/compras')
    revalidatePath('/dashboard/inventario')
    if (validated.estado_pago === 'pagado' && validated.metodo_pago === 'efectivo') {
      revalidatePath('/dashboard/facturas')
      revalidatePath('/dashboard/reportes')
    }
    
    return { success: true, data }
  } catch (error: any) {
    return { success: false, error: error.message || 'Error de validación' }
  }
}
