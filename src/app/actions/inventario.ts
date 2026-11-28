'use server'

import '@/lib/validations/zod-es'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { UpsertInventarioSchema, UpsertInventarioInput } from '@/lib/validations/inventario.schema'
import { requireActiveUser, requireAdmin } from '@/lib/auth/session'
import type { CsvInventarioRow } from '@/lib/inventario/csv-import'
import { fetchAllPages } from '@/lib/supabase/fetch-all'
import { mensajeErrorBD } from '@/lib/errors'

// Las mutaciones de inventario no llaman revalidatePath: las pantallas leen el
// catálogo local del navegador y lo sincronizan al terminar (ver src/lib/catalogo).
// Revalidar re-renderizaba la página completa en cada edición.

export async function darBajaLote(loteId: string, motivo: string) {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const parsed = z
    .object({ loteId: z.string().uuid(), motivo: z.string().trim().max(300) })
    .safeParse({ loteId, motivo: motivo || '' })
  if (!parsed.success) return { success: false, error: 'Lote o motivo inválido.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('dar_baja_lote_tx', {
    p_lote_id: parsed.data.loteId,
    p_motivo: parsed.data.motivo || 'Baja por vencimiento o deterioro',
  })

  if (error) {
    console.error('Error dando de baja el lote:', error)
    return { success: false, error: mensajeErrorBD(error, 'No se pudo dar de baja el lote.') }
  }

  return { success: true, data }
}

/**
 * Historial de un producto: auditoría de inventario más las ventas V2, que no
 * escriben una fila de auditoría por producto (se reconstruyen desde el detalle).
 */
export async function getAuditoria(inventarioId: string) {
  const auth = await requireAdmin()
  if (!auth.ok) return []
  if (!z.string().uuid().safeParse(inventarioId).success) return []

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('bitacora_inventario', {
    p_inventario_id: inventarioId,
    p_limite: 500,
  })

  if (error) {
    console.error('Error consultando auditoría:', error)
    return []
  }
  return data || []
}

/**
 * Obtiene la lista de laboratorios para el formulario
 */
