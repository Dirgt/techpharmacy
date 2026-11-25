'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Database } from '@/lib/supabase/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useBarcodeScanner } from '@/hooks/use-barcode-scanner'
import {
  Plus,
  Search,
  FileText,
  PlusCircle,
  Trash2,
  ShoppingCart,
  AlertCircle,
  CheckCircle2,
  Wallet,
  Printer,
  ClipboardCheck,
} from 'lucide-react'
import { pagarCompraProveedor, registrarCompra } from '@/app/actions/tesoreria'
import { formatCurrency } from '@/lib/utils'
import type { UserDrogueria } from '@/lib/auth/session'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type CompraDetalle = {
  id: string
  cantidad: number
  costo_unitario: number
  subtotal: number
  lote?: string | null
  fecha_vencimiento?: string | null
  productos: { nombre: string; codigo: string } | null
}
type Compra = Database['public']['Tables']['compras']['Row'] & {
  proveedores: { nombre: string; documento_nit?: string | null } | null
  caja_sesiones: { abierto_por: string } | null
  compra_detalles?: CompraDetalle[]
}
type Proveedor = Database['public']['Tables']['proveedores']['Row']
type Producto = Database['public']['Tables']['productos']['Row']
type Caja = Database['public']['Tables']['caja_sesiones']['Row']

