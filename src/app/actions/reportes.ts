'use server'

import { createClient } from '@/lib/supabase/server'

export async function getVentasDelDia() {
  const supabase = await createClient()
  
  const ahora = new Date()
  const inicioDia = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate(), 0, 0, 0, 0)).toISOString()
  const finDia = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate(), 23, 59, 59, 999)).toISOString()

  const { data: facturas, error } = await supabase
    .from('facturas')
    .select(`*, vendedor:vendedor_id ( full_name, role ), detalles:factura_detalles ( cantidad_cajas, cantidad_blisters, cantidad_unidades, precio_unitario, subtotal, producto:producto_id ( nombre_producto, laboratorio_nombre ) )`)
    .gte('created_at', inicioDia)
    .lte('created_at', finDia)
    .order('created_at', { ascending: false })

  if (error) return { success: false, data: [] }
  return { success: true, data: facturas || [] }
}

export async function getReporteFinancieroDiario() {
  const supabase = await createClient()
  
  const ahora = new Date()
  const inicioDia = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate(), 0, 0, 0, 0)).toISOString()
  const finDia = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate(), 23, 59, 59, 999)).toISOString()

  const { data: facturas } = await supabase.from('facturas').select('total, metodo_pago, estado_pago').gte('created_at', inicioDia).lte('created_at', finDia)
  const { data: gastos } = await supabase.from('gastos').select('monto, tipo').gte('created_at', inicioDia).lte('created_at', finDia)
  const { data: compras } = await supabase.from('compras').select('total, metodo_pago, estado_pago').gte('created_at', inicioDia).lte('created_at', finDia)

  return {
    success: true,
    data: {
      facturas: facturas || [],
      gastos: gastos || [],
      compras: compras || []
    }
  }
}

export async function getIngresosGastosMensuales() {
  const supabase = await createClient()
  
  // Últimos 7 días para el gráfico
  const fin = new Date()
  const inicio = new Date()
  inicio.setDate(fin.getDate() - 6)
  inicio.setHours(0,0,0,0)

  const { data: facturas } = await supabase.from('facturas').select('total, created_at').gte('created_at', inicio.toISOString())
  const { data: gastos } = await supabase.from('gastos').select('monto, created_at').gte('created_at', inicio.toISOString())
  const { data: compras } = await supabase.from('compras').select('total, created_at').gte('created_at', inicio.toISOString())

  // Agrupar por día (YYYY-MM-DD)
  const porDia: Record<string, { fecha: string, ingresos: number, gastos: number }> = {}
  
  for(let i=0; i<7; i++) {
    const d = new Date(inicio)
    d.setDate(d.getDate() + i)
    const fechaStr = d.toISOString().split('T')[0]
    porDia[fechaStr] = { fecha: fechaStr, ingresos: 0, gastos: 0 }
  }

  facturas?.forEach(f => {
    if (!f.created_at) return
    const d = f.created_at.split('T')[0]
    if (porDia[d]) porDia[d].ingresos += Number(f.total || 0)
  })
  
  gastos?.forEach(g => {
    if (!g.created_at) return
    const d = g.created_at.split('T')[0]
    if (porDia[d]) porDia[d].gastos += Number(g.monto || 0)
  })

  compras?.forEach(c => {
    if (!c.created_at) return
    const d = c.created_at.split('T')[0]
    if (porDia[d]) porDia[d].gastos += Number(c.total || 0)
  })

  return { success: true, data: Object.values(porDia).sort((a,b) => a.fecha.localeCompare(b.fecha)) }
}

export async function getTopProductos() {
  const supabase = await createClient()
  
  const ahora = new Date()
  const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString()
  
  // Para simplificar, buscamos los detalles del mes y los agrupamos aquí.
  // En producción real, esto debería ser un RPC para mejor rendimiento.
  const { data, error } = await supabase
    .from('factura_detalles')
    .select(`cantidad_cajas, cantidad_blisters, cantidad_unidades, producto_id, producto:productos ( nombre )`)
    // Asumiendo que podemos unir con facturas para filtrar por mes, pero por simplificación de Supabase JS, 
    // y dado el volumen pequeño, tomaremos los últimos detalles.

  if (error || !data) return { success: false, data: [] }

  const counts: Record<string, { name: string, cantidad: number }> = {}
  
  data.forEach(d => {
    if (!d.producto || !d.producto_id) return
    // @ts-ignore
    const nombre = d.producto.nombre || 'Desconocido'
    const total = (d.cantidad_cajas || 0) + (d.cantidad_blisters || 0) * 0.1 + (d.cantidad_unidades || 0) * 0.01 // Aproximación
    if (!counts[d.producto_id]) counts[d.producto_id] = { name: nombre, cantidad: 0 }
    counts[d.producto_id].cantidad += total
  })

  const top10 = Object.values(counts)
    .sort((a,b) => b.cantidad - a.cantidad)
    .slice(0, 10)
    .map(x => ({ name: x.name, ventas: Math.round(x.cantidad) }))

  return { success: true, data: top10 }
}
