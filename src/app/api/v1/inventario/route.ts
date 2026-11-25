import { NextRequest } from 'next/server'
import { apiJson, authenticateApiKey, parsePagination } from '@/lib/api/v1-auth'

export async function GET(request: NextRequest) {
  const guard = await authenticateApiKey(request, 'read:inventario')
  if (!guard.ok) return guard.response

  const { auth } = guard
  const { page, limit, from, to } = parsePagination(request)
  const search = request.nextUrl.searchParams.get('search')?.trim()
  const stockBajoOnly = request.nextUrl.searchParams.get('stock_bajo') === 'true'

  let matchingProductoIds: string[] | null = null
  const escaped = search ? search.replace(/[%_]/g, '') : ''

  if (escaped) {
    const { data: matchedProductos } = await auth.adminClient
      .from('productos')
      .select('id')
      .eq('drogueria_id', auth.drogueriaId)
      .or(`nombre.ilike.%${escaped}%,codigo.ilike.%${escaped}%`)

    matchingProductoIds = (matchedProductos || []).map((p) => p.id)
  }

  let query = auth.adminClient
    .from('inventario')
    .select(
      'id, producto_id, cajas, blisters, unidades, blisters_por_caja, unidades_por_blister, precio_caja, precio_blister, precio_unidad, stock_minimo, lote, fecha_vencimiento, ubicacion, seccion, registro_invima, updated_at, producto:productos ( id, codigo, nombre, principio_activo, laboratorio:laboratorios ( id, nombre ) )',
      { count: 'exact' }
    )
    .eq('drogueria_id', auth.drogueriaId)
    .order('updated_at', { ascending: false })

  if (escaped) {
    if (matchingProductoIds && matchingProductoIds.length > 0) {
      query = query.or(`lote.ilike.%${escaped}%,producto_id.in.(${matchingProductoIds.join(',')})`)
    } else {
      query = query.ilike('lote', `%${escaped}%`)
    }
  }

  if (stockBajoOnly) {
    const { data, error } = await query
    if (error) {
      return apiJson({ success: false, error: error.message }, 500, auth.rateLimit)
    }
    const lowStock = (data || []).filter((item) => (item.cajas ?? 0) <= (item.stock_minimo ?? 2))
    return apiJson(
      {
        success: true,
        drogueria: auth.drogueria,
        data: lowStock.slice(from, to + 1),
        meta: { page, limit, total: lowStock.length },
      },
      200,
      auth.rateLimit
    )
  }

  const { data, count, error } = await query.range(from, to)
  if (error) {
    return apiJson({ success: false, error: error.message }, 500, auth.rateLimit)
  }

  return apiJson(
    {
      success: true,
      drogueria: auth.drogueria,
      data: data || [],
      meta: { page, limit, total: count ?? 0 },
    },
    200,
    auth.rateLimit
  )
}
