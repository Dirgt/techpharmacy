/**
 * Operaciones del POS que van directo del navegador a Supabase (sin pasar por
 * Vercel). Las RPC validan en la base sesión, rol, droguería, caja, stock,
 * precios y pagos; aquí solo se arma la llamada y se traduce el error.
 */
import { createClient } from '@/lib/supabase/client'
import { mensajeErrorBD } from '@/lib/errors'
import { fetchAllPages } from '@/lib/supabase/fetch-all'
import type { MetodoPagoPos } from '@/lib/pos/pago-mixto'

export type FacturaItem = {
  producto_id: string
  nombre: string
  cantidad_cajas: number
  cantidad_blisters: number
  cantidad_unidades: number
  precio_unitario_base: number
  descuento_porcentaje: number
  precio_linea: number
  precio_linea_original: number
  iva_porcentaje: number
}

export type VentaInput = {
  cliente_nombre: string
  cliente_documento: string
  metodo_pago: MetodoPagoPos
  pago_efectivo: number
  pago_tarjeta: number
  pago_transferencia: number
  tipo_venta: 'contado' | 'credito'
  condicion_pago_dias: number
  orden_compra?: string
  descuento_porcentaje: number
  /** Total que ve el cajero; la base rechaza la venta si el real difiere en más de $1. */
  total: number
  vendedor_id: string
  caja_sesion_id: string
  items: Array<{
    producto_id: string
    cantidad_cajas: number
    cantidad_blisters: number
    cantidad_unidades: number
  }>
}

type Resultado<T> = ({ success: true } & T) | { success: false; error: string; conexion?: boolean }

type ErrorBD = { code?: string | null; message?: string | null }

const ERROR_CONEXION_VENTA =
  'No se pudo confirmar la venta por un problema de conexión. Verifica el historial de ventas antes de intentarlo de nuevo.'

/** PostgREST siempre devuelve un código; sin código es una falla de red. */
const esErrorDeRed = (error: ErrorBD) => !error.code

export async function crearVenta(
  v: VentaInput
): Promise<Resultado<{ factura: { id?: string; numero?: number; total?: number } }>> {
  const doc = v.cliente_documento.trim()
  try {
    const { data, error } = await createClient().rpc('crear_factura_v2_tx', {
      p_cliente_nombre: v.cliente_nombre,
      p_cliente_documento: !doc || doc === '000000000' ? '222222222222' : doc,
      p_metodo_pago: v.metodo_pago,
      p_tipo_venta: v.tipo_venta,
      p_condicion_pago_dias: v.tipo_venta === 'credito' ? v.condicion_pago_dias : 0,
      p_orden_compra: v.orden_compra || '',
      p_descuento_porcentaje: v.descuento_porcentaje,
      p_vendedor_id: v.vendedor_id,
      p_caja_sesion_id: v.caja_sesion_id,
      p_items: v.items,
      p_pago_efectivo: v.pago_efectivo,
      p_pago_tarjeta: v.pago_tarjeta,
      p_pago_transferencia: v.pago_transferencia,
      p_total_cliente: v.total,
    })
    if (error) {
      if (esErrorDeRed(error)) return { success: false, error: ERROR_CONEXION_VENTA, conexion: true }
      return { success: false, error: mensajeErrorBD(error, 'No se pudo registrar la venta.') }
    }
    const factura = (data && typeof data === 'object' ? data : {}) as {
      id?: string
      numero?: number
      total?: number
    }
    return { success: true, factura }
  } catch {
    return { success: false, error: ERROR_CONEXION_VENTA, conexion: true }
  }
}

const VENTAS_SELECT = `
  id, numero, created_at, cliente_nombre, cliente_documento, tipo_venta, metodo_pago, estado_pago,
  total, subtotal_bruto, descuento_porcentaje, descuento_monto, iva_total,
  pago_efectivo, pago_tarjeta, pago_transferencia, monto_abonado, motivo_anulacion,
  fecha_vencimiento, orden_compra, condicion_pago_dias,
  vendedor:vendedor_id ( full_name, role ),
  detalles:factura_detalles (
    producto_id, cantidad_cajas, cantidad_blisters, cantidad_unidades, precio_unitario,
    producto:producto_id ( nombre, codigo )
  )
`

/** Ventas, gastos, compras y abonos en efectivo de una sesión de caja. */
export async function cargarVentasSesion(cajaId: string): Promise<
  Resultado<{
    ventas: Record<string, unknown>[]
    gastos: Record<string, unknown>[]
    comprasEfectivo: Record<string, unknown>[]
    abonosEfectivo: Record<string, unknown>[]
  }>
