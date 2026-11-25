import { NextRequest } from 'next/server'
import { apiJson, authenticateApiKey, parsePagination } from '@/lib/api/v1-auth'
import { CrearClienteSchema } from '@/lib/validations/cliente.schema'

export async function GET(request: NextRequest) {
  const guard = await authenticateApiKey(request, 'read:clientes')
  if (!guard.ok) return guard.response

  const { auth } = guard
  const { page, limit, from, to } = parsePagination(request)
  const search = request.nextUrl.searchParams.get('search')?.trim()

  let query = auth.adminClient
    .from('clientes')
    .select(
      'id, nombre, documento, tipo_doc, tipo_cliente, telefono, email, direccion, ciudad, descuento_default, iva_default, condicion_pago_default, created_at, updated_at',
      { count: 'exact' }
    )
    .eq('drogueria_id', auth.drogueriaId)
    .order('nombre', { ascending: true })

  if (search) {
    const escaped = search.replace(/[%_]/g, '')
    if (escaped) {
      query = query.or(
        `nombre.ilike.%${escaped}%,documento.ilike.%${escaped}%,email.ilike.%${escaped}%`
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

export async function POST(request: NextRequest) {
  const guard = await authenticateApiKey(request, 'write:clientes')
  if (!guard.ok) return guard.response

  const { auth } = guard

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return apiJson({ success: false, error: 'JSON inválido en el cuerpo.' }, 400, auth.rateLimit)
  }

  const parsed = CrearClienteSchema.safeParse(body)
  if (!parsed.success) {
    return apiJson(
      {
        success: false,
        error: parsed.error.issues.map((i) => i.message).join(', '),
      },
      400,
      auth.rateLimit
    )
  }

  const v = parsed.data
  const { data, error } = await auth.adminClient
    .from('clientes')
    .insert({
      drogueria_id: auth.drogueriaId,
      nombre: v.nombre,
      documento: v.documento || null,
      tipo_doc: v.tipo_doc || null,
      tipo_cliente: v.tipo_cliente || null,
      telefono: v.telefono || null,
      email: v.email || null,
      direccion: v.direccion || null,
      ciudad: v.ciudad || null,
    })
    .select(
      'id, nombre, documento, tipo_doc, tipo_cliente, telefono, email, direccion, ciudad, created_at'
    )
    .single()

  if (error) {
    return apiJson({ success: false, error: error.message }, 500, auth.rateLimit)
  }

  return apiJson(
    {
      success: true,
      drogueria: auth.drogueria,
      data,
    },
    201,
    auth.rateLimit
  )
}
