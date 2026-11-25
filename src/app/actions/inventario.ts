'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { UpsertInventarioSchema, UpsertInventarioInput } from '@/lib/validations/inventario.schema'
import { requireAdmin } from '@/lib/auth/session'
import type { CsvInventarioRow } from '@/lib/inventario/csv-import'
import { computeSellableStockFromLots } from '@/lib/inventario/fraccionamiento'

/**
 * Obtiene el inventario completo con datos de productos, laboratorios y lotes activos (FEFO)
 */
export async function getInventario() {
  const supabase = await createClient()
  const [{ data, error }, { data: productosFormula }, { data: lotesData }] = await Promise.all([
    supabase
      .from('vista_inventario_completo')
      .select('*')
      .order('nombre_producto', { ascending: true }),
    supabase.from('productos').select('id, requiere_formula'),
    supabase
      .from('inventario_lotes')
      .select('id, inventario_id, producto_id, lote, fecha_vencimiento, cajas, blisters, unidades, costo_caja, created_at')
      .order('fecha_vencimiento', { ascending: true }),
  ])

  if (error) {
    console.error('Error fetching inventory:', JSON.stringify(error, null, 2))
    return []
  }

  const formulaMap = new Map(
    (productosFormula || []).map((p) => [p.id, Boolean(p.requiere_formula)])
  )

  const lotesByInv = new Map<string, NonNullable<typeof lotesData>>()
  for (const lote of lotesData || []) {
    const arr = lotesByInv.get(lote.inventario_id) || []
    arr.push(lote)
    lotesByInv.set(lote.inventario_id, arr)
  }

  return (data || []).map((item) => {
    const itemLotes = item.inventario_id ? lotesByInv.get(item.inventario_id) || [] : []
    const summary = computeSellableStockFromLots(itemLotes, {
      lote: item.lote,
      fecha_vencimiento: item.fecha_vencimiento,
      cajas: item.cajas,
      blisters: item.blisters,
      unidades: item.unidades,
      precio_caja: item.precio_caja,
    })

    return {
      ...item,
      requiere_formula: item.producto_id ? formulaMap.get(item.producto_id) ?? false : false,
      lotes_activos: summary.lotes_ordenados,
      tiene_stock_vencido: summary.tiene_stock_vencido,
      todo_vencido: summary.todo_vencido,
    }
  })
}

export async function darBajaLote(loteId: string, motivo: string) {
  const supabase = await createClient()
  try {
    const auth = await requireAdmin()
    if (!auth.ok) throw new Error(auth.error)

    const { data, error } = await supabase.rpc('dar_baja_lote_tx', {
      p_lote_id: loteId,
      p_motivo: motivo.trim() || 'Baja por vencimiento o deterioro',
    })

    if (error) throw new Error(error.message)

    revalidatePath('/inventario')
    revalidatePath('/facturas')
    revalidatePath('/dashboard')
    revalidatePath('/reportes')
    return { success: true, data }
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'No se pudo dar de baja el lote',
    }
  }
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
    return { success: false, error: 'Datos inválidos: ' + validation.error.issues.map((e) => e.message).join(', ') }
  }

  const data = validation.data

  // 2. Ejecutar la Transacción vía RPC
  const { data: upserted, error } = await supabase.rpc('upsert_inventario_tx', {
    p_blisters: data.blisters,
    p_blisters_por_caja: data.blisters_por_caja,
    p_cajas: data.cajas,
    p_codigo: data.codigo,
    p_fecha_vencimiento: data.fecha_vencimiento || undefined,
    p_inventario_id: data.id || undefined,
    p_laboratorio_id: data.laboratorio_id || undefined,
    p_lote: data.lote || '',
    p_margen_blister: data.margen_blister,
    p_margen_unidad: data.margen_unidad,
    p_nombre: data.nombre,
    p_porcentaje_ganancia: data.porcentaje_ganancia,
    p_precio_blister: data.precio_blister,
    p_precio_caja: data.precio_caja,
    p_precio_unidad: data.precio_unidad,
    p_principio_activo: data.principio_activo || '',
    p_producto_id: data.producto_id || undefined,
    p_registro_invima: data.registro_invima || '',
    p_seccion: data.seccion || '',
    p_stock_minimo: data.stock_minimo,
    p_ubicacion: data.ubicacion || '',
    p_unidades: data.unidades,
    p_unidades_por_blister: data.unidades_por_blister
  })

  if (error) {
    console.error('Upsert Error (RPC):', JSON.stringify(error, null, 2))
    return { success: false, error: error.message }
  }

  const upsertedObj =
    typeof upserted === 'object' && upserted !== null ? (upserted as { producto_id?: string }) : null
  const finalProdId = data.producto_id || upsertedObj?.producto_id
  if (finalProdId) {
    await supabase
      .from('productos')
      .update({ requiere_formula: Boolean(data.requiere_formula) })
      .eq('id', finalProdId)
  }

  // Refrescar toda la aplicación para que el módulo de Facturación (POS) tenga el stock más reciente
  revalidatePath('/', 'layout')
  
  return { success: true, data: upserted }
}

