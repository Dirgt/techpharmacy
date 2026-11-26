'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Database } from '@/lib/supabase/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileText,
  History,
  LayoutGrid,
  List,
  Mail,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  ShoppingCart,
  TrendingUp,
  Truck,
  Wallet,
  X,
} from 'lucide-react'
import { createProveedor, updateProveedor } from '@/app/actions/tesoreria'
import { formatCurrency } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Proveedor = Database['public']['Tables']['proveedores']['Row']

export interface CompraProveedorResumen {
  id: string
  proveedor_id: string | null
  numero_factura: string
  total: number
  estado_pago: string
  metodo_pago: string | null
  created_at: string | null
}

type FiltroProveedor = 'todos' | 'con_deuda' | 'con_credito' | 'contado'

interface SupplierStats {
  totalComprado: number
  saldoPorPagar: number
  facturasCount: number
  pendientesCount: number
  ultimaCompraFecha: string | null
  facturas: CompraProveedorResumen[]
}

function buildWhatsAppUrl(rawPhone: string | null | undefined, drogueriaNombre: string): string | null {
  if (!rawPhone) return null
  const digits = rawPhone.replace(/\D/g, '')
  if (digits.length < 7) return null
  const normalized = digits.length === 10 && digits.startsWith('3') ? `57${digits}` : digits
  const msg = encodeURIComponent(
    `Hola, te escribimos desde ${drogueriaNombre} para consultar disponibilidad y realizar un pedido.`
  )
  return `https://wa.me/${normalized}?text=${msg}`
}

