import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import PrintClient from './print-client'

export default async function PrintFacturaPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { id } = await params

  // 1. Fetch factura con vendedor
  const { data: factura, error } = await supabase
    .from('facturas')
    .select(`
      *,
      vendedor:vendedor_id ( full_name )
    `)
    .eq('id', id)
    .single()

  if (error || !factura) return notFound()

  // 2. Fetch detalles y datos de droguería en paralelo
  const [{ data: detalles }, { data: drogueria }] = await Promise.all([
    supabase
      .from('factura_detalles')
      .select(`
        *,
        producto:producto_id ( nombre, codigo )
      `)
      .eq('factura_id', factura.id),
    supabase
      .from('droguerias')
      .select('id, nombre, nit, direccion, telefono, regimen')
      .eq('id', factura.drogueria_id)
      .single(),
  ])

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-8 print:p-0 print:block print:bg-white">
      <PrintClient factura={factura} detalles={detalles || []} drogueria={drogueria} />
    </div>
  )
}
