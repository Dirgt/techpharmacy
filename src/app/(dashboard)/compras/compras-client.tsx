'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Database } from '@/lib/supabase/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useBarcodeScanner } from '@/hooks/use-barcode-scanner'
import {
  AlertCircle,
  AlertTriangle,
  Banknote,
  Boxes,
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  CreditCard,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  PackagePlus,
  Plus,
  Printer,
  ScanBarcode,
  Search,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Trash2,
  Truck,
  Wallet,
  X,
} from 'lucide-react'
import {
  createProveedor,
  pagarCompraProveedor,
  registrarCompra,
} from '@/app/actions/tesoreria'
import { formatCurrency } from '@/lib/utils'
import type { UserDrogueria } from '@/lib/auth/session'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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

type FiltroEstadoCompra = 'todas' | 'por_pagar' | 'pagadas' | 'observacion'

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

export default function ComprasClient({
  initialData,
  proveedores: initialProveedores,
  productos,
  caja,
  inventario = [],
  drogueria = null,
}: {
  initialData: Compra[]
  proveedores: Proveedor[]
  productos: Producto[]
  caja: Caja | null
  inventario?: Array<{
    producto_id?: string | null
    precio_caja?: number | null
    cajas?: number | null
  }>
  drogueria?: UserDrogueria | null
}) {
  const router = useRouter()
  const [proveedoresList, setProveedoresList] = useState<Proveedor[]>(initialProveedores)
  const [searchTerm, setSearchTerm] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstadoCompra>('todas')

  // Modal Registrar Compra
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [proveedorId, setProveedorId] = useState('')
  const [numeroFactura, setNumeroFactura] = useState('')
  const [estadoPago, setEstadoPago] = useState<'pagado' | 'pendiente' | 'credito'>('pendiente')
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'transferencia' | 'tarjeta'>(
    'transferencia'
  )
  const [estadoRecepcion, setEstadoRecepcion] = useState<'conforme' | 'observacion'>('conforme')
  const [observacionesRecepcion, setObservacionesRecepcion] = useState('')
  const [detalles, setDetalles] = useState<CompraDetalleDraft[]>([])
  const [productQuickSearch, setProductQuickSearch] = useState('')

  // Mini creador rápido de proveedor dentro del modal
  const [showQuickProveedor, setShowQuickProveedor] = useState(false)
  const [quickProvNombre, setQuickProvNombre] = useState('')
  const [quickProvNit, setQuickProvNit] = useState('')
  const [quickProvTel, setQuickProvTel] = useState('')
  const [savingQuickProv, setSavingQuickProv] = useState(false)

  // Modal Detalle / Acta y Modal Pago
  const [selectedCompra, setSelectedCompra] = useState<Compra | null>(null)
  const [payingCompra, setPayingCompra] = useState<Compra | null>(null)
  const [pagoMetodo, setPagoMetodo] = useState<'transferencia' | 'efectivo' | 'tarjeta'>(
    'transferencia'
  )
  const [isPayingCompra, setIsPayingCompra] = useState(false)

  const cajaEstaAbierta = Boolean(caja && ['abierta', 'abierto'].includes(caja.estado || ''))

  const inventarioMap = useMemo(() => {
    const map = new Map<string, { costo: number; cajas: number }>()
    for (const row of inventario) {
      if (row.producto_id) {
        map.set(row.producto_id, {
          costo: Number(row.precio_caja || 0),
          cajas: Number(row.cajas || 0),
        })
      }
    }
    return map
  }, [inventario])

  const productosMap = useMemo(() => {
    const map = new Map<string, Producto>()
    for (const p of productos) {
      map.set(p.id, p)
    }
    return map
  }, [productos])

  const resumenCompras = useMemo(() => {
    const mesActual = new Date().toISOString().slice(0, 7)
    let totalGeneral = 0
    let totalMes = 0
    let totalPorPagar = 0
    let totalPagado = 0
    let countPorPagar = 0
    let countPagadas = 0
    let countObservacion = 0
    let totalCajasIngresadas = 0

    for (const c of initialData) {
      const val = Number(c.total || 0)
      totalGeneral += val
      if ((c.created_at || '').startsWith(mesActual)) {
        totalMes += val
      }
      if (c.estado_pago === 'pagado') {
        totalPagado += val
        countPagadas += 1
      } else {
        totalPorPagar += val
        countPorPagar += 1
      }
      if (c.estado_recepcion === 'observacion') {
        countObservacion += 1
      }
      for (const d of c.compra_detalles || []) {
        totalCajasIngresadas += Number(d.cantidad || 0)
      }
    }

    const pctPagado =
      totalGeneral > 0 ? Math.round((totalPagado / totalGeneral) * 100) : 100
    const pctConformes =
      initialData.length > 0
        ? Math.round(((initialData.length - countObservacion) / initialData.length) * 100)
        : 100

    return {
      totalGeneral,
      totalMes,
      totalPorPagar,
      totalPagado,
      countPorPagar,
      countPagadas,
      countObservacion,
      totalCajasIngresadas,
      pctPagado,
      pctConformes,
    }
  }, [initialData])

  const filteredData = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return initialData.filter((c) => {
      if (filtroEstado === 'por_pagar' && c.estado_pago === 'pagado') return false
      if (filtroEstado === 'pagadas' && c.estado_pago !== 'pagado') return false
      if (filtroEstado === 'observacion' && c.estado_recepcion !== 'observacion') return false

      if (!q) return true

      const matchBasic =
        (c.numero_factura || '').toLowerCase().includes(q) ||
        (c.proveedores?.nombre || '').toLowerCase().includes(q) ||
        (c.proveedores?.documento_nit || '').toLowerCase().includes(q)

      if (matchBasic) return true

      return (c.compra_detalles || []).some(
        (d) =>
          (d.productos?.nombre || '').toLowerCase().includes(q) ||
          (d.productos?.codigo || '').toLowerCase().includes(q) ||
          (d.lote || '').toLowerCase().includes(q)
      )
    })
  }, [initialData, filtroEstado, searchTerm])

  const quickMatches = useMemo(() => {
    const q = productQuickSearch.trim().toLowerCase()
    if (!q) return []
    return productos
      .filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          p.codigo.toLowerCase().includes(q) ||
          (p.principio_activo || '').toLowerCase().includes(q)
      )
      .slice(0, 6)
  }, [productQuickSearch, productos])

  const appendOrIncrementProduct = (producto: Producto) => {
    setDetalles((prev) => {
      const existingIndex = prev.findIndex(
        (d) => d.producto_id === producto.id && !d.lote.trim()
      )
      if (existingIndex >= 0) {
        const next = [...prev]
        next[existingIndex] = {
          ...next[existingIndex],
          cantidad: next[existingIndex].cantidad + 1,
        }
        return next
      }
      const sugerido = inventarioMap.get(producto.id)?.costo ?? 0
      return [
        ...prev,
        {
          producto_id: producto.id,
          cantidad: 1,
          costo_unitario: sugerido,
          lote: '',
          fecha_vencimiento: '',
        },
      ]
    })
  }

  useBarcodeScanner((barcode) => {
    if (!isModalOpen) return
    const producto = productos.find((p) => p.codigo === barcode)
    if (producto) {
      appendOrIncrementProduct(producto)
      toast.success(`Escaneado: ${producto.nombre}`)
    } else {
      toast.error(`Código no registrado en catálogo: ${barcode}`)
    }
  })

  const handleAddEmptyRow = () => {
    setDetalles((prev) => [
      ...prev,
      { producto_id: '', cantidad: 1, costo_unitario: 0, lote: '', fecha_vencimiento: '' },
    ])
  }

  const handleRemoveDetalle = (index: number) => {
    setDetalles((prev) => prev.filter((_, idx) => idx !== index))
  }

  const handleDetalleChange = (
    index: number,
    field: keyof CompraDetalleDraft,
    value: string | number
  ) => {
    setDetalles((prev) => {
      const next = [...prev]
      const updated = { ...next[index], [field]: value }
      if (field === 'producto_id' && typeof value === 'string') {
        const sugerido = inventarioMap.get(value)?.costo
        if (sugerido && (!updated.costo_unitario || updated.costo_unitario === 0)) {
          updated.costo_unitario = sugerido
        }
      }
      next[index] = updated
      return next
    })
  }

  const totalDraft = useMemo(
    () => detalles.reduce((acc, det) => acc + det.cantidad * det.costo_unitario, 0),
    [detalles]
  )
  const totalCajasDraft = useMemo(
    () => detalles.reduce((acc, det) => acc + Number(det.cantidad || 0), 0),
    [detalles]
  )

  const handleCreateQuickProveedor = async () => {
    if (quickProvNombre.trim().length < 2) {
      toast.error('Escribe el nombre del proveedor')
      return
    }
    setSavingQuickProv(true)
    const res = await createProveedor({
      nombre: quickProvNombre.trim(),
      documento_nit: quickProvNit.trim() || null,
      telefono: quickProvTel.trim() || null,
      email: '',
      dias_credito: 30,
    })
    setSavingQuickProv(false)

    if (res.success && res.data) {
      setProveedoresList((prev) =>
        [...prev, res.data].sort((a, b) => a.nombre.localeCompare(b.nombre))
      )
      setProveedorId(res.data.id)
      setQuickProvNombre('')
      setQuickProvNit('')
      setQuickProvTel('')
      setShowQuickProveedor(false)
      toast.success(`Proveedor "${res.data.nombre}" creado y seleccionado`)
    } else {
      toast.error(res.error || 'No se pudo crear el proveedor')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!proveedorId) return toast.error('Selecciona un proveedor')
    if (!numeroFactura.trim()) return toast.error('Ingresa el número de factura del proveedor')
    if (detalles.length === 0) return toast.error('Agrega al menos un medicamento a la compra')
    if (detalles.some((d) => !d.producto_id)) {
      return toast.error('Selecciona el producto en todas las filas')
    }
    if (detalles.some((d) => d.cantidad <= 0)) {
      return toast.error('La cantidad de cajas debe ser mayor a 0')
    }

    if (estadoPago === 'pagado' && metodoPago === 'efectivo' && !cajaEstaAbierta) {
      return toast.error(
        'Para pagar en efectivo desde gaveta debes tener un turno de caja abierto (o elige Transferencia / Por Pagar).'
      )
    }

    setIsSubmitting(true)
    const result = await registrarCompra({
      proveedor_id: proveedorId,
      numero_factura: numeroFactura.trim(),
      total: totalDraft,
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
      toast.success('Factura de compra y lotes FEFO ingresados exitosamente')
      setIsModalOpen(false)
      setProveedorId('')
      setNumeroFactura('')
      setEstadoPago('pendiente')
      setMetodoPago('transferencia')
      setEstadoRecepcion('conforme')
      setObservacionesRecepcion('')
      setProductQuickSearch('')
      setDetalles([])
      router.refresh()
    } else {
      toast.error(result.error || 'Error al registrar la compra')
    }
    setIsSubmitting(false)
  }

  const handleExportCsv = () => {
    if (filteredData.length === 0) {
      toast.error('No hay compras para exportar')
      return
    }
    const headers = [
      'Fecha',
      'Factura',
      'Proveedor',
      'NIT',
      'Estado Pago',
      'Metodo Pago',
      'Recepcion Tecnica',
      'Cajas',
      'Total COP',
    ]
    const rows = filteredData.map((c) => {
      const cajas = (c.compra_detalles || []).reduce((acc, d) => acc + Number(d.cantidad || 0), 0)
      return [
        c.created_at ? new Date(c.created_at).toISOString().slice(0, 10) : '',
        c.numero_factura,
        `"${(c.proveedores?.nombre || '').replace(/"/g, '""')}"`,
        c.proveedores?.documento_nit || '',
        c.estado_pago,
        c.metodo_pago || '',
        c.estado_recepcion || 'conforme',
        String(cajas),
        String(Math.round(Number(c.total || 0))),
      ].join(';')
    })

    const csv = '\uFEFF' + [headers.join(';'), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `compras_proveedores_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success('Reporte de compras exportado a Excel (CSV)')
  }

  const handlePrintActaRecepcion = (compra: Compra) => {
    const win = window.open('', '_blank', 'width=920,height=720')
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
          <td>${det.fecha_vencimiento ? new Date(det.fecha_vencimiento + 'T00:00:00').toLocaleDateString('es-CO') : 'N/A'}</td>
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
  h1 { margin: 0 0 4px; font-size: 18px; text-transform: uppercase; color: #064e3b; }
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
  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #064e3b;padding-bottom:10px;">
    <div>
      <h1>Acta de Recepción Técnica de Medicamentos</h1>
      <div><strong>${escapeHtml(drogueria?.nombre || 'TechPharmacy')}</strong> ${drogueria?.nit ? `• NIT: ${escapeHtml(drogueria.nit)}` : ''}</div>
      <div style="color:#475569">${escapeHtml(drogueria?.direccion || '')} ${drogueria?.telefono ? `• Tel: ${escapeHtml(drogueria.telefono)}` : ''}</div>
    </div>
    <div style="text-align:right">
      <div><strong>Factura Compra:</strong> #${escapeHtml(compra.numero_factura)}</div>
      <div><strong>Fecha:</strong> ${compra.created_at ? new Date(compra.created_at).toLocaleString('es-CO') : '-'}</div>
    </div>
  </div>

  <div class="meta">
    <div><strong>Proveedor:</strong> ${escapeHtml(compra.proveedores?.nombre || 'N/A')} ${compra.proveedores?.documento_nit ? `(${escapeHtml(compra.proveedores.documento_nit)})` : ''}</div>
    <div><strong>Estado Técnico:</strong> ${compra.estado_recepcion === 'observacion' ? 'CON OBSERVACIÓN' : 'CONFORME (Embalaje, etiqueta e INVIMA verificados)'}</div>
    <div><strong>Estado de Pago:</strong> ${escapeHtml(compra.estado_pago.toUpperCase())} ${compra.metodo_pago ? `(${escapeHtml(compra.metodo_pago)})` : ''}</div>
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
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* 1. HERO EJECUTIVO DE ABASTECIMIENTO */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-emerald-950 to-teal-950 p-6 sm:p-7 text-white shadow-xl shadow-slate-900/10 border border-emerald-500/20">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-teal-400/15 blur-3xl" />

        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-5">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 px-3 py-1 text-[11px] font-bold text-emerald-200">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                Abastecimiento & Recepción FEFO
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold ${
                  cajaEstaAbierta
                    ? 'border-emerald-400/30 bg-white/10 text-emerald-200'
                    : 'border-amber-400/30 bg-amber-500/15 text-amber-200'
                }`}
              >
                <Wallet className="h-3 w-3" />
                {cajaEstaAbierta ? 'Caja Abierta para pagos en efectivo' : 'Caja Cerrada (Pagos por banco o crédito)'}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-3 py-1 text-[11px] font-semibold text-slate-200">
                <Truck className="h-3 w-3 text-teal-300" />
                {proveedoresList.length} proveedor(es)
              </span>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                Compras a Proveedores
              </h1>
              <p className="mt-0.5 text-sm text-emerald-100/80">
                Ingresa mercancía por lote sin borrar existencias anteriores y lleva al día tus cuentas por pagar.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Link
              href="/proveedores"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs sm:text-sm font-bold text-white backdrop-blur-sm transition-all hover:bg-white/20"
            >
              <Building2 className="h-4 w-4 text-teal-300" />
              Directorio Proveedores
            </Link>

            {initialData.length > 0 && (
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs sm:text-sm font-bold text-white backdrop-blur-sm transition-all hover:bg-white/20 cursor-pointer"
              >
                <Download className="h-4 w-4 text-emerald-300" />
                Exportar Excel
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setIsModalOpen(true)
                if (detalles.length === 0) {
                  setDetalles([
                    {
                      producto_id: '',
                      cantidad: 1,
                      costo_unitario: 0,
                      lote: '',
                      fecha_vencimiento: '',
                    },
                  ])
                }
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-400 px-5 py-2.5 text-xs sm:text-sm font-black text-slate-950 shadow-lg shadow-emerald-500/30 transition-all hover:from-emerald-300 hover:to-teal-300 hover:scale-[1.02] cursor-pointer"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              Registrar Compra
            </button>
          </div>
        </div>
      </section>

      {/* 2. KPI CARDS DE TESORERÍA Y RECEPCIÓN */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* KPI 1: Inversión Total */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                Volumen de Compras
              </p>
              <p className="mt-1.5 text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                {formatCurrency(resumenCompras.totalGeneral)}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-100 p-3 text-slate-700 border border-slate-200/80">
              <ShoppingCart className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-500">Este mes:</span>
            <span className="font-black text-slate-800">
              {formatCurrency(resumenCompras.totalMes)} ({initialData.length} fact.)
            </span>
          </div>
        </div>

        {/* KPI 2: Cuentas por Pagar */}
        <button
          type="button"
          onClick={() =>
            setFiltroEstado(filtroEstado === 'por_pagar' ? 'todas' : 'por_pagar')
          }
          className={`text-left rounded-2xl border p-5 shadow-sm transition-all hover:shadow-md cursor-pointer ${
            filtroEstado === 'por_pagar'
              ? 'border-amber-400 bg-amber-50/50 ring-2 ring-amber-400/20'
              : 'border-slate-200/80 bg-white hover:border-amber-300'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-amber-700">
                Cuentas por Pagar
              </p>
              <p className="mt-1.5 text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                {formatCurrency(resumenCompras.totalPorPagar)}
              </p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-3 text-amber-600 border border-amber-200/80">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-500">
              {resumenCompras.countPorPagar} factura(s) pendientes
            </span>
            <span className="font-black text-amber-700">
              {filtroEstado === 'por_pagar' ? 'Viendo filtro ✓' : 'Filtrar →'}
            </span>
          </div>
        </button>

        {/* KPI 3: Total Pagado */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-emerald-700">
                Pagado a Proveedores
              </p>
              <p className="mt-1.5 text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                {formatCurrency(resumenCompras.totalPagado)}
              </p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600 border border-emerald-200/80">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3.5 pt-3 border-t border-slate-100 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-slate-500">Cartera cubierta</span>
              <span className="text-emerald-700">{resumenCompras.pctPagado}% al día</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${resumenCompras.pctPagado}%` }}
              />
            </div>
          </div>
        </div>

        {/* KPI 4: Recepción Técnica e Inventario */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:border-teal-300 hover:shadow-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                Recepción Técnica INVIMA
              </p>
              <p className="mt-1.5 text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                {resumenCompras.pctConformes}%{' '}
                <span className="text-sm font-bold text-slate-400">conforme</span>
              </p>
            </div>
            <div className="rounded-2xl bg-teal-50 p-3 text-teal-600 border border-teal-200/80">
              <ClipboardCheck className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-500">Unidades de empaque:</span>
            <span className="font-black text-teal-700">
              {resumenCompras.totalCajasIngresadas.toLocaleString('es-CO')} cajas recibidas
            </span>
          </div>
        </div>
      </section>

      {/* 3. BARRA EJECUTIVA DE BÚSQUEDA Y FILTROS */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-3.5 sm:p-4 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xl">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            type="text"
            placeholder="Buscar por # de factura, proveedor, NIT, medicamento o lote..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-10 rounded-xl border-slate-200 bg-slate-50/80 pl-10 pr-9 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus-visible:ring-emerald-500"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-200/70 hover:text-slate-700"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/90 p-1 rounded-xl self-start lg:self-auto">
          {(
            [
              { id: 'todas', label: `Todas (${initialData.length})` },
              { id: 'por_pagar', label: `Por Pagar (${resumenCompras.countPorPagar})` },
              { id: 'pagadas', label: `Pagadas (${resumenCompras.countPagadas})` },
              ...(resumenCompras.countObservacion > 0
                ? [
                    {
                      id: 'observacion' as const,
                      label: `Con Observación (${resumenCompras.countObservacion})`,
                    },
                  ]
                : []),
            ] as Array<{ id: FiltroEstadoCompra; label: string }>
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFiltroEstado(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                filtroEstado === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {/* 4. TABLA ENTERPRISE DE COMPRAS O ESTADO INICIAL DE LUJO */}
      <section className="rounded-3xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
        {filteredData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-black uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4">Factura & Acta</th>
                  <th className="px-6 py-4">Proveedor</th>
                  <th className="px-6 py-4">Mercancía / Lotes</th>
                  <th className="px-6 py-4 text-right">Total</th>
                  <th className="px-6 py-4">Estado de Pago</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredData.map((compra) => {
                  const detallesCompra = compra.compra_detalles || []
                  const totalCajas = detallesCompra.reduce(
                    (acc, d) => acc + Number(d.cantidad || 0),
                    0
                  )
                  const primerProducto = detallesCompra[0]?.productos?.nombre
                  const provNombre = compra.proveedores?.nombre || 'Proveedor'
                  const inicial = provNombre.charAt(0).toUpperCase()
                  const esObservacion = compra.estado_recepcion === 'observacion'

                  return (
                    <tr
                      key={compra.id}
                      className="hover:bg-emerald-50/30 transition-colors group"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="font-bold text-slate-800 text-xs">
                          {compra.created_at
                            ? new Date(compra.created_at).toLocaleDateString('es-CO', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })
                            : '-'}
                        </p>
                        <p className="text-[11px] text-slate-400 font-medium">
                          {compra.created_at
                            ? new Date(compra.created_at).toLocaleTimeString('es-CO', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : ''}
                        </p>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-900">
                            #{compra.numero_factura}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-black uppercase ${
                              esObservacion
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            {esObservacion ? 'Observación' : 'Acta OK'}
                          </span>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-xs font-black text-white shadow-sm">
                            {inicial}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 text-xs sm:text-sm truncate max-w-[200px]">
                              {provNombre}
                            </p>
                            {compra.proveedores?.documento_nit && (
                              <p className="text-[11px] text-slate-400 font-medium">
                                NIT: {compra.proveedores.documento_nit}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <p className="text-xs font-bold text-slate-800">
                          {detallesCompra.length} ref. • {totalCajas} caja(s)
                        </p>
                        {primerProducto && (
                          <p className="text-[11px] text-slate-400 truncate max-w-[220px]">
                            {primerProducto}
                            {detallesCompra.length > 1
                              ? ` +${detallesCompra.length - 1} más`
                              : ''}
                          </p>
                        )}
                      </td>

                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <span className="text-sm font-black text-slate-900">
                          {formatCurrency(compra.total)}
                        </span>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black border ${
                            compra.estado_pago === 'pagado'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : compra.estado_pago === 'credito'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              compra.estado_pago === 'pagado'
                                ? 'bg-emerald-500'
                                : compra.estado_pago === 'credito'
                                  ? 'bg-amber-500'
                                  : 'bg-rose-500'
                            }`}
                          />
                          {compra.estado_pago === 'pagado'
                            ? `Pagado${compra.metodo_pago ? ` • ${compra.metodo_pago}` : ''}`
                            : compra.estado_pago === 'credito'
                              ? 'Crédito'
                              : 'Por Pagar'}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {compra.estado_pago !== 'pagado' && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 rounded-xl text-xs font-black text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                              onClick={() => {
                                setPayingCompra(compra)
                                setPagoMetodo('transferencia')
                              }}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                              Pagar
                            </Button>
                          )}

                          <Button
                            variant="outline"
                            size="sm"
                            title="Imprimir Acta de Recepción Técnica"
                            className="h-8 rounded-xl text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-100"
                            onClick={() => handlePrintActaRecepcion(compra)}
                          >
                            <Printer className="w-3.5 h-3.5 mr-1 text-slate-500" />
                            Acta
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-xl text-xs font-bold text-slate-600 hover:text-emerald-700 hover:bg-emerald-50"
                            onClick={() => setSelectedCompra(compra)}
                          >
                            <Eye className="w-3.5 h-3.5 mr-1" />
                            Detalle
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-14 flex flex-col items-center justify-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-50 to-teal-100 border border-emerald-200/70 text-emerald-600 shadow-sm mb-4">
              <PackagePlus className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-black text-slate-900">
              {searchTerm || filtroEstado !== 'todas'
                ? 'No hay facturas que coincidan con este filtro'
                : 'Aún no has registrado compras a proveedores'}
            </h3>
            <p className="mt-1 text-sm text-slate-500 max-w-md">
              {searchTerm || filtroEstado !== 'todas'
                ? 'Prueba limpiando la búsqueda o cambiando la pestaña de estado.'
                : 'Cada vez que recibas pedido de tu distribuidor o depósito, regístralo aquí para cargar sus lotes y fechas de vencimiento automáticamente.'}
            </p>

            {!searchTerm && filtroEstado === 'todas' && (
              <>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs font-bold text-slate-600">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1">
                    <Boxes className="h-3.5 w-3.5 text-emerald-600" />
                    Respeta lotes viejos (FEFO)
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1">
                    <FileSpreadsheet className="h-3.5 w-3.5 text-teal-600" />
                    Genera Acta Técnica INVIMA
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1">
                    <Wallet className="h-3.5 w-3.5 text-amber-600" />
                    Controla Cuentas por Pagar
                  </span>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <Button
                    onClick={() => {
                      setIsModalOpen(true)
                      if (detalles.length === 0) {
                        setDetalles([
                          {
                            producto_id: '',
                            cantidad: 1,
                            costo_unitario: 0,
                            lote: '',
                            fecha_vencimiento: '',
                          },
                        ])
                      }
                    }}
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black px-5 h-11 shadow-md shadow-emerald-600/20"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Registrar Primera Compra
                  </Button>

                  {proveedoresList.length === 0 && (
                    <Link
                      href="/proveedores"
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 h-11 text-xs font-bold text-slate-700 hover:bg-slate-50"
                    >
                      <Truck className="h-4 w-4 text-slate-500" />
                      Crear Proveedor
                    </Link>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* ========================================================================
          MODAL 1: REGISTRAR COMPRA E INGRESO MULTI-LOTE (ESTILO ENTERPRISE)
      ======================================================================== */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-5xl w-[calc(100vw-1.5rem)] max-h-[92vh] overflow-y-auto p-0 rounded-3xl border-0 shadow-2xl">
          {/* Header oscuro de lujo */}
          <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-teal-950 px-6 py-5 text-white">
            <DialogHeader>
              <DialogTitle className="text-xl font-black text-white flex items-center gap-2.5">
                <div className="rounded-xl bg-emerald-500/20 border border-emerald-400/30 p-2 text-emerald-300">
                  <ShoppingCart className="h-5 w-5" />
                </div>
                Registrar Factura de Compra & Recepción por Lote
              </DialogTitle>
              <DialogDescription className="text-emerald-100/80 text-xs sm:text-sm">
                Los lotes nuevos se suman a tu inventario sin sobrescribir la mercancía antigua y actualizan el costo base del producto.
              </DialogDescription>
            </DialogHeader>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5 bg-white">
            {/* Alerta contextual solo si eligió Efectivo y la caja está cerrada */}
            {estadoPago === 'pagado' && metodoPago === 'efectivo' && !cajaEstaAbierta && (
              <div className="rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 p-3.5 flex items-start gap-3 text-xs font-medium">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-black">Caja de mostrador cerrada:</strong> Para descontar efectivo de la gaveta debes abrir turno en Facturación, o cambia el método a{' '}
                  <strong>Transferencia</strong> o el estado a <strong>Por Pagar / Crédito</strong>.
                </div>
              </div>
            )}

            {/* Datos de cabecera de factura */}
            <div className="rounded-2xl bg-slate-50/90 border border-slate-200/80 p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-black uppercase tracking-wider text-slate-600">
                      Proveedor *
                    </Label>
                    <button
                      type="button"
                      onClick={() => setShowQuickProveedor((prev) => !prev)}
                      className="text-[11px] font-black text-emerald-700 hover:underline cursor-pointer"
                    >
                      {showQuickProveedor ? 'Cancelar' : '+ Crear rápido'}
                    </button>
                  </div>
                  <Select value={proveedorId} onValueChange={setProveedorId}>
                    <SelectTrigger className="bg-white rounded-xl h-10 border-slate-200">
                      <SelectValue placeholder="Selecciona distribuidor / depósito" />
                    </SelectTrigger>
                    <SelectContent>
                      {proveedoresList.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nombre} {p.documento_nit ? `(${p.documento_nit})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-black uppercase tracking-wider text-slate-600">
                    Nro. Factura Proveedor *
                  </Label>
                  <div className="relative">
                    <FileText className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      required
                      placeholder="Ej. FE-90412"
                      className="pl-9 bg-white rounded-xl h-10 border-slate-200 font-bold"
                      value={numeroFactura}
                      onChange={(e) => setNumeroFactura(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-black uppercase tracking-wider text-slate-600">
                    Condición de Pago
                  </Label>
                  <Select
                    value={estadoPago}
                    onValueChange={(val) =>
                      setEstadoPago(val as 'pagado' | 'pendiente' | 'credito')
                    }
                  >
                    <SelectTrigger className="bg-white rounded-xl h-10 border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendiente">Pendiente (Cuenta por Pagar)</SelectItem>
                      <SelectItem value="credito">Crédito Plazo Proveedor</SelectItem>
                      <SelectItem value="pagado">Pagado de Contado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {estadoPago === 'pagado' && (
                  <div className="space-y-1.5">
                    <Label className="text-xs font-black uppercase tracking-wider text-slate-600">
                      Medio de Desembolso
                    </Label>
                    <Select
                      value={metodoPago}
                      onValueChange={(val) =>
                        setMetodoPago(val as 'efectivo' | 'transferencia' | 'tarjeta')
                      }
                    >
                      <SelectTrigger className="bg-white rounded-xl h-10 border-slate-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="transferencia">Transferencia / Nequi / Banco</SelectItem>
                        <SelectItem value="efectivo">Efectivo de Caja Abierta</SelectItem>
                        <SelectItem value="tarjeta">Tarjeta Corporativa</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs font-black uppercase tracking-wider text-slate-600">
                    Recepción Técnica (INVIMA)
                  </Label>
                  <Select
                    value={estadoRecepcion}
                    onValueChange={(val) => setEstadoRecepcion(val as 'conforme' | 'observacion')}
                  >
                    <SelectTrigger className="bg-white rounded-xl h-10 border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conforme">Conforme (Sellos y empaque OK)</SelectItem>
                      <SelectItem value="observacion">Con observación técnica</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-black uppercase tracking-wider text-slate-600">
                    Nota de Recepción (Opcional)
                  </Label>
                  <Input
                    placeholder="Ej. Cadena de frío verificada"
                    className="bg-white rounded-xl h-10 border-slate-200"
                    value={observacionesRecepcion}
                    onChange={(e) => setObservacionesRecepcion(e.target.value)}
                  />
                </div>
              </div>

              {/* Mini formulario inline para crear proveedor sin salir de la compra */}
              {showQuickProveedor && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-3.5 space-y-3 animate-in fade-in duration-200">
                  <p className="text-xs font-black text-emerald-900 flex items-center gap-1.5">
                    <Truck className="h-3.5 w-3.5 text-emerald-600" />
                    Crear Proveedor Rápido
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                    <Input
                      placeholder="Razón social / Nombre *"
                      value={quickProvNombre}
                      onChange={(e) => setQuickProvNombre(e.target.value)}
                      className="bg-white h-9 text-xs sm:col-span-2"
                    />
                    <Input
                      placeholder="NIT (opcional)"
                      value={quickProvNit}
                      onChange={(e) => setQuickProvNit(e.target.value)}
                      className="bg-white h-9 text-xs"
                    />
                    <div className="flex gap-2">
                      <Input
                        placeholder="Teléfono"
                        value={quickProvTel}
                        onChange={(e) => setQuickProvTel(e.target.value)}
                        className="bg-white h-9 text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={savingQuickProv}
                        onClick={handleCreateQuickProveedor}
                        className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-black shrink-0"
                      >
                        {savingQuickProv ? '...' : 'Guardar'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Buscador rápido / Lector de código de barras para agregar medicamentos */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <Label className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <ScanBarcode className="h-4 w-4 text-emerald-600" />
                  Detalle de Medicamentos Recibidos
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddEmptyRow}
                  className="rounded-xl border-emerald-200 text-emerald-700 hover:bg-emerald-50 font-bold text-xs self-start sm:self-auto"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Agregar Fila Manual
                </Button>
              </div>

              {/* Buscador instantáneo estilo POS */}
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-600" />
                <Input
                  type="text"
                  value={productQuickSearch}
                  onChange={(e) => setProductQuickSearch(e.target.value)}
                  placeholder="Busca rápido por nombre o escanea el código de barras para añadir a la factura..."
                  className="h-10 rounded-xl border-emerald-200 bg-emerald-50/40 pl-10 text-xs sm:text-sm font-medium focus:bg-white focus-visible:ring-emerald-500"
                />
                {quickMatches.length > 0 && (
                  <div className="absolute left-0 right-0 top-11 z-30 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl divide-y divide-slate-100">
                    {quickMatches.map((prod) => {
                      const info = inventarioMap.get(prod.id)
                      return (
                        <button
                          key={prod.id}
                          type="button"
                          onClick={() => {
                            appendOrIncrementProduct(prod)
                            setProductQuickSearch('')
                          }}
                          className="w-full px-3 py-2 text-left flex items-center justify-between gap-3 hover:bg-emerald-50 rounded-xl transition-colors cursor-pointer"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-black text-slate-900 truncate">
                              {prod.nombre}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              Cód: {prod.codigo} • Stock actual: {info?.cajas ?? 0} cajas
                            </p>
                          </div>
                          <span className="text-xs font-black text-emerald-700 shrink-0">
                            + Añadir ({formatCurrency(info?.costo ?? 0)})
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Tabla editable de renglones de compra */}
              <div className="rounded-2xl border border-slate-200 overflow-x-auto">
                <table className="w-full text-sm min-w-[780px]">
                  <thead className="bg-slate-50 text-slate-500 text-[11px] font-black uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2.5 text-left">Medicamento / Producto</th>
                      <th className="px-3 py-2.5 text-left w-24">Cajas</th>
                      <th className="px-3 py-2.5 text-left w-36">Costo Caja ($)</th>
                      <th className="px-3 py-2.5 text-left w-36">Lote Nuevo</th>
                      <th className="px-3 py-2.5 text-left w-40">Vencimiento</th>
                      <th className="px-3 py-2.5 text-right w-32">Subtotal</th>
                      <th className="px-2 py-2.5 w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {detalles.map((det, index) => {
                      const prodSelected = productosMap.get(det.producto_id)
                      return (
                        <tr key={index} className="hover:bg-slate-50/60">
                          <td className="px-3 py-2.5">
                            <Select
                              value={det.producto_id}
                              onValueChange={(val) =>
                                handleDetalleChange(index, 'producto_id', val)
                              }
                            >
                              <SelectTrigger className="border-slate-200 h-9 rounded-xl text-xs font-bold">
                                <SelectValue placeholder="Selecciona producto..." />
                              </SelectTrigger>
                              <SelectContent>
                                {productos.map((p) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    {p.nombre} ({p.codigo})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {prodSelected && (
                              <span className="text-[10px] font-semibold text-slate-400 pl-1">
                                Cód: {prodSelected.codigo}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <Input
                              type="number"
                              min="1"
                              className="h-9 rounded-xl font-bold text-center"
                              value={det.cantidad || ''}
                              onChange={(e) =>
                                handleDetalleChange(
                                  index,
                                  'cantidad',
                                  parseInt(e.target.value, 10) || 0
                                )
                              }
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0"
                              className="h-9 rounded-xl font-bold"
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
                          <td className="px-3 py-2.5">
                            <Input
                              type="text"
                              placeholder="Ej. L2608B"
                              className="h-9 rounded-xl text-xs uppercase font-semibold"
                              value={det.lote}
                              onChange={(e) =>
                                handleDetalleChange(index, 'lote', e.target.value.toUpperCase())
                              }
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <Input
                              type="date"
                              className="h-9 rounded-xl text-xs"
                              value={det.fecha_vencimiento}
                              onChange={(e) =>
                                handleDetalleChange(index, 'fecha_vencimiento', e.target.value)
                              }
                            />
                          </td>
                          <td className="px-3 py-2.5 text-right font-black text-slate-900">
                            {formatCurrency(det.cantidad * det.costo_unitario)}
                          </td>
                          <td className="px-2 py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveDetalle(index)}
                              className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
                              title="Quitar fila"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                    {detalles.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-xs text-slate-400">
                          Usa el buscador verde de arriba o haz clic en &ldquo;Agregar Fila Manual&rdquo;.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Footer resumen financiero de la compra */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl bg-slate-900 px-5 py-4 text-white">
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block">Referencias</span>
                  <strong className="text-sm font-black text-white">{detalles.length}</strong>
                </div>
                <div className="h-7 w-px bg-slate-700" />
                <div>
                  <span className="text-slate-400 block">Cajas a ingresar</span>
                  <strong className="text-sm font-black text-emerald-400">
                    {totalCajasDraft} caja(s)
                  </strong>
                </div>
                <div className="h-7 w-px bg-slate-700 hidden sm:block" />
                <div className="hidden sm:block text-[11px] text-slate-300 max-w-xs">
                  Los lotes anteriores se conservan intactos con salida automática FEFO.
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-4">
                <div className="text-right">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300 block">
                    Total Factura
                  </span>
                  <span className="text-2xl font-black text-white">
                    {formatCurrency(totalDraft)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsModalOpen(false)}
                    className="rounded-xl border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmitting || detalles.length === 0}
                    className="rounded-xl bg-gradient-to-r from-emerald-400 to-teal-400 text-slate-950 font-black hover:from-emerald-300 hover:to-teal-300 px-5"
                  >
                    {isSubmitting ? 'Guardando...' : 'Confirmar Compra'}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========================================================================
          MODAL 2: DETALLE DE COMPRA + ACTA DE RECEPCIÓN TÉCNICA
      ======================================================================== */}
      <Dialog
        open={!!selectedCompra}
        onOpenChange={(open) => {
          if (!open) setSelectedCompra(null)
        }}
      >
        <DialogContent className="max-w-3xl w-[calc(100vw-1.5rem)] max-h-[90vh] overflow-y-auto rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center justify-between gap-3 pr-6">
              <span className="flex items-center gap-2 text-lg font-black text-slate-900">
                <FileText className="w-5 h-5 text-emerald-600" />
                Factura de Compra #{selectedCompra?.numero_factura}
              </span>
              {selectedCompra && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handlePrintActaRecepcion(selectedCompra)}
                  className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold"
                >
                  <Printer className="w-4 h-4 mr-1.5" />
                  Imprimir Acta INVIMA
                </Button>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Trazabilidad de lotes ingresados y estado de recepción técnica sanitaria.
            </DialogDescription>
          </DialogHeader>

          {selectedCompra && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/80 text-sm">
                <div>
                  <p className="text-[11px] font-black text-slate-400 uppercase">Proveedor</p>
                  <p className="font-bold text-slate-900">
                    {selectedCompra.proveedores?.nombre || 'N/A'}
                  </p>
                  {selectedCompra.proveedores?.documento_nit && (
                    <p className="text-xs text-slate-500">
                      NIT: {selectedCompra.proveedores.documento_nit}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[11px] font-black text-slate-400 uppercase">Fecha de Ingreso</p>
                  <p className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    {selectedCompra.created_at
                      ? new Date(selectedCompra.created_at).toLocaleString('es-CO')
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-black text-slate-400 uppercase">Estado Financiero</p>
                  <p className="font-bold text-slate-900 capitalize">
                    {selectedCompra.estado_pago}{' '}
                    {selectedCompra.metodo_pago ? `• ${selectedCompra.metodo_pago}` : ''}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-black text-slate-400 uppercase">Recepción Técnica</p>
                  <p className="font-bold text-slate-900 flex items-center gap-1.5">
                    {selectedCompra.estado_recepcion === 'observacion' ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    )}
                    {selectedCompra.estado_recepcion === 'observacion'
                      ? 'Con observación'
                      : 'Conforme'}
                    {selectedCompra.observaciones_recepcion
                      ? ` — ${selectedCompra.observaciones_recepcion}`
                      : ''}
                  </p>
                </div>
                <div className="sm:col-span-2 flex justify-between items-center pt-3 border-t border-slate-200">
                  <span className="text-xs font-black text-slate-500 uppercase">
                    Valor Total Factura
                  </span>
                  <span className="font-black text-emerald-700 text-xl">
                    {formatCurrency(selectedCompra.total)}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-[11px] font-black text-slate-500 uppercase border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5">Medicamento</th>
                      <th className="px-4 py-2.5">Lote</th>
                      <th className="px-4 py-2.5">Vencimiento</th>
                      <th className="px-4 py-2.5 text-right">Cajas</th>
                      <th className="px-4 py-2.5 text-right">Costo Caja</th>
                      <th className="px-4 py-2.5 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedCompra.compra_detalles &&
                    selectedCompra.compra_detalles.length > 0 ? (
                      selectedCompra.compra_detalles.map((det) => (
                        <tr key={det.id}>
                          <td className="px-4 py-2.5 font-bold text-slate-900">
                            {det.productos?.nombre || 'Producto'}
                            {det.productos?.codigo && (
                              <span className="ml-2 text-xs font-normal text-slate-400">
                                ({det.productos.codigo})
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-xs font-black text-emerald-700">
                            {det.lote || 'N/A'}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-600">
                            {det.fecha_vencimiento
                              ? new Date(det.fecha_vencimiento + 'T00:00:00').toLocaleDateString(
                                  'es-CO'
                                )
                              : 'N/A'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold">{det.cantidad}</td>
                          <td className="px-4 py-2.5 text-right">
                            {formatCurrency(det.costo_unitario)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-black text-slate-900">
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

      {/* ========================================================================
          MODAL 3: LIQUIDAR CUENTA POR PAGAR A PROVEEDOR
      ======================================================================== */}
      <Dialog
        open={!!payingCompra}
        onOpenChange={(open) => {
          if (!open) setPayingCompra(null)
        }}
      >
        <DialogContent className="sm:max-w-md w-[calc(100vw-1.5rem)] rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-black text-slate-900">
              <Wallet className="w-5 h-5 text-emerald-600" />
              Registrar Pago • Factura #{payingCompra?.numero_factura}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Liquida esta obligación con tu proveedor y actualiza tu tesorería.
            </DialogDescription>
          </DialogHeader>

          {payingCompra && (
            <div className="space-y-4 mt-2">
              <div className="rounded-2xl bg-emerald-50/70 border border-emerald-200 p-4 text-sm space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-500">Proveedor</span>
                  <span className="font-black text-slate-900">
                    {payingCompra.proveedores?.nombre || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1">
                  <span className="text-xs font-bold text-slate-500">Total a desembolsar</span>
                  <span className="font-black text-emerald-700 text-lg">
                    {formatCurrency(payingCompra.total)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-black uppercase tracking-wider text-slate-600">
                  Medio de Pago Utilizado
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'transferencia' as const, label: 'Banco / Nequi', icon: Smartphone },
                    { id: 'efectivo' as const, label: 'Efectivo Caja', icon: Banknote },
                    { id: 'tarjeta' as const, label: 'Tarjeta', icon: CreditCard },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setPagoMetodo(opt.id)}
                      className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border p-3 text-xs font-black transition-all cursor-pointer ${
                        pagoMetodo === opt.id
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20'
                          : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <opt.icon className="h-4 w-4" />
                      {opt.label}
                    </button>
                  ))}
                </div>

                {pagoMetodo === 'efectivo' && !cajaEstaAbierta && (
                  <p className="text-xs font-bold text-rose-600 pt-1">
                    Debes abrir un turno de caja en Facturación para descontar efectivo de la gaveta.
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPayingCompra(null)}
                  className="rounded-xl"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  disabled={isPayingCompra || (pagoMetodo === 'efectivo' && !cajaEstaAbierta)}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black"
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
