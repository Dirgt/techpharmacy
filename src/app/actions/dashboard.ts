'use server'

import { createClient } from '@/lib/supabase/server'

export async function getDashboardAlertas() {
  const supabase = await createClient()
  
  // 1. Productos próximos a vencer (en los próximos 90 días)
  const hoy = new Date()
  const fechaLimite = new Date()
  fechaLimite.setDate(hoy.getDate() + 90)
  
  const { data: vencimientos } = await supabase
    .from('vista_inventario_completo')
    .select('*')
    .lte('fecha_vencimiento', fechaLimite.toISOString().split('T')[0])
    .gte('fecha_vencimiento', hoy.toISOString().split('T')[0])
    .order('fecha_vencimiento', { ascending: true })
    .limit(10)

  // 2. Productos vencidos
  const { data: vencidos } = await supabase
    .from('vista_inventario_completo')
    .select('*')
    .lt('fecha_vencimiento', hoy.toISOString().split('T')[0])
    .order('fecha_vencimiento', { ascending: false })
    .limit(5)

  // 3. Productos con stock crítico
  const { data: stockBajo } = await supabase
    .from('vista_inventario_completo')
    .select('*')
    .lte('cajas', 5) // idealmente se compara con stock_minimo, pero no todas las BD tienen esta info en la vista
    .order('cajas', { ascending: true })
    .limit(10)

  return {
    success: true,
    data: {
      vencimientos: vencimientos || [],
      vencidos: vencidos || [],
      stockBajo: stockBajo || []
    }
  }
}
