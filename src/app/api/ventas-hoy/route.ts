import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const supabase = await createClient()

  const ahora = new Date()
  const inicioDia = new Date(Date.UTC(
    ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate(),
    0, 0, 0, 0
  )).toISOString()
  const finDia = new Date(Date.UTC(
    ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate(),
    23, 59, 59, 999
  )).toISOString()

  const { data, error } = await supabase
    .from('facturas')
    .select(`
      *,
      vendedor:vendedor_id ( full_name, role ),
      detalles:factura_detalles (
        cantidad_cajas, cantidad_blisters, cantidad_unidades,
        precio_unitario,
        producto:producto_id ( nombre, codigo )
      )
    `)
    .gte('created_at', inicioDia)
    .lte('created_at', finDia)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ success: false, data: [], error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    { success: true, data: data || [] },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
