import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: Request) {
  const supabase = await createClient()

  const { searchParams } = new URL(request.url)
  const cajaId = searchParams.get('cajaId')

  if (!cajaId) {
    return NextResponse.json({ success: false, data: [], error: 'cajaId es requerido' }, { status: 400 })
  }

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
    .eq('caja_sesion_id', cajaId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ success: false, data: [], error: error.message }, { status: 500 })
  }

  return NextResponse.json(
    { success: true, data: data || [] },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' } }
  )
}