export default function ProveedoresClient({
  initialData,
  compras = [],
  drogueriaNombre = 'TechPharmacy',
}: {
  initialData: Proveedor[]
  compras?: CompraProveedorResumen[]
  drogueriaNombre?: string
}) {
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState('')
  const [filtro, setFiltro] = useState<FiltroProveedor>('todos')
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table')

  // Modal Crear / Editar Proveedor
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    nombre: '',
    documento_nit: '',
    telefono: '',
    email: '',
    dias_credito: '0',
  })

  // Modal Ficha Historial Comercial del Proveedor
  const [historySupplier, setHistorySupplier] = useState<Proveedor | null>(null)

  const statsByProveedor = useMemo(() => {
    const map = new Map<string, SupplierStats>()
    for (const c of compras) {
      if (!c.proveedor_id) continue
      const current = map.get(c.proveedor_id) || {
        totalComprado: 0,
        saldoPorPagar: 0,
        facturasCount: 0,
        pendientesCount: 0,
        ultimaCompraFecha: null,
        facturas: [],
      }
      const val = Number(c.total || 0)
      current.totalComprado += val
      current.facturasCount += 1
      if (c.estado_pago !== 'pagado') {
        current.saldoPorPagar += val
        current.pendientesCount += 1
      }
      if (
        c.created_at &&
        (!current.ultimaCompraFecha || c.created_at > current.ultimaCompraFecha)
      ) {
        current.ultimaCompraFecha = c.created_at
      }
      current.facturas.push(c)
      map.set(c.proveedor_id, current)
    }
    return map
  }, [compras])

  const kpis = useMemo(() => {
    let conCreditoCount = 0
    let sumaDiasCredito = 0
    let proveedoresConDeuda = 0
    let totalDeudaGlobal = 0
    let volumenTotalComprado = 0

    for (const p of initialData) {
      const dias = Number(p.dias_credito || 0)
      if (dias > 0) {
        conCreditoCount += 1
        sumaDiasCredito += dias
      }
      const st = statsByProveedor.get(p.id)
      if (st) {
        volumenTotalComprado += st.totalComprado
        if (st.saldoPorPagar > 0) {
          proveedoresConDeuda += 1
          totalDeudaGlobal += st.saldoPorPagar
        }
      }
    }

    const promedioCredito =
      conCreditoCount > 0 ? Math.round(sumaDiasCredito / conCreditoCount) : 0

    return {
      totalProveedores: initialData.length,
      conCreditoCount,
      contadoCount: initialData.length - conCreditoCount,
      proveedoresConDeuda,
      totalDeudaGlobal,
      volumenTotalComprado,
      totalFacturas: compras.length,
      promedioCredito,
    }
  }, [initialData, statsByProveedor, compras.length])

  const filteredData = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return initialData.filter((p) => {
      const st = statsByProveedor.get(p.id)
      const dias = Number(p.dias_credito || 0)

      if (filtro === 'con_deuda' && (!st || st.saldoPorPagar <= 0)) return false
      if (filtro === 'con_credito' && dias <= 0) return false
      if (filtro === 'contado' && dias > 0) return false

      if (!q) return true

      return (
        p.nombre.toLowerCase().includes(q) ||
        (p.documento_nit || '').toLowerCase().includes(q) ||
        (p.telefono || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q)
      )
    })
  }, [initialData, statsByProveedor, filtro, searchTerm])

  const openCreateModal = () => {
    setEditingId(null)
    setFormData({ nombre: '', documento_nit: '', telefono: '', email: '', dias_credito: '30' })
    setIsModalOpen(true)
  }

  const openEditModal = (proveedor: Proveedor) => {
    setEditingId(proveedor.id)
    setFormData({
      nombre: proveedor.nombre || '',
      documento_nit: proveedor.documento_nit || '',
      telefono: proveedor.telefono || '',
      email: proveedor.email || '',
      dias_credito: String(proveedor.dias_credito ?? 0),
    })
    setIsModalOpen(true)
  }

  const handleCopyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`${label} copiado`)
    } catch {
      toast.error('No se pudo copiar al portapapeles')
    }
  }

  const handleExportCsv = () => {
    if (filteredData.length === 0) {
      toast.error('No hay proveedores para exportar')
      return
    }
    const headers = [
      'Razon Social',
      'NIT',
      'Telefono',
      'Email',
      'Dias Credito',
      'Facturas Compra',
      'Total Comprado COP',
      'Saldo Por Pagar COP',
    ]
    const rows = filteredData.map((p) => {
      const st = statsByProveedor.get(p.id)
      return [
        `"${(p.nombre || '').replace(/"/g, '""')}"`,
        p.documento_nit || '',
        p.telefono || '',
        p.email || '',
        String(p.dias_credito ?? 0),
        String(st?.facturasCount ?? 0),
        String(Math.round(st?.totalComprado ?? 0)),
        String(Math.round(st?.saldoPorPagar ?? 0)),
      ].join(';')
    })

    const csv = '\uFEFF' + [headers.join(';'), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `directorio_proveedores_${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success('Directorio de proveedores exportado a Excel (CSV)')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    const payload = {
      nombre: formData.nombre.trim(),
      documento_nit: formData.documento_nit.trim() || null,
      telefono: formData.telefono.trim() || null,
      email: formData.email.trim() || null,
      dias_credito: Math.max(0, parseInt(formData.dias_credito, 10) || 0),
    }

    const result = editingId
      ? await updateProveedor(editingId, payload)
      : await createProveedor(payload)

    if (result.success) {
      toast.success(
        editingId
          ? 'Proveedor actualizado correctamente'
          : 'Proveedor registrado correctamente'
      )
      setIsModalOpen(false)
      setEditingId(null)
      router.refresh()
    } else {
      toast.error(result.error || 'Error al guardar el proveedor')
    }
    setIsSubmitting(false)
  }

  const historyStats = historySupplier ? statsByProveedor.get(historySupplier.id) : null

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* 1. HERO EJECUTIVO DE PROVEEDORES */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-emerald-950 to-teal-950 p-6 sm:p-7 text-white shadow-xl shadow-slate-900/10 border border-emerald-500/20">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-teal-400/15 blur-3xl" />

        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-5">
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 px-3 py-1 text-[11px] font-bold text-emerald-200">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                Directorio Comercial & Aliados
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-3 py-1 text-[11px] font-semibold text-slate-200">
                <Truck className="h-3 w-3 text-teal-300" />
                {kpis.totalProveedores} distribuidor(es) activos
              </span>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                Proveedores y Laboratorios
              </h1>
              <p className="mt-0.5 text-sm text-emerald-100/80">
                Centraliza contactos, plazos de crédito, historial de abastecimiento y saldos pendientes.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <Link
              href="/compras"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs sm:text-sm font-bold text-white backdrop-blur-sm transition-all hover:bg-white/20"
            >
              <ShoppingCart className="h-4 w-4 text-teal-300" />
              Ir a Compras
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
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-400 px-5 py-2.5 text-xs sm:text-sm font-black text-slate-950 shadow-lg shadow-emerald-500/30 transition-all hover:from-emerald-300 hover:to-teal-300 hover:scale-[1.02] cursor-pointer"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              Nuevo Proveedor
            </button>
          </div>
        </div>
      </section>

      {/* 2. KPI CARDS DE RELACIÓN CON PROVEEDORES */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* KPI 1: Total Aliados */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                Red de Proveedores
              </p>
              <p className="mt-1.5 text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                {kpis.totalProveedores}
              </p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600 border border-emerald-100">
              <Truck className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-500">Con cupo crédito:</span>
            <span className="font-black text-emerald-700">
              {kpis.conCreditoCount} aliado(s)
            </span>
          </div>
        </div>

        {/* KPI 2: Cuentas por Pagar Activas */}
        <button
          type="button"
          onClick={() => setFiltro(filtro === 'con_deuda' ? 'todos' : 'con_deuda')}
          className={`text-left rounded-2xl border p-5 shadow-sm transition-all hover:shadow-md cursor-pointer ${
            filtro === 'con_deuda'
              ? 'border-amber-400 bg-amber-50/50 ring-2 ring-amber-400/20'
              : 'border-slate-200/80 bg-white hover:border-amber-300'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-amber-700">
                Saldo por Pagar
              </p>
              <p className="mt-1.5 text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                {formatCurrency(kpis.totalDeudaGlobal)}
              </p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-3 text-amber-600 border border-amber-200/80">
              <Wallet className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-500">
              {kpis.proveedoresConDeuda} proveedor(es) con saldo
            </span>
            <span className="font-black text-amber-700">
              {filtro === 'con_deuda' ? 'Viendo filtro ✓' : 'Filtrar →'}
            </span>
          </div>
        </button>

        {/* KPI 3: Volumen Abastecido */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:border-teal-300 hover:shadow-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                Compras Históricas
              </p>
              <p className="mt-1.5 text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                {formatCurrency(kpis.volumenTotalComprado)}
              </p>
            </div>
            <div className="rounded-2xl bg-teal-50 p-3 text-teal-600 border border-teal-100">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-500">Facturas registradas:</span>
            <span className="font-black text-slate-800">{kpis.totalFacturas} recepción(es)</span>
          </div>
        </div>

        {/* KPI 4: Plazo Promedio */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all hover:border-sky-300 hover:shadow-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                Plazo Promedio Crédito
              </p>
              <p className="mt-1.5 text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
                {kpis.promedioCredito}{' '}
                <span className="text-sm font-bold text-slate-400">días</span>
              </p>
            </div>
            <div className="rounded-2xl bg-sky-50 p-3 text-sky-600 border border-sky-100">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-500">De contado:</span>
            <span className="font-black text-slate-700">{kpis.contadoCount} proveedor(es)</span>
          </div>
        </div>
      </section>

      {/* 3. BARRA EJECUTIVA DE BÚSQUEDA, PESTAÑAS Y VISTA */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-3.5 sm:p-4 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xl">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            type="text"
            placeholder="Buscar por razón social, NIT, teléfono o correo..."
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

        <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
          <div className="flex flex-wrap items-center gap-1 bg-slate-100/90 p-1 rounded-xl">
            {(
              [
                { id: 'todos', label: `Todos (${initialData.length})` },
                { id: 'con_deuda', label: `Por Pagar (${kpis.proveedoresConDeuda})` },
                { id: 'con_credito', label: `Con Crédito (${kpis.conCreditoCount})` },
                { id: 'contado', label: `Contado (${kpis.contadoCount})` },
              ] as Array<{ id: FiltroProveedor; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFiltro(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer ${
                  filtro === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="inline-flex rounded-xl bg-slate-100/90 p-1">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              title="Vista de tabla"
              className={`rounded-lg p-1.5 transition-all cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              title="Vista de tarjetas"
              className={`rounded-lg p-1.5 transition-all cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {/* 4. CONTENIDO PRINCIPAL: TABLA O TARJETAS */}
      {filteredData.length === 0 ? (
        <section className="rounded-3xl border border-slate-200/80 bg-white px-6 py-14 shadow-sm flex flex-col items-center justify-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-50 to-teal-100 border border-emerald-200/70 text-emerald-600 shadow-sm mb-4">
            <Truck className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-black text-slate-900">
            {searchTerm || filtro !== 'todos'
              ? 'No se encontraron proveedores con ese filtro'
              : 'Tu directorio de proveedores está vacío'}
          </h3>
          <p className="mt-1 text-sm text-slate-500 max-w-md">
            {searchTerm || filtro !== 'todos'
              ? 'Prueba limpiando la búsqueda o cambiando la pestaña activa.'
              : 'Registra aquí tus depósitos, distribuidoras y laboratorios para agilizar tus compras y pedidos por WhatsApp.'}
          </p>
          {!searchTerm && filtro === 'todos' && (
            <Button
              onClick={openCreateModal}
              className="mt-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black px-5 h-11 shadow-md shadow-emerald-600/20"
            >
              <Plus className="h-4 w-4 mr-2" />
              Registrar Primer Proveedor
            </Button>
          )}
        </section>
      ) : viewMode === 'table' ? (
        <section className="rounded-3xl border border-slate-200/80 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-black uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="px-6 py-4">Proveedor / Razón Social</th>
                  <th className="px-6 py-4">NIT</th>
                  <th className="px-6 py-4">Contacto Directo</th>
                  <th className="px-6 py-4">Plazo Crédito</th>
                  <th className="px-6 py-4 text-right">Compras</th>
                  <th className="px-6 py-4 text-right">Estado Cuenta</th>
                  <th className="px-6 py-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredData.map((proveedor) => {
                  const st = statsByProveedor.get(proveedor.id)
                  const dias = Number(proveedor.dias_credito || 0)
                  const waUrl = buildWhatsAppUrl(proveedor.telefono, drogueriaNombre)
                  const initials = proveedor.nombre
                    .split(' ')
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((w) => w[0]?.toUpperCase())
                    .join('')

                  return (
                    <tr
                      key={proveedor.id}
                      className="hover:bg-emerald-50/30 transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-xs font-black text-white shadow-sm">
                            {initials || 'PR'}
                          </div>
                          <div className="min-w-0">
                            <p className="font-black text-slate-900 truncate max-w-[240px]">
                              {proveedor.nombre}
                            </p>
                            <p className="text-[11px] font-medium text-slate-400">
                              {st?.ultimaCompraFecha
                                ? `Última compra: ${new Date(st.ultimaCompraFecha).toLocaleDateString('es-CO')}`
                                : 'Sin compras registradas aún'}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        {proveedor.documento_nit ? (
                          <button
                            type="button"
                            onClick={() => handleCopyText(proveedor.documento_nit!, 'NIT')}
                            title="Clic para copiar NIT"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100/80 hover:bg-slate-200/70 px-2.5 py-1 text-xs font-bold text-slate-700 transition-colors cursor-pointer"
                          >
                            <span>{proveedor.documento_nit}</span>
                            <Copy className="h-3 w-3 text-slate-400" />
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <div className="space-y-0.5">
                          {proveedor.telefono ? (
                            <p className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                              <Phone className="h-3 w-3 text-emerald-600 shrink-0" />
                              {proveedor.telefono}
                            </p>
                          ) : (
                            <span className="text-xs text-slate-400">Sin teléfono</span>
                          )}
                          {proveedor.email && (
                            <a
                              href={`mailto:${proveedor.email}`}
                              className="text-[11px] font-medium text-slate-500 hover:text-emerald-700 flex items-center gap-1.5 truncate max-w-[210px]"
                            >
                              <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                              <span className="truncate">{proveedor.email}</span>
                            </a>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-black ${
                            dias > 0
                              ? 'bg-sky-50 text-sky-700 border-sky-200'
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                        >
                          <Clock className="h-3 w-3" />
                          {dias > 0 ? `${dias} días` : 'Contado'}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <p className="text-xs font-black text-slate-900">
                          {formatCurrency(st?.totalComprado || 0)}
                        </p>
                        <p className="text-[10px] font-bold text-slate-400">
                          {st?.facturasCount || 0} fact.
                        </p>
                      </td>

                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        {st && st.saldoPorPagar > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs font-black text-amber-800">
                            Debe {formatCurrency(st.saldoPorPagar)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-black text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" />
                            Al día
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {waUrl && (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Hacer pedido por WhatsApp"
                              className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-black text-emerald-700 hover:bg-emerald-100 transition-colors"
                            >
                              <MessageCircle className="h-3.5 w-3.5" />
                              Pedir
                            </a>
                          )}

                          <Button
                            variant="outline"
                            size="sm"
                            title="Ver historial de facturas con este proveedor"
                            onClick={() => setHistorySupplier(proveedor)}
                            className="h-8 rounded-xl border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100"
                          >
                            <History className="h-3.5 w-3.5 mr-1 text-slate-500" />
                            Ficha
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(proveedor)}
                            className="h-8 rounded-xl text-xs font-bold text-slate-600 hover:text-emerald-700 hover:bg-emerald-50"
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1" />
                            Editar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredData.map((proveedor) => {
            const st = statsByProveedor.get(proveedor.id)
            const dias = Number(proveedor.dias_credito || 0)
            const waUrl = buildWhatsAppUrl(proveedor.telefono, drogueriaNombre)
            const initials = proveedor.nombre
              .split(' ')
              .filter(Boolean)
              .slice(0, 2)
              .map((w) => w[0]?.toUpperCase())
              .join('')

            return (
              <div
                key={proveedor.id}
                className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-black text-white shadow-sm">
                        {initials || 'PR'}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-black text-slate-900 truncate">{proveedor.nombre}</h3>
                        <p className="text-xs font-semibold text-slate-400">
                          {proveedor.documento_nit ? `NIT: ${proveedor.documento_nit}` : 'Sin NIT registrado'}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase ${
                        dias > 0
                          ? 'bg-sky-50 text-sky-700 border-sky-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}
                    >
                      {dias > 0 ? `${dias}d crédito` : 'Contado'}
                    </span>
                  </div>

                  <div className="rounded-2xl bg-slate-50/90 border border-slate-100 p-3 space-y-1.5 text-xs">
                    <div className="flex items-center gap-2 text-slate-700 font-semibold">
                      <Phone className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span>{proveedor.telefono || 'Sin teléfono'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 truncate">
                      <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{proveedor.email || 'Sin correo electrónico'}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-xl border border-slate-100 p-2.5">
                      <span className="text-[10px] font-black uppercase text-slate-400 block">
                        Total Comprado
                      </span>
                      <span className="font-black text-slate-900">
                        {formatCurrency(st?.totalComprado || 0)}
                      </span>
                    </div>
                    <div
                      className={`rounded-xl border p-2.5 ${
                        st && st.saldoPorPagar > 0
                          ? 'border-amber-200 bg-amber-50/60'
                          : 'border-emerald-100 bg-emerald-50/40'
                      }`}
                    >
                      <span className="text-[10px] font-black uppercase text-slate-400 block">
                        Saldo Pendiente
                      </span>
                      <span
                        className={`font-black ${
                          st && st.saldoPorPagar > 0 ? 'text-amber-800' : 'text-emerald-700'
                        }`}
                      >
                        {st && st.saldoPorPagar > 0
                          ? formatCurrency(st.saldoPorPagar)
                          : 'Al día'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                  {waUrl ? (
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3 py-2 text-xs font-black text-white transition-colors"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                      Pedir por WhatsApp
                    </a>
                  ) : (
                    <span className="text-[11px] text-slate-400 font-medium">Sin WhatsApp</span>
                  )}

                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setHistorySupplier(proveedor)}
                      className="h-8 rounded-xl text-xs font-bold"
                    >
                      Ficha
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditModal(proveedor)}
                      className="h-8 rounded-xl text-xs font-bold"
                    >
                      Editar
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </section>
      )}

      {/* ========================================================================
          MODAL 1: CREAR / EDITAR PROVEEDOR (ESTILO ENTERPRISE DE LUJO)
      ======================================================================== */}
      <Dialog
        open={isModalOpen}
        onOpenChange={(open) => {
          setIsModalOpen(open)
          if (!open) setEditingId(null)
        }}
      >
        <DialogContent className="sm:max-w-xl w-[calc(100vw-1.5rem)] max-h-[92vh] overflow-y-auto p-0 sm:p-0 gap-0 rounded-3xl border-0 shadow-2xl [&>button]:text-white [&>button]:opacity-80 [&>button]:hover:opacity-100">
          <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-teal-950 px-6 py-4 rounded-t-3xl text-white">
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-xl font-black text-white flex items-center gap-2.5 pr-6">
                <div className="rounded-xl bg-emerald-500/20 border border-emerald-400/30 p-2 text-emerald-300 shrink-0">
                  <Building2 className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
                {editingId ? 'Editar Ficha de Proveedor' : 'Registrar Nuevo Proveedor'}
              </DialogTitle>
              <DialogDescription className="text-emerald-100/80 text-xs">
                Datos comerciales y plazo de crédito de tu distribuidor o laboratorio.
              </DialogDescription>
            </DialogHeader>
          </div>

          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-3.5 bg-white rounded-b-3xl">
            <div className="space-y-1">
              <Label className="text-[11px] font-black uppercase tracking-wider text-slate-600">
                Nombre / Razón Social *
              </Label>
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-600" />
                <Input
                  required
                  placeholder="Ej. Coopidrogas / Distribuidora Farmacéutica SAS"
                  className="pl-10 h-10 rounded-xl border-slate-200 bg-slate-50/70 focus:bg-white font-bold"
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="space-y-1">
                <Label className="text-[11px] font-black uppercase tracking-wider text-slate-600">
                  NIT / Documento
                </Label>
                <div className="relative">
                  <FileText className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="900.123.456-7"
                    className="pl-10 h-10 rounded-xl border-slate-200 bg-slate-50/70 focus:bg-white font-semibold"
                    value={formData.documento_nit}
                    onChange={(e) => setFormData({ ...formData, documento_nit: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-[11px] font-black uppercase tracking-wider text-slate-600">
                  Teléfono / WhatsApp
                </Label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-600" />
                  <Input
                    placeholder="300 123 4567"
                    className="pl-10 h-10 rounded-xl border-slate-200 bg-slate-50/70 focus:bg-white font-semibold"
                    value={formData.telefono}
                    onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-[11px] font-black uppercase tracking-wider text-slate-600">
                Correo Electrónico Comercial
              </Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  type="email"
                  placeholder="pedidos@distribuidora.com"
                  className="pl-10 h-10 rounded-xl border-slate-200 bg-slate-50/70 focus:bg-white"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-3.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-[11px] font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  Plazo de Crédito (Días)
                </Label>
                <div className="flex flex-wrap gap-1">
                  {['0', '15', '30', '60', '90'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setFormData({ ...formData, dias_credito: preset })}
                      className={`px-2.5 py-0.5 rounded-lg text-[11px] font-black border transition-colors cursor-pointer ${
                        formData.dias_credito === preset
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-emerald-50'
                      }`}
                    >
                      {preset === '0' ? 'Contado' : `${preset}d`}
                    </button>
                  ))}
                </div>
              </div>
              <Input
                type="number"
                min="0"
                className="h-9 rounded-xl bg-white border-slate-200 font-bold"
                value={formData.dias_credito}
                onChange={(e) => setFormData({ ...formData, dias_credito: e.target.value })}
              />
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsModalOpen(false)}
                className="rounded-xl h-10"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="rounded-xl h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-black px-6"
              >
                {isSubmitting ? 'Guardando...' : editingId ? 'Guardar Cambios' : 'Crear Proveedor'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========================================================================
          MODAL 2: FICHA COMERCIAL E HISTORIAL DE FACTURAS DEL PROVEEDOR
      ======================================================================== */}
      <Dialog
        open={!!historySupplier}
        onOpenChange={(open) => {
          if (!open) setHistorySupplier(null)
        }}
      >
        <DialogContent className="sm:max-w-2xl w-[calc(100vw-1.5rem)] max-h-[88vh] overflow-y-auto rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3 pr-6">
              <span className="flex items-center gap-2 text-lg font-black text-slate-900">
                <Truck className="h-5 w-5 text-emerald-600" />
                {historySupplier?.nombre}
              </span>
              {historySupplier && (
                <Link
                  href="/compras"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-black text-white"
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  Gestionar en Compras
                </Link>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {historySupplier?.documento_nit
                ? `NIT: ${historySupplier.documento_nit} • `
                : ''}
              Plazo pactado: {historySupplier?.dias_credito || 0} días
            </DialogDescription>
          </DialogHeader>

          {historySupplier && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-3.5">
                  <span className="text-[10px] font-black uppercase text-slate-400 block">
                    Facturas Recibidas
                  </span>
                  <span className="text-xl font-black text-slate-900">
                    {historyStats?.facturasCount || 0}
                  </span>
                </div>
                <div className="rounded-2xl bg-emerald-50/70 border border-emerald-200/80 p-3.5">
                  <span className="text-[10px] font-black uppercase text-emerald-700 block">
                    Total Comprado
                  </span>
                  <span className="text-xl font-black text-slate-900">
                    {formatCurrency(historyStats?.totalComprado || 0)}
                  </span>
                </div>
                <div className="rounded-2xl bg-amber-50/70 border border-amber-200/80 p-3.5">
                  <span className="text-[10px] font-black uppercase text-amber-800 block">
                    Por Pagar
                  </span>
                  <span className="text-xl font-black text-amber-800">
                    {formatCurrency(historyStats?.saldoPorPagar || 0)}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-[11px] font-black uppercase text-slate-400 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5">Fecha</th>
                      <th className="px-4 py-2.5">Factura</th>
                      <th className="px-4 py-2.5">Estado</th>
                      <th className="px-4 py-2.5 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {historyStats && historyStats.facturas.length > 0 ? (
                      historyStats.facturas.slice(0, 15).map((fac) => (
                        <tr key={fac.id}>
                          <td className="px-4 py-2.5 text-xs text-slate-600">
                            {fac.created_at
                              ? new Date(fac.created_at).toLocaleDateString('es-CO')
                              : '-'}
                          </td>
                          <td className="px-4 py-2.5 font-black text-slate-900 text-xs">
                            #{fac.numero_factura}
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                fac.estado_pago === 'pagado'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {fac.estado_pago === 'pagado' ? 'Pagado' : 'Por Pagar'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-black text-slate-900 text-xs">
                            {formatCurrency(fac.total)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-xs text-slate-400">
                          Aún no has registrado facturas de compra con este proveedor.
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
    </div>
  )
}
