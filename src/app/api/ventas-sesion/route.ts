import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireActiveUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: Request) {
  const auth = await requireActiveUser()
  if (!auth.ok) {
    return NextResponse.json({ success: false, data: [], gastos: [], comprasEfectivo: [], error: auth.error }, { status: 401 })
  }

  const supabase = await createClient()

  const { searchParams } = new URL(request.url)
  const cajaId = searchParams.get('cajaId')

  if (!cajaId) {
    return NextResponse.json({ success: false, data: [], error: 'cajaId es requerido' }, { status: 400 })
  }

  const [{ data, error }, { data: gastos }, { data: comprasEfectivo }, { data: abonosEfectivo }] = await Promise.all([
    supabase
      .from('facturas')
      .select(`
        *,
        vendedor:vendedor_id ( full_name, role ),
        detalles:factura_detalles (
          producto_id,
          cantidad_cajas, cantidad_blisters, cantidad_unidades,
          precio_unitario,
          producto:producto_id ( nombre, codigo )
        )
      `)
      .eq('caja_sesion_id', cajaId)
      .order('created_at', { ascending: false }),
    supabase
      .from('gastos')
      .select('id, concepto, monto, tipo, comprobante, created_at')
      .eq('caja_sesion_id', cajaId)
      .order('created_at', { ascending: false }),
    supabase
      .from('compras')
      .select('id, numero_factura, total, created_at')
      .eq('caja_sesion_id', cajaId)
      .eq('estado_pago', 'pagado')
      .eq('metodo_pago', 'efectivo'),
    supabase
      .from('factura_abonos')
      .select('id, factura_id, monto, metodo_pago, created_at')
      .eq('caja_sesion_id', cajaId)
      .eq('metodo_pago', 'efectivo')
  ])

  if (error) {
    return NextResponse.json({ success: false, data: [], gastos: [], comprasEfectivo: [], abonosEfectivo: [], error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    {
      success: true,
      data: data || [],
      gastos: gastos || [],
      comprasEfectivo: comprasEfectivo || [],
      abonosEfectivo: abonosEfectivo || []
    },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