export async function getLaboratorios() {
  const auth = await requireActiveUser()
  if (!auth.ok) return []

  const supabase = await createClient()
  const { data, error } = await fetchAllPages((from, to) =>
    supabase
      .from('laboratorios')
      .select('*')
      .order('nombre', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
  )

  if (error) {
    console.error('Error consultando laboratorios:', error)
    return []
  }
  return data
}

/**
 * Busca un producto por su código de barras
 */
export async function buscarProductoPorCodigo(codigo: string) {
  const auth = await requireActiveUser()
  if (!auth.ok) return null

  const clean = codigo.trim()
  if (!clean || clean.length > 80) return null

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('vista_inventario_completo')
    .select('*')
    .eq('codigo', clean)
    .maybeSingle()

  if (error) return null
  return data
}

/**
 * Crea un nuevo laboratorio (o devuelve el existente con el mismo nombre en la sede)
 */
export async function createLaboratorio(nombre: string) {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  if (!auth.profile.drogueria_id) return { success: false, error: 'No hay una droguería activa.' }

  const cleanNombre = nombre.trim().toUpperCase()
  if (!cleanNombre || cleanNombre.length > 120) {
    return { success: false, error: 'El nombre del laboratorio no es válido.' }
  }

  const supabase = await createClient()
  // Una sola operación: crea el laboratorio o reutiliza el existente de la misma sede.
  const { data, error } = await supabase
    .from('laboratorios')
    .upsert(
      { nombre: cleanNombre, drogueria_id: auth.profile.drogueria_id },
      { onConflict: 'drogueria_id,nombre' }
    )
    .select()
    .single()

  if (error) {
    console.error('Error creando laboratorio:', error)
    return { success: false, error: mensajeErrorBD(error, 'No se pudo crear el laboratorio.') }
  }
  return { success: true, data }
}

type InventarioParaRpc = ReturnType<typeof UpsertInventarioSchema.parse>

function rpcArgsInventario(d: InventarioParaRpc, ids: { inventarioId?: string; productoId?: string }) {
  return {
    p_blisters: d.blisters,
    p_blisters_por_caja: d.blisters_por_caja,
    p_cajas: d.cajas,
    p_codigo: d.codigo,
    p_fecha_vencimiento: d.fecha_vencimiento || undefined,
    p_inventario_id: ids.inventarioId || undefined,
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
    p_producto_id: ids.productoId || undefined,
    p_registro_invima: d.registro_invima || '',
    p_seccion: d.seccion || '',
    p_stock_minimo: d.stock_minimo,
    p_ubicacion: d.ubicacion || '',
    p_unidades: d.unidades,
    p_unidades_por_blister: d.unidades_por_blister,
    // En la misma transacción: antes se guardaban con un UPDATE aparte que podía fallar.
    p_iva_porcentaje: d.iva_porcentaje,
    p_requiere_formula: Boolean(d.requiere_formula),
  }
}

/**
 * Procesa la carga o actualización de inventario con auditoría usando una transacción (RPC)
 */
export async function upsertInventario(rawData: UpsertInventarioInput) {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const validation = UpsertInventarioSchema.safeParse(rawData)
  if (!validation.success) {
    return {
      success: false,
      error: 'Datos inválidos: ' + validation.error.issues.map((e) => e.message).join(', '),
    }
  }
  const data = validation.data

  const supabase = await createClient()
  const { data: upserted, error } = await supabase.rpc(
    'upsert_inventario_v2_tx',
    rpcArgsInventario(data, { inventarioId: data.id, productoId: data.producto_id })
  )

  if (error) {
    console.error('Error guardando inventario:', error)
    return { success: false, error: mensajeErrorBD(error, 'No se pudo guardar el inventario.') }
  }

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
  const { data: existingLabs } = await fetchAllPages((from, to) =>
    supabase
      .from('laboratorios')
      .select('id, nombre')
      .order('id', { ascending: true })
      .range(from, to)
  )
  const labMap = new Map<string, string>(
    existingLabs.map((l) => [l.nombre.trim().toUpperCase(), l.id])
  )

  let importados = 0
  let fallidos = 0
  const errores: string[] = []

  for (const row of rows) {
    const etiqueta = String(row?.codigo || row?.nombre || 'Fila sin código')
    let laboratorioId: string | undefined

    if (typeof row?.laboratorio === 'string' && row.laboratorio.trim()) {
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

    const bpc = Math.max(1, Number(row?.blisters_por_caja) || 1)
    const upb = Math.max(1, Number(row?.unidades_por_blister) || 1)
    const precioCaja = Number(row?.precio_caja) || 0
    const precioBlister =
      Number(row?.precio_blister) > 0 ? Number(row.precio_blister) : Number((precioCaja / bpc).toFixed(2))
    const precioUnidad =
      Number(row?.precio_unidad) > 0 ? Number(row.precio_unidad) : Number((precioBlister / upb).toFixed(2))

    const validation = UpsertInventarioSchema.safeParse({
      codigo: row?.codigo,
      nombre: row?.nombre,
      principio_activo: row?.principio_activo || '',
      laboratorio_id: laboratorioId || '',
      cajas: row?.cajas,
      blisters: row?.blisters,
      unidades: row?.unidades,
      blisters_por_caja: bpc,
      unidades_por_blister: upb,
      precio_caja: precioCaja,
      precio_blister: precioBlister,
      precio_unidad: precioUnidad,
      porcentaje_ganancia: row?.porcentaje_ganancia,
      margen_blister: row?.margen_blister,
      margen_unidad: row?.margen_unidad,
      lote: row?.lote || '',
      fecha_vencimiento: row?.fecha_vencimiento || null,
      registro_invima: row?.registro_invima || '',
      seccion: row?.seccion || '',
      ubicacion: row?.ubicacion || '',
      stock_minimo: row?.stock_minimo,
      iva_porcentaje: row?.iva_porcentaje ?? 0,
      requiere_formula: Boolean(row?.requiere_formula),
    })

    if (!validation.success) {
      fallidos++
      if (errores.length < 20) {
        errores.push(`${etiqueta}: ${validation.error.issues.map((e) => e.message).join(', ')}`)
      }
      continue
    }

    const d = validation.data
    const { error } = await supabase.rpc('upsert_inventario_v2_tx', rpcArgsInventario(d, {}))

    if (error) {
      fallidos++
      if (errores.length < 20) {
        errores.push(`${etiqueta}: ${mensajeErrorBD(error, 'no se pudo guardar.')}`)
      }
      continue
    }
    importados++
  }

  return { success: importados > 0, importados, fallidos, errores }
}
