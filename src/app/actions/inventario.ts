'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Obtiene el inventario completo con datos de productos y laboratorios
 */
export async function getInventario() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vista_inventario_completo' as any)
    .select('*')
    .order('nombre_producto', { ascending: true })

  if (error) {
    console.error('Error fetching inventory:', JSON.stringify(error, null, 2))
    return []
  }

  return data
}

/**
 * Obtiene el historial de auditoría de un producto
 */
export async function getAuditoria(inventarioId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('auditoria_inventario' as any)
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
    .select('id, nombre')
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
    .from('vista_inventario_completo' as any)
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
  const { data, error } = await supabase
    .from('laboratorios')
    .insert({ nombre })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Procesa la carga o actualización de inventario con Auditoría Forense
 */
export async function upsertInventario(data: {
  id?: string,
  producto_id: string,
  codigo: string,
  nombre: string,
  principio_activo?: string,
  laboratorio_id: string,
  fecha_vencimiento: string,
  cajas: number,
  blisters: number,
  unidades: number,
  precio_caja: number,
  precio_blister: number,
  precio_unidad: number,
  porcentaje_ganancia: number,
  margen_blister: number,
  margen_unidad: number,
  lote?: string,
  registro_invima?: string,
  seccion?: string,
  ubicacion?: string,
  stock_minimo: number
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  // 1. Obtener estado previo para auditoría
  let oldData: any = null
  if (data.id) {
    const { data: existing } = await supabase
      .from('inventario')
      .select('*')
      .eq('id', data.id)
      .single()
    oldData = existing
  }

  // 2. Lógica de Producto (Auto-creación si no existe)
  let finalProductoId = data.producto_id

  if (!finalProductoId || finalProductoId === '') {
    // Intentar buscar por código primero
    const { data: existingProd } = await supabase
      .from('productos')
      .select('id')
      .eq('codigo', data.codigo)
      .single()

    if (existingProd) {
      finalProductoId = existingProd.id
      await supabase.from('productos').update({ principio_activo: data.principio_activo || null, nombre: data.nombre }).eq('id', finalProductoId)
    } else {
      // Crear producto nuevo automáticamente
      const { data: newProd, error: prodError } = await supabase
        .from('productos')
        .insert({
          codigo: data.codigo,
          nombre: data.nombre,
          principio_activo: data.principio_activo || null,
          laboratorio_id: data.laboratorio_id || null,
        })
        .select()
        .single()

      if (prodError) {
        return { success: false, error: `Error creando producto: ${prodError.message}` }
      }
      finalProductoId = newProd.id
    }
  } else {
    // Si ya existe el producto, actualizamos su principio activo y nombre
    await supabase.from('productos').update({ 
       principio_activo: data.principio_activo || null,
       nombre: data.nombre
    }).eq('id', finalProductoId)
  }

  // 3. Ejecutar Upsert en la tabla inventario con conflict explícito
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upsertPayload: any = {
    producto_id: finalProductoId,
    fecha_vencimiento: data.fecha_vencimiento || null,
    cajas: Number(data.cajas) || 0,
    blisters: Number(data.blisters) || 0,
    unidades: Number(data.unidades) || 0,
    stock_minimo: Number(data.stock_minimo) || 2,
    precio_caja: Number(data.precio_caja) || 0,
    precio_blister: Number(data.precio_blister) || 0,
    precio_unidad: Number(data.precio_unidad) || 0,
    porcentaje_ganancia: Number(data.porcentaje_ganancia) || 0,
    margen_blister: Number(data.margen_blister) || 0,
    margen_unidad: Number(data.margen_unidad) || 0,
    lote: data.lote || null,
    registro_invima: data.registro_invima || null,
    seccion: data.seccion || null,
    ubicacion: data.ubicacion || null,
    updated_at: new Date().toISOString(),
  }

  // Si hay un ID específico (edición), usarlo para hacer UPDATE directo
  if (data.id && data.id !== '') {
    upsertPayload.id = data.id
  }

  const { data: _upserted, error } = await supabase
    .from('inventario')
    .upsert(upsertPayload, { onConflict: 'producto_id' })
    .select()
    .single()
  const upserted: any = _upserted

  if (error) {
    console.error('Upsert Error:', JSON.stringify(error, null, 2))
    return { success: false, error: error.message }
  }

  // Fetch real operator name
  let operadorReal = 'Sistema'
  if (user?.id) {
    const { data: profile } = await supabase.from('profiles').select('full_name, username').eq('id', user.id).single()
    if (profile) {
      operadorReal = profile.full_name || profile.username || user.email || 'Admin'
    } else {
      operadorReal = user.email || 'Admin'
    }
  }

  // 4. Registrar Auditoría Forense
  const oldCajas = Number(oldData?.cajas) || 0
  const newCajas = Number(data.cajas) || 0
  const diffCajas = newCajas - oldCajas

  const oldBlisters = Number(oldData?.blisters) || 0
  const newBlisters = Number(data.blisters) || 0
  const diffBlisters = newBlisters - oldBlisters

  const oldUnidades = Number(oldData?.unidades) || 0
  const newUnidades = Number(data.unidades) || 0
  const diffUnidades = newUnidades - oldUnidades

  let accion = 'ACTUALIZACIÓN'
  if (!oldData) {
    accion = 'NUEVO INGRESO'
  } else if (diffCajas > 0 || diffBlisters > 0 || diffUnidades > 0) {
    accion = 'ENTRADA'
  } else if (diffCajas < 0 || diffBlisters < 0 || diffUnidades < 0) {
    accion = 'AJUSTE NEGATIVO'
  }
  
  let detalles = `Operación: ${accion} en ${data.nombre}. `
  
  const stockCambios = []
  if (diffCajas !== 0) stockCambios.push(`Cajas: ${oldCajas} → ${newCajas}`)
  if (diffBlisters !== 0) stockCambios.push(`Blísters: ${oldBlisters} → ${newBlisters}`)
  if (diffUnidades !== 0) stockCambios.push(`Unidades: ${oldUnidades} → ${newUnidades}`)
  
  if (stockCambios.length > 0) {
    detalles += `Stock: ${stockCambios.join(' | ')}. `
  }
  
  if (data.lote && data.lote !== oldData?.lote) detalles += `Lote: ${oldData?.lote || 'N/A'} → ${data.lote}. `
  
  // Precios
  if (Number(data.precio_caja) !== Number(oldData?.precio_caja)) detalles += `Precio caja: $${oldData?.precio_caja || 0} → $${data.precio_caja}. `
  if (Number(data.precio_blister) !== Number(oldData?.precio_blister)) detalles += `Precio blíster: $${oldData?.precio_blister || 0} → $${data.precio_blister}. `
  if (Number(data.precio_unidad) !== Number(oldData?.precio_unidad)) detalles += `Precio unidad: $${oldData?.precio_unidad || 0} → $${data.precio_unidad}. `
  
  // Márgenes
  if (Number(data.porcentaje_ganancia) !== Number(oldData?.porcentaje_ganancia)) detalles += `Margen caja: ${oldData?.porcentaje_ganancia || 0}% → ${data.porcentaje_ganancia}%. `
  if (Number(data.margen_blister) !== Number(oldData?.margen_blister)) detalles += `Margen blíster: ${oldData?.margen_blister || 0}% → ${data.margen_blister}%. `
  if (Number(data.margen_unidad) !== Number(oldData?.margen_unidad)) detalles += `Margen unidad: ${oldData?.margen_unidad || 0}% → ${data.margen_unidad}%. `

  if (data.seccion && data.seccion !== oldData?.seccion) detalles += `Sección: ${oldData?.seccion || 'N/A'} → ${data.seccion}. `
  if (data.ubicacion && data.ubicacion !== oldData?.ubicacion) detalles += `Ubicación: ${oldData?.ubicacion || 'N/A'} → ${data.ubicacion}. `

  const { error: auditError } = await supabase
    .from('auditoria_inventario' as any)
    .insert({
      inventario_id: upserted.id,
      operador: operadorReal,
      accion,
      valor_anterior: oldData ? JSON.stringify({ 
        cajas: oldData.cajas, blisters: oldData.blisters, unidades: oldData.unidades,
        precio_caja: oldData.precio_caja, precio_blister: oldData.precio_blister, precio_unidad: oldData.precio_unidad,
        margen_caja: oldData.porcentaje_ganancia, margen_blister: oldData.margen_blister, margen_unidad: oldData.margen_unidad,
        lote: oldData.lote 
      }) : '{}',
      valor_nuevo: JSON.stringify({ 
        cajas: upserted.cajas, blisters: upserted.blisters, unidades: upserted.unidades,
        precio_caja: upserted.precio_caja, precio_blister: upserted.precio_blister, precio_unidad: upserted.precio_unidad,
        margen_caja: upserted.porcentaje_ganancia, margen_blister: upserted.margen_blister, margen_unidad: upserted.margen_unidad,
        lote: upserted.lote 
      }),
      detalles: detalles.trim()
    })

  if (auditError) {
    console.error('Audit Insert Error:', JSON.stringify(auditError, null, 2))
  }

  revalidatePath('/inventario')
  return { success: true, data: upserted }
}

