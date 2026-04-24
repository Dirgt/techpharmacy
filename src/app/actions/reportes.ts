'use server'

import { createClient } from '@/lib/supabase/server'

export async function getVentasDelDia() {
  const supabase = await createClient()
  
  // Usar la fecha UTC de hoy directamente para evitar problemas de timezone.
  // Postgres almacena en UTC, así que comparamos con la fecha UTC.
  const ahora = new Date()
  
  // Inicio del día en UTC: YYYY-MM-DDT00:00:00.000Z
  const inicioDia = new Date(Date.UTC(
    ahora.getUTCFullYear(),
    ahora.getUTCMonth(),
    ahora.getUTCDate(),
    0, 0, 0, 0
  )).toISOString()

  // Fin del día en UTC: YYYY-MM-DDT23:59:59.999Z
  const finDia = new Date(Date.UTC(
    ahora.getUTCFullYear(),
    ahora.getUTCMonth(),
    ahora.getUTCDate(),
    23, 59, 59, 999
  )).toISOString()

  const { data: facturas, error } = await supabase
    .from('facturas')
    .select(`
      *,
      vendedor:vendedor_id ( full_name, role ),
      detalles:factura_detalles (
        cantidad_cajas,
        cantidad_blisters,
        cantidad_unidades,
        precio_unitario,
        subtotal,
        producto:producto_id ( nombre_producto, laboratorio_nombre )
      )
    `)
    .gte('created_at', inicioDia)
    .lte('created_at', finDia)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error obteniendo facturas del día:', error)
    return { success: false, data: [] }
  }

  return { success: true, data: facturas || [] }
}
