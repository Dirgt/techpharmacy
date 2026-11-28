'use server'

import { createClient } from '@/lib/supabase/server'
import { requireActiveUser } from '@/lib/auth/session'
import { addDaysToDateOnly, getBogotaDateString } from '@/lib/date/bogota'

const ALERT_COLUMNS =
  'inventario_id, producto_id, nombre_producto, cajas, stock_minimo, fecha_vencimiento' as const

export async function getDashboardAlertas() {
  const auth = await requireActiveUser()
  if (!auth.ok) return { success: false, data: { vencimientos: [], vencidos: [], stockBajo: [] } }

  const supabase = await createClient()
  const hoy = getBogotaDateString()
  const limite = addDaysToDateOnly(hoy, 90)

  const [{ data: vencimientos }, { data: vencidos }, { data: stockCandidates }] = await Promise.all([
    supabase
      .from('vista_inventario_completo')
      .select(ALERT_COLUMNS)
      .gte('fecha_vencimiento', hoy)
      .lte('fecha_vencimiento', limite)
      .order('fecha_vencimiento', { ascending: true })
      .limit(10),
    supabase
      .from('vista_inventario_completo')
      .select(ALERT_COLUMNS)
      .lt('fecha_vencimiento', hoy)
      .order('fecha_vencimiento', { ascending: false })
      .limit(5),
    supabase
      .from('vista_inventario_completo')
      .select(ALERT_COLUMNS)
      .order('cajas', { ascending: true })
      .limit(100),
  ])

  const stockBajo = (stockCandidates || [])
    .filter((item) => (item.cajas ?? 0) <= (item.stock_minimo ?? 2))
    .slice(0, 10)

  return {
    success: true,
    data: {
      vencimientos: vencimientos || [],
      vencidos: vencidos || [],
      stockBajo,
    },
  }
}
