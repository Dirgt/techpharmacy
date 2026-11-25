import { NextRequest } from 'next/server'
import { apiJson, authenticateApiKey, parsePagination } from '@/lib/api/v1-auth'

export async function GET(request: NextRequest) {
  const guard = await authenticateApiKey(request, 'read:productos')
  if (!guard.ok) return guard.response

  const { auth } = guard
  const { page, limit, from, to } = parsePagination(request)
  const search = request.nextUrl.searchParams.get('search')?.trim()

  let query = auth.adminClient
    .from('productos')
    .select(
      'id, codigo, nombre, principio_activo, descripcion, laboratorio_id, created_at, updated_at, laboratorio:laboratorios ( id, nombre )',
      { count: 'exact' }
    )
    .eq('drogueria_id', auth.drogueriaId)
    .order('nombre', { ascending: true })

  if (search) {
    const escaped = search.replace(/[%_]/g, '')
    if (escaped) {
      query = query.or(
        `nombre.ilike.%${escaped}%,codigo.ilike.%${escaped}%,principio_activo.ilike.%${escaped}%`
      )
    }
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
