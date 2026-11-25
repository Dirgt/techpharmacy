'use server'

import { createClient } from '@/lib/supabase/server'

export async function getDashboardAlertas() {
  const supabase = await createClient()
  
  // 1. Productos próximos a vencer (en los próximos 90 días)
  const hoy = new Date()
  const fechaLimite = new Date()
  fechaLimite.setDate(hoy.getDate() + 90)
  
  const hoyStr = hoy.toISOString().split('T')[0]
  const limiteStr = fechaLimite.toISOString().split('T')[0]

  const [
    { data: vencimientos },
    { data: vencidos },
    { data: inventarioAll },
  ] = await Promise.all([
    supabase
      .from('vista_inventario_completo')
      .select('*')
      .lte('fecha_vencimiento', limiteStr)
      .gte('fecha_vencimiento', hoyStr)
      .order('fecha_vencimiento', { ascending: true })
      .limit(10),
    supabase
      .from('vista_inventario_completo')
      .select('*')
      .lt('fecha_vencimiento', hoyStr)
      .order('fecha_vencimiento', { ascending: false })
      .limit(5),
    supabase
      .from('vista_inventario_completo')
      .select('*')
      .order('cajas', { ascending: true }),
  ])

  const stockBajo = (inventarioAll || [])
    .filter((item) => (item.cajas ?? 0) <= (item.stock_minimo ?? 2))
    .slice(0, 10)

  return {
    success: true,
    data: {
      vencimientos: vencimientos || [],
      vencidos: vencidos || [],
      stockBajo
    }
  }
}