export async function importarInventarioMasivo(rows: CsvInventarioRow[]): Promise<{
  success: boolean
  importados: number
  fallidos: number
  errores: string[]
}> {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return { success: false, importados: 0, fallidos: 0, errores: [auth.error] }
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      success: false,
      importados: 0,
      fallidos: 0,
      errores: ['No hay filas válidas para importar.'],
    }
  }

  if (rows.length > 500) {
    return {
      success: false,
      importados: 0,
      fallidos: 0,
      errores: ['El límite por importación es de 500 productos. Divide el archivo en lotes.'],
    }
  }

  const supabase = await createClient()
  const { data: existingLabs } = await supabase.from('laboratorios').select('id, nombre')
  const labMap = new Map<string, string>(
    (existingLabs || []).map((l) => [l.nombre.trim().toUpperCase(), l.id])
  )

  let importados = 0
  let fallidos = 0
  const errores: string[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    let laboratorioId: string | undefined

    if (row.laboratorio) {
      const labKey = row.laboratorio.trim().toUpperCase()
      laboratorioId = labMap.get(labKey)
      if (!laboratorioId) {
        const createdLab = await createLaboratorio(row.laboratorio)
        if (createdLab.success && createdLab.data) {
          laboratorioId = createdLab.data.id
          labMap.set(labKey, createdLab.data.id)
        }
      }
    }

    const bpc = Math.max(1, row.blisters_por_caja || 1)
    const upb = Math.max(1, row.unidades_por_blister || 1)
    const precioBlister =
      row.precio_blister > 0 ? row.precio_blister : Number((row.precio_caja / bpc).toFixed(2))
    const precioUnidad =
      row.precio_unidad > 0 ? row.precio_unidad : Number((precioBlister / upb).toFixed(2))

    const validation = UpsertInventarioSchema.safeParse({
      codigo: row.codigo,
      nombre: row.nombre,
      principio_activo: row.principio_activo || '',
      laboratorio_id: laboratorioId || '',
      cajas: row.cajas,
      blisters: row.blisters,
      unidades: row.unidades,
      blisters_por_caja: bpc,
      unidades_por_blister: upb,
      precio_caja: row.precio_caja,
      precio_blister: precioBlister,
      precio_unidad: precioUnidad,
      porcentaje_ganancia: row.porcentaje_ganancia,
      margen_blister: row.margen_blister,
      margen_unidad: row.margen_unidad,
      lote: row.lote || '',
      fecha_vencimiento: row.fecha_vencimiento || null,
      registro_invima: row.registro_invima || '',
      seccion: row.seccion || '',
      ubicacion: row.ubicacion || '',
      stock_minimo: row.stock_minimo,
    })

    if (!validation.success) {
      fallidos++
      if (errores.length < 20) {
        errores.push(
          `${row.codigo || row.nombre}: ${validation.error.issues.map((e) => e.message).join(', ')}`
        )
      }
      continue
    }

    const d = validation.data
    const { data: upsertedRow, error } = await supabase.rpc('upsert_inventario_tx', {
      p_blisters: d.blisters,
      p_blisters_por_caja: d.blisters_por_caja,
      p_cajas: d.cajas,
      p_codigo: d.codigo,
      p_fecha_vencimiento: d.fecha_vencimiento || undefined,
      p_inventario_id: undefined,
      p_laboratorio_id: d.laboratorio_id || undefined,
      p_lote: d.lote || '',
      p_margen_blister: d.margen_blister,
      p_margen_unidad: d.margen_unidad,
      p_nombre: d.nombre,
      p_porcentaje_ganancia: d.porcentaje_ganancia,
      p_precio_blister: d.precio_blister,
      p_precio_caja: d.precio_caja,
      p_precio_unidad: d.precio_unidad,
      p_principio_activo: d.principio_activo || '',
      p_producto_id: undefined,
      p_registro_invima: d.registro_invima || '',
      p_seccion: d.seccion || '',
      p_stock_minimo: d.stock_minimo,
      p_ubicacion: d.ubicacion || '',
      p_unidades: d.unidades,
      p_unidades_por_blister: d.unidades_por_blister,
    })

    if (error) {
      fallidos++
      if (errores.length < 20) {
        errores.push(`${row.codigo}: ${error.message}`)
      }
    } else {
      const upsertedObj =
        typeof upsertedRow === 'object' && upsertedRow !== null
          ? (upsertedRow as { producto_id?: string })
          : null
      if (upsertedObj?.producto_id) {
        await supabase
          .from('productos')
          .update({ requiere_formula: Boolean(row.requiere_formula) })
          .eq('id', upsertedObj.producto_id)
      }
      importados++
    }
  }

  revalidatePath('/', 'layout')
  revalidatePath('/inventario')
  revalidatePath('/facturas')
  revalidatePath('/dashboard')

  return { success: importados > 0, importados, fallidos, errores }
}
