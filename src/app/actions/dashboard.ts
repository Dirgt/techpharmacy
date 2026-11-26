'use server'

import { createClient } from '@/lib/supabase/server'

export async function getDashboardAlertas() {
  const supabase = await createClient()

  const hoy = new Date()
  const fechaLimite = new Date()
  fechaLimite.setDate(hoy.getDate() + 90)

  const hoyStr = hoy.toISOString().split('T')[0]
  const limiteStr = fechaLimite.toISOString().split('T')[0]

  const { data: inventarioAll } = await supabase
    .from('vista_inventario_completo')
    .select('inventario_id, producto_id, nombre_producto, cajas, stock_minimo, fecha_vencimiento')
    .order('fecha_vencimiento', { ascending: true })

  const rows = inventarioAll || []

  const vencimientos = rows
    .filter(
      (item) =>
        Boolean(item.fecha_vencimiento) &&
        item.fecha_vencimiento! >= hoyStr &&
        item.fecha_vencimiento! <= limiteStr
    )
    .slice(0, 10)

  const vencidos = rows
    .filter((item) => Boolean(item.fecha_vencimiento) && item.fecha_vencimiento! < hoyStr)
    .sort((a, b) => (b.fecha_vencimiento || '').localeCompare(a.fecha_vencimiento || ''))
    .slice(0, 5)

  const stockBajo = [...rows]
    .filter((item) => (item.cajas ?? 0) <= (item.stock_minimo ?? 2))
    .sort((a, b) => (a.cajas ?? 0) - (b.cajas ?? 0))
    .slice(0, 10)

  return {
    success: true,
    data: {
      vencimientos,
      vencidos,
      stockBajo,
    },
  }
}
