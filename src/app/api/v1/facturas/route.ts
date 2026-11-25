import { NextRequest } from 'next/server'
import { apiJson, authenticateApiKey, parsePagination } from '@/lib/api/v1-auth'

export async function GET(request: NextRequest) {
  const guard = await authenticateApiKey(request, 'read:facturas')
  if (!guard.ok) return guard.response

  const { auth } = guard
  const { page, limit, from, to } = parsePagination(request)
  const sp = request.nextUrl.searchParams
  const desde = sp.get('desde')?.trim()
  const hasta = sp.get('hasta')?.trim()
  const estadoPago = sp.get('estado_pago')?.trim()

  let query = auth.adminClient
    .from('facturas')
    .select(
      'id, numero, cliente_nombre, cliente_documento, metodo_pago, tipo_venta, estado_pago, subtotal_bruto, descuento_porcentaje, descuento_monto, iva_porcentaje, iva_total, total, condicion_pago_dias, orden_compra, fecha_vencimiento, created_at',
      { count: 'exact' }
    )
    .eq('drogueria_id', auth.drogueriaId)
    .order('created_at', { ascending: false })

  if (desde && /^\d{4}-\d{2}-\d{2}$/.test(desde)) {
    query = query.gte('created_at', `${desde}T00:00:00.000Z`)
  }
  if (hasta && /^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    query = query.lte('created_at', `${hasta}T23:59:59.999Z`)
  }
  if (estadoPago) {
    query = query.eq('estado_pago', estadoPago)
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
