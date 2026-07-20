import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { CrearClienteSchema } from '@/lib/validations/cliente.schema'

export const dynamic = 'force-dynamic'

// GET /api/clientes?q=nombre_o_documento&page=1&limit=20
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const q = req.nextUrl.searchParams.get('q')?.trim() || ''
  
  const page = parseInt(req.nextUrl.searchParams.get('page') || '1')
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '20')
  const offset = (page - 1) * limit

  let query = supabase
    .from('clientes')
    .select('id, nombre, documento, tipo_doc, tipo_cliente, telefono, email, ciudad', { count: 'exact' })
    .order('nombre')
    .range(offset, offset + limit - 1)

  if (q.length >= 1) {
    query = query.or(`nombre.ilike.%${q}%,documento.ilike.%${q}%`)
  }

  const { data, error, count } = await query
  if (error) return NextResponse.json({ success: false, data: [], error: error.message }, { status: 500 })
  
  return NextResponse.json({ 
    success: true, 
    data: data || [],
    pagination: { page, limit, total: count || 0 }
  }, {
    headers: { 'Cache-Control': 'no-store' }
  })
}

// POST /api/clientes  — crear cliente rápido
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const body = await req.json()

  const validation = CrearClienteSchema.safeParse(body)
  if (!validation.success) {
    return NextResponse.json({ success: false, error: 'Datos inválidos: ' + validation.error.issues.map((e: any) => e.message).join(', ') }, { status: 400 })
  }

  const dataInput = validation.data

  const { data, error } = await supabase
    .from('clientes')
    .insert({ 
      nombre: dataInput.nombre.trim(), 
      documento: dataInput.documento || null, 
      tipo_doc: dataInput.tipo_doc || null, 
      tipo_cliente: dataInput.tipo_cliente || null, 
      telefono: dataInput.telefono || null, 
      email: dataInput.email || null, 
      direccion: dataInput.direccion || null, 
      ciudad: dataInput.ciudad || null 
    })
    .select()
    .single()

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, data })
}