type CompraDetalleDraft = {
  producto_id: string
  cantidad: number
  costo_unitario: number
  lote: string
  fecha_vencimiento: string
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export default function ComprasClient({
  initialData,
  proveedores,
  productos,
  caja,
  inventario = [],
  drogueria = null,
}: {
  initialData: Compra[]
  proveedores: Proveedor[]
  productos: Producto[]
  caja: Caja | null
  inventario?: Array<{ producto_id?: string | null; precio_caja?: number | null }>
  drogueria?: UserDrogueria | null
}) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedCompra, setSelectedCompra] = useState<Compra | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [proveedorId, setProveedorId] = useState('')
  const [numeroFactura, setNumeroFactura] = useState('')
  const [estadoPago, setEstadoPago] = useState<'pagado' | 'pendiente' | 'credito'>('pendiente')
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'transferencia' | 'tarjeta'>('efectivo')
  const [estadoRecepcion, setEstadoRecepcion] = useState<'conforme' | 'observacion'>('conforme')
  const [observacionesRecepcion, setObservacionesRecepcion] = useState('')
  const [detalles, setDetalles] = useState<CompraDetalleDraft[]>([])
  const [filtroEstado, setFiltroEstado] = useState<'todas' | 'por_pagar' | 'pagadas'>('todas')
  const [payingCompra, setPayingCompra] = useState<Compra | null>(null)
  const [pagoMetodo, setPagoMetodo] = useState<'transferencia' | 'efectivo' | 'tarjeta'>('transferencia')
  const [isPayingCompra, setIsPayingCompra] = useState(false)

  const costoSugeridoMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of inventario) {
      if (row.producto_id && Number(row.precio_caja || 0) > 0) {
        map.set(row.producto_id, Number(row.precio_caja))
      }
    }
    return map
  }, [inventario])

  const resumenCompras = useMemo(() => {
    let totalGeneral = 0
    let totalPorPagar = 0
    let totalPagado = 0
    let countPorPagar = 0
    for (const c of initialData) {
      const val = Number(c.total || 0)
      totalGeneral += val
      if (c.estado_pago === 'pagado') {
        totalPagado += val
      } else {
        totalPorPagar += val
        countPorPagar += 1
      }
    }
    return { totalGeneral, totalPorPagar, totalPagado, countPorPagar }
  }, [initialData])

  const filteredData = initialData.filter((c) => {
    if (filtroEstado === 'por_pagar' && c.estado_pago === 'pagado') return false
    if (filtroEstado === 'pagadas' && c.estado_pago !== 'pagado') return false
    return (
      (c.numero_factura || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (c.proveedores?.nombre || '').toLowerCase().includes(searchTerm.toLowerCase())
    )
  })

  useBarcodeScanner((barcode) => {
    if (!isModalOpen) return
    const producto = productos.find((p) => p.codigo === barcode)
    if (producto) {
      setDetalles((prev) => {
        const existingIndex = prev.findIndex((d) => d.producto_id === producto.id)
        if (existingIndex >= 0) {
          const newDetalles = [...prev]
          newDetalles[existingIndex] = {
            ...newDetalles[existingIndex],
            cantidad: newDetalles[existingIndex].cantidad + 1,
          }
          toast.success(`Cantidad aumentada: ${producto.nombre}`)
          return newDetalles
        }
        toast.success(`Producto escaneado: ${producto.nombre}`)
        return [
          ...prev,
          {
            producto_id: producto.id,
            cantidad: 1,
            costo_unitario: costoSugeridoMap.get(producto.id) ?? 0,
            lote: '',
            fecha_vencimiento: '',
          },
        ]
      })
    } else {
      toast.error(`Producto no encontrado con código: ${barcode}`)
    }
  })

  const handleAddDetalle = () => {
    setDetalles([
      ...detalles,
      { producto_id: '', cantidad: 1, costo_unitario: 0, lote: '', fecha_vencimiento: '' },
    ])
  }

  const handleRemoveDetalle = (index: number) => {
    const newDetalles = [...detalles]
    newDetalles.splice(index, 1)
    setDetalles(newDetalles)
  }

  const handleDetalleChange = (
    index: number,
    field: keyof CompraDetalleDraft,
    value: string | number
  ) => {
    const newDetalles = [...detalles]
    const updated = { ...newDetalles[index], [field]: value }
    if (field === 'producto_id' && typeof value === 'string') {
      const sugerido = costoSugeridoMap.get(value)
      if (sugerido && (!updated.costo_unitario || updated.costo_unitario === 0)) {
        updated.costo_unitario = sugerido
      }
    }
    newDetalles[index] = updated
    setDetalles(newDetalles)
  }

  const calcularTotal = () => {
    return detalles.reduce((acc, det) => acc + det.cantidad * det.costo_unitario, 0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!proveedorId) return toast.error('Seleccione un proveedor')
    if (detalles.length === 0) return toast.error('Agregue al menos un producto a la compra')
    if (detalles.some((d) => !d.producto_id)) return toast.error('Seleccione los productos en los detalles')

    if (
      estadoPago === 'pagado' &&
      metodoPago === 'efectivo' &&
      (!caja || !['abierta', 'abierto'].includes(caja.estado || ''))
    ) {
      return toast.error('No hay caja abierta para realizar el pago en efectivo')
    }

    setIsSubmitting(true)
    const total = calcularTotal()

    const result = await registrarCompra({
      proveedor_id: proveedorId,
      numero_factura: numeroFactura,
      total,
      estado_pago: estadoPago,
      metodo_pago: metodoPago,
      caja_sesion_id: caja?.id || null,
      estado_recepcion: estadoRecepcion,
      observaciones_recepcion: observacionesRecepcion || null,
      detalles: detalles.map((d) => ({
        ...d,
        lote: d.lote.trim() || null,
        fecha_vencimiento: d.fecha_vencimiento.trim() || null,
      })),
    })

    if (result.success) {
      toast.success('Compra y lotes registrados correctamente')
      setIsModalOpen(false)
      setProveedorId('')
      setNumeroFactura('')
      setEstadoPago('pendiente')
      setMetodoPago('efectivo')
      setEstadoRecepcion('conforme')
      setObservacionesRecepcion('')
      setDetalles([])
      router.refresh()
    } else {
      toast.error(result.error || 'Error al registrar compra')
    }
    setIsSubmitting(false)
  }

  const handlePrintActaRecepcion = (compra: Compra) => {
    const win = window.open('', '_blank', 'width=900,height=700')
    if (!win) {
      toast.error('Permite ventanas emergentes para imprimir el Acta de Recepción')
      return
    }

    const rowsHtml = (compra.compra_detalles || [])
      .map(
        (det, i) => `
        <tr>
          <td>${i + 1}</td>
          <td><strong>${escapeHtml(det.productos?.nombre || 'Producto')}</strong><br><small>${escapeHtml(det.productos?.codigo || '')}</small></td>
          <td>${escapeHtml(det.lote || 'COMPRA-' + compra.numero_factura)}</td>
          <td>${det.fecha_vencimiento ? new Date(det.fecha_vencimiento + 'T00:00:00').toLocaleDateString() : 'N/A'}</td>
          <td style="text-align:right">${det.cantidad}</td>
          <td style="text-align:right">${escapeHtml(formatCurrency(det.costo_unitario))}</td>
          <td style="text-align:right"><strong>${escapeHtml(formatCurrency(det.subtotal))}</strong></td>
          <td>${compra.estado_recepcion === 'observacion' ? 'Revisar' : 'Conforme'}</td>
        </tr>`
      )
      .join('')

    const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Acta de Recepción Técnica - Factura #${escapeHtml(compra.numero_factura)}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; font-size: 12px; }
  h1 { margin: 0 0 4px; font-size: 18px; text-transform: uppercase; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: #f8fafc; border: 1px solid #cbd5e1; padding: 12px; border-radius: 8px; margin: 14px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th, td { border: 1px solid #cbd5e1; padding: 7px 8px; text-align: left; }
  th { background: #0f172a; color: #fff; font-size: 11px; text-transform: uppercase; }
  .firmas { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 52px; }
  .linea { border-top: 1px solid #0f172a; padding-top: 6px; font-size: 11px; font-weight: bold; text-align: center; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:10px;">
    <div>
      <h1>Acta de Recepción Técnica de Medicamentos</h1>
      <div><strong>${escapeHtml(drogueria?.nombre || 'TechPharmacy')}</strong> ${drogueria?.nit ? `• NIT: ${escapeHtml(drogueria.nit)}` : ''}</div>
      <div style="color:#475569">${escapeHtml(drogueria?.direccion || '')} ${drogueria?.telefono ? `• Tel: ${escapeHtml(drogueria.telefono)}` : ''}</div>
    </div>
    <div style="text-align:right">
      <div><strong>Factura Compra:</strong> #${escapeHtml(compra.numero_factura)}</div>
      <div><strong>Fecha:</strong> ${compra.created_at ? new Date(compra.created_at).toLocaleString() : '-'}</div>
    </div>
  </div>

  <div class="meta">
    <div><strong>Proveedor:</strong> ${escapeHtml(compra.proveedores?.nombre || 'N/A')} ${compra.proveedores?.documento_nit ? `(${escapeHtml(compra.proveedores.documento_nit)})` : ''}</div>
    <div><strong>Estado Técnico:</strong> ${compra.estado_recepcion === 'observacion' ? 'CON OBSERVACIÓN' : 'CONFORME (Embalaje, etiqueta e INVIMA verificados)'}</div>
    <div><strong>Pago:</strong> ${escapeHtml(compra.estado_pago.toUpperCase())} ${compra.metodo_pago ? `(${escapeHtml(compra.metodo_pago)})` : ''}</div>
    <div><strong>Total Compra:</strong> ${escapeHtml(formatCurrency(compra.total))}</div>
    ${compra.observaciones_recepcion ? `<div style="grid-column:span 2"><strong>Observaciones:</strong> ${escapeHtml(compra.observaciones_recepcion)}</div>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Producto / Código</th>
        <th>Lote</th>
        <th>Vencimiento</th>
        <th style="text-align:right">Cajas</th>
        <th style="text-align:right">Costo Unit.</th>
        <th style="text-align:right">Subtotal</th>
        <th>Estado</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
  </table>

  <div class="firmas">
    <div class="linea">Entregado por (Proveedor / Transportador)</div>
    <div class="linea">Recibido por (Director Técnico / Administrador)</div>
  </div>
  <script>window.print()</script>
</body>
</html>`

    win.document.open()
    win.document.write(html)
    win.document.close()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Compras a Proveedores</h1>
          <p className="text-slate-500 mt-1">
            Abastecimiento, recepción técnica por lotes (FEFO) y cuentas por pagar
          </p>
        </div>

        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200">
              <Plus className="w-4 h-4 mr-2" />
              Registrar Compra
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-5xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center">
                <ShoppingCart className="w-5 h-5 mr-2 text-indigo-600" />
                Nueva Compra e Ingreso por Lote al Inventario
              </DialogTitle>
            </DialogHeader>

            {!caja && (
              <div className="mt-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-rose-600 mt-0.5" />
                <div>
                  <h4 className="font-bold text-rose-900">Caja Cerrada</h4>
                  <p className="text-sm mt-1">
                    Si pagas en efectivo, se requiere que tengas tu turno de caja abierto.
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5 mt-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div className="space-y-2">
                  <Label>Proveedor *</Label>
                  <Select value={proveedorId} onValueChange={setProveedorId} required>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Seleccione un proveedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {proveedores.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Número de Factura *</Label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      required
                      placeholder="F-001"
                      className="pl-9 bg-white"
                      value={numeroFactura}
                      onChange={(e) => setNumeroFactura(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Estado de Pago</Label>
                  <Select
                    value={estadoPago}
                    onValueChange={(val) =>
                      setEstadoPago(val as 'pagado' | 'pendiente' | 'credito')
                    }
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pagado">Pagado</SelectItem>
                      <SelectItem value="pendiente">Pendiente (Por Pagar)</SelectItem>
                      <SelectItem value="credito">Crédito</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {estadoPago === 'pagado' && (
                  <div className="space-y-2">
                    <Label>Método de Pago</Label>
                    <Select
                      value={metodoPago}
                      onValueChange={(val) =>
                        setMetodoPago(val as 'efectivo' | 'transferencia' | 'tarjeta')
                      }
                    >
                      <SelectTrigger className="bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="efectivo">Efectivo de Caja</SelectItem>
                        <SelectItem value="transferencia">Transferencia Bancaria</SelectItem>
                        <SelectItem value="tarjeta">Tarjeta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Recepción Técnica (Sanitaria)</Label>
                  <Select
                    value={estadoRecepcion}
                    onValueChange={(val) => setEstadoRecepcion(val as 'conforme' | 'observacion')}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conforme">Conforme (Empaque e INVIMA OK)</SelectItem>
                      <SelectItem value="observacion">Con observación</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 md:col-span-2 lg:col-span-1">
                  <Label>Observaciones de Recepción (Opcional)</Label>
                  <Input
                    placeholder="Ej. Cadena de frío OK / Caja externa golpeada"
                    className="bg-white"
                    value={observacionesRecepcion}
                    onChange={(e) => setObservacionesRecepcion(e.target.value)}
                  />
                </div>
              </div>

              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900 flex items-start gap-2.5">
                <ClipboardCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong>Control Multi-Lote FEFO:</strong> Si ya tienes existencias de un lote anterior, los
                  productos ingresados aquí con lote o vencimiento nuevo se guardarán como un{' '}
                  <strong>lote independiente sin borrar lo viejo</strong>, y se recalcularán los costos de
                  blíster y unidad.
                </span>
              </div>

              {/* Detalles de productos */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label className="text-base font-bold text-slate-800">
                    Productos Ingresados (Cajas + Lote + Vencimiento)
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddDetalle}
                    className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                  >
                    <PlusCircle className="w-4 h-4 mr-2" /> Agregar Producto
                  </Button>
                </div>

                <div className="rounded-xl border border-slate-200 overflow-x-auto">
                  <table className="w-full text-sm min-w-[760px]">
                    <thead className="bg-slate-50 text-slate-500 text-xs">
                      <tr>
                        <th className="px-3 py-2 text-left font-bold">Producto</th>
                        <th className="px-3 py-2 text-left font-bold w-24">Cajas</th>
                        <th className="px-3 py-2 text-left font-bold w-32">Costo Caja</th>
                        <th className="px-3 py-2 text-left font-bold w-32">Lote Nuevo</th>
                        <th className="px-3 py-2 text-left font-bold w-36">Vencimiento</th>
                        <th className="px-3 py-2 text-right font-bold w-28">Subtotal</th>
                        <th className="px-2 py-2 w-12"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detalles.map((det, index) => (
                        <tr key={index} className="bg-white">
                          <td className="px-3 py-2">
                            <Select
                              value={det.producto_id}
                              onValueChange={(val) => handleDetalleChange(index, 'producto_id', val)}
                            >
                              <SelectTrigger className="border-slate-200">
                                <SelectValue placeholder="Seleccione..." />
                              </SelectTrigger>
                              <SelectContent>
                                {productos.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.nombre}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min="1"
                              value={det.cantidad || ''}
                              onChange={(e) =>
                                handleDetalleChange(index, 'cantidad', parseInt(e.target.value) || 0)
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={det.costo_unitario || ''}
                              onChange={(e) =>
                                handleDetalleChange(
                                  index,
                                  'costo_unitario',
                                  parseFloat(e.target.value) || 0
                                )
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="text"
                              placeholder="Ej. L2504A"
                              value={det.lote}
                              onChange={(e) => handleDetalleChange(index, 'lote', e.target.value)}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="date"
                              value={det.fecha_vencimiento}
                              onChange={(e) =>
                                handleDetalleChange(index, 'fecha_vencimiento', e.target.value)
                              }
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-700">
                            {formatCurrency(det.cantidad * det.costo_unitario)}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => handleRemoveDetalle(index)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {detalles.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-slate-500 bg-white">
                            No hay productos en esta compra. Añade productos para registrar su entrada por lote.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end pt-2">
                  <div className="text-xl font-bold text-slate-800 bg-slate-100 px-4 py-2 rounded-lg inline-flex items-center">
                    Total: <span className="text-indigo-600 ml-2">{formatCurrency(calcularTotal())}</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || detalles.length === 0}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {isSubmitting ? 'Procesando...' : 'Confirmar Compra'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">Total Compras</p>
          <p className="text-2xl font-black text-slate-900 mt-1">
            {formatCurrency(resumenCompras.totalGeneral)}
          </p>
        </div>
        <div className="bg-amber-50/70 rounded-2xl border border-amber-200 p-5 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-wider text-amber-700">
            Cuentas por Pagar ({resumenCompras.countPorPagar})
          </p>
          <p className="text-2xl font-black text-amber-800 mt-1">
            {formatCurrency(resumenCompras.totalPorPagar)}
          </p>
        </div>
        <div className="bg-emerald-50/70 rounded-2xl border border-emerald-200 p-5 shadow-sm">
          <p className="text-[11px] font-black uppercase tracking-wider text-emerald-700">Total Pagado</p>
          <p className="text-2xl font-black text-emerald-800 mt-1">
            {formatCurrency(resumenCompras.totalPagado)}
          </p>
        </div>
      </div>

      <div className="relative bg-white p-4 lg:p-6 rounded-[2rem] lg:rounded-[3rem] border border-slate-100 shadow-xl flex flex-col xl:flex-row gap-4 lg:gap-6 items-center mb-6 mt-4">
        <div className="relative flex-1 group w-full">
          <Search className="absolute left-6 lg:left-8 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 w-5 h-5 lg:w-6 lg:h-6 transition-colors" />
          <input
            type="text"
            placeholder="Buscar por factura o proveedor..."
            className="w-full pl-14 lg:pl-20 pr-6 lg:pr-10 py-4 lg:py-6 bg-slate-50 border-none rounded-[2rem] lg:rounded-[2.5rem] text-base lg:text-lg font-bold focus:bg-white focus:ring-[10px] lg:focus:ring-[15px] focus:ring-indigo-600/5 transition-all outline-none shadow-inner"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          {[
            { id: 'todas', label: 'Todas' },
            { id: 'por_pagar', label: `Por Pagar (${resumenCompras.countPorPagar})` },
            { id: 'pagadas', label: 'Pagadas' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFiltroEstado(tab.id as 'todas' | 'por_pagar' | 'pagadas')}
              className={`px-4 py-2.5 rounded-xl text-xs font-black transition-colors ${
                filtroEstado === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {searchTerm !== '' && (
        <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 px-6 py-3 rounded-2xl animate-in fade-in duration-200 mb-6">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
            <p className="text-xs font-bold text-indigo-900">
              Filtro activo de búsqueda:{' '}
              <span className="uppercase font-black text-indigo-700">{searchTerm}</span> (
              {filteredData.length} resultados)
            </p>
          </div>
          <button
            onClick={() => setSearchTerm('')}
            className="text-xs font-black text-indigo-600 hover:text-indigo-800 bg-white px-3 py-1.5 rounded-xl border border-indigo-200 shadow-sm transition-all active:scale-95"
          >
            Quitar Filtro ✕
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold">Fecha</th>
                <th className="px-6 py-4 font-semibold">Factura</th>
                <th className="px-6 py-4 font-semibold">Proveedor</th>
                <th className="px-6 py-4 font-semibold">Total</th>
                <th className="px-6 py-4 font-semibold">Estado</th>
                <th className="px-6 py-4 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredData.length > 0 ? (
                filteredData.map((compra) => (
                  <tr key={compra.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 text-slate-600">
                      {compra.created_at ? new Date(compra.created_at).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-900">#{compra.numero_factura}</td>
                    <td className="px-6 py-4">{compra.proveedores?.nombre}</td>
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      {formatCurrency(compra.total)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          compra.estado_pago === 'pagado'
                            ? 'bg-emerald-100 text-emerald-700'
                            : compra.estado_pago === 'credito'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {compra.estado_pago.charAt(0).toUpperCase() + compra.estado_pago.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        {compra.estado_pago !== 'pagado' && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 font-bold"
                            onClick={() => {
                              setPayingCompra(compra)
                              setPagoMetodo('transferencia')
                            }}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                            Pagar
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-slate-500 hover:text-indigo-600"
                          onClick={() => setSelectedCompra(compra)}
                        >
                          Ver Detalles / Acta
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    No se encontraron compras registradas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Detalles de Compra + Acta de Recepción */}
      <Dialog
        open={!!selectedCompra}
        onOpenChange={(open) => {
          if (!open) setSelectedCompra(null)
        }}
      >
        <DialogContent className="max-w-3xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3 pr-6">
              <span className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                Compra Factura #{selectedCompra?.numero_factura}
              </span>
              {selectedCompra && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handlePrintActaRecepcion(selectedCompra)}
                  className="bg-slate-900 hover:bg-slate-800 text-white"
                >
                  <Printer className="w-4 h-4 mr-1.5" />
                  Imprimir Acta de Recepción
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedCompra && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 text-sm">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase">Proveedor</p>
                  <p className="font-semibold text-slate-900">
                    {selectedCompra.proveedores?.nombre || 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase">Fecha</p>
                  <p className="font-semibold text-slate-900">
                    {selectedCompra.created_at
                      ? new Date(selectedCompra.created_at).toLocaleString()
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase">Estado / Método</p>
                  <p className="font-semibold text-slate-900 capitalize">
                    {selectedCompra.estado_pago}{' '}
                    {selectedCompra.metodo_pago ? `(${selectedCompra.metodo_pago})` : ''}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase">Recepción Técnica</p>
                  <p className="font-semibold text-slate-900">
                    {selectedCompra.estado_recepcion === 'observacion'
                      ? 'Con observación'
                      : 'Conforme'}
                    {selectedCompra.observaciones_recepcion
                      ? ` — ${selectedCompra.observaciones_recepcion}`
                      : ''}
                  </p>
                </div>
                <div className="sm:col-span-2 flex justify-between items-center pt-2 border-t border-slate-200">
                  <span className="text-xs font-bold text-slate-500 uppercase">Total Factura</span>
                  <span className="font-bold text-indigo-600 text-lg">
                    {formatCurrency(selectedCompra.total)}
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-xs text-slate-500 uppercase border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2">Producto</th>
                      <th className="px-4 py-2">Lote</th>
                      <th className="px-4 py-2">Vencimiento</th>
                      <th className="px-4 py-2 text-right">Cajas</th>
                      <th className="px-4 py-2 text-right">Costo Unit.</th>
                      <th className="px-4 py-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedCompra.compra_detalles && selectedCompra.compra_detalles.length > 0 ? (
                      selectedCompra.compra_detalles.map((det) => (
                        <tr key={det.id}>
                          <td className="px-4 py-2 font-medium text-slate-900">
                            {det.productos?.nombre || 'Producto'}
                            {det.productos?.codigo && (
                              <span className="ml-2 text-xs text-slate-400">
                                ({det.productos.codigo})
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2 text-xs font-bold text-slate-700">
                            {det.lote || 'N/A'}
                          </td>
                          <td className="px-4 py-2 text-xs text-slate-600">
                            {det.fecha_vencimiento
                              ? new Date(det.fecha_vencimiento + 'T00:00:00').toLocaleDateString()
                              : 'N/A'}
                          </td>
                          <td className="px-4 py-2 text-right">{det.cantidad}</td>
                          <td className="px-4 py-2 text-right">
                            {formatCurrency(det.costo_unitario)}
                          </td>
                          <td className="px-4 py-2 text-right font-semibold">
                            {formatCurrency(det.subtotal)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                          Sin detalles registrados para esta compra.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Pagar Cuenta por Pagar a Proveedor */}
      <Dialog
        open={!!payingCompra}
        onOpenChange={(open) => {
          if (!open) setPayingCompra(null)
        }}
      >
        <DialogContent className="sm:max-w-md w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-600" />
              Pagar Factura #{payingCompra?.numero_factura}
            </DialogTitle>
          </DialogHeader>
          {payingCompra && (
            <div className="space-y-4 mt-2">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm space-y-1">
                <p>
                  <span className="text-slate-500 font-bold">Proveedor:</span>{' '}
                  <span className="font-black text-slate-900">
                    {payingCompra.proveedores?.nombre || 'N/A'}
                  </span>
                </p>
                <p>
                  <span className="text-slate-500 font-bold">Monto a pagar:</span>{' '}
                  <span className="font-black text-emerald-700 text-base">
                    {formatCurrency(payingCompra.total)}
                  </span>
                </p>
              </div>

              <div className="space-y-2">
                <Label>Método de Pago</Label>
                <Select
                  value={pagoMetodo}
                  onValueChange={(v) =>
                    setPagoMetodo(v as 'transferencia' | 'efectivo' | 'tarjeta')
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transferencia">Transferencia Bancaria</SelectItem>
                    <SelectItem value="tarjeta">Tarjeta</SelectItem>
                    <SelectItem value="efectivo">Efectivo de Caja Abierta</SelectItem>
                  </SelectContent>
                </Select>
                {pagoMetodo === 'efectivo' && !caja && (
                  <p className="text-xs font-bold text-rose-600">
                    Debes abrir un turno de caja para pagar en efectivo desde gaveta.
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setPayingCompra(null)}>
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={isPayingCompra || (pagoMetodo === 'efectivo' && !caja)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={async () => {
                    setIsPayingCompra(true)
                    const res = await pagarCompraProveedor(
                      payingCompra.id,
                      pagoMetodo,
                      pagoMetodo === 'efectivo' ? caja?.id : null
                    )
                    if (res.success) {
                      toast.success(`Factura #${payingCompra.numero_factura} marcada como pagada`)
                      setPayingCompra(null)
                      router.refresh()
                    } else {
                      toast.error(res.error || 'Error al registrar pago')
                    }
                    setIsPayingCompra(false)
                  }}
                >
                  {isPayingCompra ? 'Procesando...' : 'Confirmar Pago'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