> {
  const supabase = createClient()
  try {
    const [ventas, gastos, compras, abonos] = await Promise.all([
      fetchAllPages((from, to) =>
        supabase
          .from('facturas')
          .select(VENTAS_SELECT)
          .eq('caja_sesion_id', cajaId)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to)
      ),
      supabase
        .from('gastos')
        .select('id, concepto, monto, tipo, comprobante, created_at')
        .eq('caja_sesion_id', cajaId)
        .order('created_at', { ascending: false }),
      supabase
        .from('compras')
        .select('id, numero_factura, total, created_at')
        .eq('caja_sesion_id', cajaId)
        .eq('estado_pago', 'pagado')
        .eq('metodo_pago', 'efectivo'),
      // Mismo criterio que cerrar_caja_tx: los abonos de ventas anuladas no suman.
      supabase
        .from('factura_abonos')
        .select('id, factura_id, monto, metodo_pago, created_at, factura:facturas!inner ( estado_pago )')
        .eq('caja_sesion_id', cajaId)
        .eq('metodo_pago', 'efectivo')
        .neq('factura.estado_pago', 'anulada'),
    ])

    const error = ventas.error || gastos.error || compras.error || abonos.error
    if (error) {
      return {
        success: false,
        error: esErrorDeRed(error)
          ? 'Sin conexión: no se pudieron cargar las ventas de la caja.'
          : 'No se pudieron cargar las ventas de la caja.',
        conexion: esErrorDeRed(error),
      }
    }

    return {
      success: true,
      ventas: ventas.data as Record<string, unknown>[],
      gastos: (gastos.data || []) as Record<string, unknown>[],
      comprasEfectivo: (compras.data || []) as Record<string, unknown>[],
      abonosEfectivo: (abonos.data || []) as Record<string, unknown>[],
    }
  } catch {
    return { success: false, error: 'Sin conexión: no se pudieron cargar las ventas de la caja.', conexion: true }
  }
}

/** Créditos pendientes (vista_cartera ya trae abonado y saldo). */
export async function cargarCartera(): Promise<Record<string, unknown>[] | null> {
  const supabase = createClient()
  try {
    const { data, error } = await fetchAllPages((from, to) =>
      supabase
        .from('vista_cartera')
        .select('*')
        .eq('estado_pago', 'pendiente')
        .order('fecha_vencimiento', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    )
    if (error) return null
    return data as Record<string, unknown>[]
  } catch {
    return null
  }
}

async function rpcSimple(
  llamada: () => PromiseLike<{ data: unknown; error: ErrorBD | null }>,
  fallback: string
): Promise<Resultado<{ data: unknown }>> {
  try {
    const { data, error } = await llamada()
    if (error) {
      return {
        success: false,
        error: esErrorDeRed(error)
          ? 'Sin conexión: no se confirmó la operación. Actualiza antes de intentarlo de nuevo.'
          : mensajeErrorBD(error, fallback),
        conexion: esErrorDeRed(error),
      }
    }
    return { success: true, data }
  } catch {
    return {
      success: false,
      error: 'Sin conexión: no se confirmó la operación. Actualiza antes de intentarlo de nuevo.',
      conexion: true,
    }
  }
}

export async function registrarAbono(
  facturaId: string,
  cajaSesionId: string,
  monto: number,
  metodoPago: 'efectivo' | 'tarjeta' | 'transferencia',
  notas?: string
) {
  if (!Number.isFinite(monto) || monto <= 0) {
    return { success: false as const, error: 'El monto del abono debe ser mayor a cero.' }
  }
  return rpcSimple(
    () =>
      createClient().rpc('registrar_abono_factura_tx', {
        p_factura_id: facturaId,
        p_caja_sesion_id: cajaSesionId,
        p_monto: monto,
        p_metodo_pago: metodoPago,
        p_notas: (notas || '').trim().slice(0, 300),
      }),
    'No se pudo registrar el abono.'
  )
}

/** Cobra el saldo completo de una venta a crédito (lee el saldo vigente antes). */
export async function cobrarSaldoTotal(
  facturaId: string,
  cajaSesionId: string,
  metodoPago: 'efectivo' | 'tarjeta' | 'transferencia'
) {
  const supabase = createClient()
  try {
    const { data: fac, error } = await supabase
      .from('facturas')
      .select('total, monto_abonado, estado_pago')
      .eq('id', facturaId)
      .maybeSingle()
    if (error || !fac) {
      return {
        success: false as const,
        error: error && esErrorDeRed(error) ? 'Sin conexión: intenta de nuevo.' : 'Factura no encontrada.',
      }
    }
    if (fac.estado_pago !== 'pendiente') {
      return { success: false as const, error: 'Esta factura no está pendiente de cobro.' }
    }
    const saldo = Math.max(0, Number(fac.total || 0) - Number(fac.monto_abonado || 0))
    if (saldo <= 0) return { success: false as const, error: 'La factura no tiene saldo pendiente por cobrar.' }
    return registrarAbono(facturaId, cajaSesionId, saldo, metodoPago, 'Cobro total de cartera')
  } catch {
    return { success: false as const, error: 'Sin conexión: intenta de nuevo.' }
  }
}

export async function anularVenta(facturaId: string, motivo: string) {
  const limpio = motivo.trim()
  if (limpio.length < 3 || limpio.length > 300) {
    return {
      success: false as const,
      error: 'Escribe un motivo de anulación (entre 3 y 300 caracteres).',
    }
  }
  return rpcSimple(
    () => createClient().rpc('anular_factura_v2_tx', { p_factura_id: facturaId, p_motivo: limpio }),
    'No se pudo anular la venta.'
  )
}
