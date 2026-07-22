'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { UpsertInventarioSchema, UpsertInventarioInput } from '@/lib/validations/inventario.schema'

/**
 * Obtiene el inventario completo con datos de productos y laboratorios
 */
export async function getInventario() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vista_inventario_completo')
    .select('*')
    .order('nombre_producto', { ascending: true })

  if (error) {
    console.error('Error fetching inventory:', JSON.stringify(error, null, 2))
    return []
  }

  return data
}

export async function getProductos() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('productos')
    .select('*')
    .order('nombre', { ascending: true })

  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

/**
 * Obtiene el historial de auditoría de un producto
 */
export async function getAuditoria(inventarioId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('auditoria_inventario')
    .select('*')
    .eq('inventario_id', inventarioId)
    .order('created_at', { ascending: false })
    
  if (error) {
    console.error('Error fetching audit logs:', error)
    return []
  }
  return data
}

/**
 * Obtiene la lista de laboratorios para el formulario
 */
export async function getLaboratorios() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('laboratorios')
    .select('*')
    .order('nombre', { ascending: true })

  if (error) {
    console.error('Error fetching labs:', error)
    return []
  }

  return data
}

/**
 * Busca un producto por su código de barras
 */
export async function buscarProductoPorCodigo(codigo: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vista_inventario_completo')
    .select('*')
    .eq('codigo', codigo)
    .single()

  if (error) return null
  return data
}

/**
 * Crea un nuevo laboratorio
 */
export async function createLaboratorio(nombre: string) {
  const supabase = await createClient()
  const cleanNombre = nombre.trim().toUpperCase()

  // Optimización Extrema: Usamos UPSERT con ON CONFLICT.
  // Esto delega la verificación y creación a PostgreSQL en UNA SOLA operación.
  // No hay riesgo de consumo excesivo en capas gratuitas porque es 1 solo request.
  const { data, error } = await supabase
    .from('laboratorios')
    .upsert({ nombre: cleanNombre }, { onConflict: 'nombre' })
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }
  return { success: true, data }
}

/**
 * Procesa la carga o actualización de inventario con Auditoría Forense usando una Transacción (RPC)
 */
export async function upsertInventario(rawData: UpsertInventarioInput) {
  const supabase = await createClient()

  // 1. Validar los datos de entrada con Zod
  const validation = UpsertInventarioSchema.safeParse(rawData)
  if (!validation.success) {
    return { success: false, error: 'Datos inválidos: ' + validation.error.issues.map((e: any) => e.message).join(', ') }
  }

  const data = validation.data

  // 2. Ejecutar la Transacción vía RPC
  const { data: upserted, error } = await supabase.rpc('upsert_inventario_tx', {
    p_blisters: data.blisters,
    p_cajas: data.cajas,
    p_blisters_por_caja: data.blisters_por_caja,
    p_unidades_por_blister: data.unidades_por_blister,
    p_codigo: data.codigo,
    p_fecha_vencimiento: data.fecha_vencimiento || null as unknown as string, // Cast required if nullable for dates in rpc if empty
    p_inventario_id: data.id || undefined,
    p_laboratorio_id: data.laboratorio_id || null as unknown as string,
    p_lote: data.lote || '',
    p_margen_blister: data.margen_blister,
    p_margen_unidad: data.margen_unidad,
    p_nombre: data.nombre,
    p_porcentaje_ganancia: data.porcentaje_ganancia,
    p_precio_blister: data.precio_blister,
    p_precio_caja: data.precio_caja,
    p_precio_unidad: data.precio_unidad,
    p_principio_activo: data.principio_activo || '',
    p_producto_id: data.producto_id || null as unknown as string,
    p_registro_invima: data.registro_invima || '',
    p_seccion: data.seccion || '',
    p_stock_minimo: data.stock_minimo,
    p_ubicacion: data.ubicacion || '',
    p_unidades: data.unidades
  })

  if (error) {
    console.error('Upsert Error (RPC):', JSON.stringify(error, null, 2))
    return { success: false, error: error.message }
  }

  revalidatePath('/inventario')
  return { success: true, data: upserted }
}
