import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// GET /api/clientes?q=nombre_o_documento
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const q = req.nextUrl.searchParams.get('q')?.trim() || ''

  let query = supabase
    .from('clientes')
    .select('id, nombre, documento, tipo_doc, tipo_cliente, telefono, email, ciudad')
    .order('nombre')
    .limit(20)

  if (q.length >= 1) {
    query = query.or(`nombre.ilike.%${q}%,documento.ilike.%${q}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ success: false, data: [], error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data: data || [] }, {
    headers: { 'Cache-Control': 'no-store' }
  })
}

// POST /api/clientes  — crear cliente rápido
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json()

  const { nombre, documento, tipo_doc, tipo_cliente, telefono, email, direccion, ciudad } = body

  if (!nombre?.trim()) {
    return NextResponse.json({ success: false, error: 'El nombre es requerido' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('clientes')
    .insert({ nombre: nombre.trim(), documento, tipo_doc, tipo_cliente, telefono, email, direccion, ciudad })
    .select()
    .single()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}
