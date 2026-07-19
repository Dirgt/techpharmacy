/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { 
  Plus, Search, Package, Edit3, Info, Check,
  AlertCircle, Activity, History, TrendingUp, FileText,
  ArrowDownCircle, Gem, MousePointer2, Calculator
} from 'lucide-react'
import { format, isAfter, isBefore, addDays, parseISO } from 'date-fns'
import { es } from 'date-fns/locale/es'
import { toast } from 'sonner'
import { upsertInventario, buscarProductoPorCodigo, createLaboratorio, getAuditoria } from '@/app/actions/inventario'

interface InventarioClientProps {
  initialData: any[]
  laboratorios: any[]
}

export default function InventarioClient({ initialData, laboratorios }: InventarioClientProps) {
  const [data, setData] = useState(initialData)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('todos')
  const [labFilter, setLabFilter] = useState('todos')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [isAddingLab, setIsAddingLab] = useState(false)
  const [newLabName, setNewLabName] = useState('')
  const [localLabs, setLocalLabs] = useState(laboratorios)
  
  const [showHistory, setShowHistory] = useState(false)
  const [historyProduct, setHistoryProduct] = useState<any>(null)

  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 8

  // Estado del Formulario Robusto
  const [formData, setFormData] = useState({
    id: '', producto_id: '', codigo: '', nombre: '', laboratorio_id: '',
    fecha_vencimiento: '', 
    cajas: 0, blisters: 0, unidades: 0,
    blisters_por_caja: 1, 
    unidades_por_blister: 1,
    precio_caja: 0, 
    precio_blister: 0, 
    precio_unidad: 0, 
    porcentaje_ganancia: 20,
    margen_blister: 20,
    margen_unidad: 30,
    lote: '',
    registro_invima: '',
    seccion: '',
    ubicacion: ''
  })

  // --- SECCIONES DE FARMACIA ---
  const SECCIONES = [
    'Analgésicos', 'Antibióticos', 'Éticos', 'Genéricos', 'Óvulos', 'Cremas', 
    'Inyectables', 'Fitoterapéuticos', 'Pediátricos', 'Gastrointestinales', 
    'Oftálmicos', 'Dermatológicos', 'Cuidado Personal', 'Suplementos', 'Otros'
  ]

  // --- LÓGICA DE CALCULO AUTOMÁTICO (LA MATRIZ) ---
  useEffect(() => {
    const costoBlister = formData.precio_caja / (formData.blisters_por_caja || 1)
    const costoUnidad = costoBlister / (formData.unidades_por_blister || 1)
    
    setFormData(prev => ({
      ...prev,
      precio_blister: Number(costoBlister.toFixed(2)),
      precio_unidad: Number(costoUnidad.toFixed(2))
    }))
  }, [formData.precio_caja, formData.blisters_por_caja, formData.unidades_por_blister])

  const stats = useMemo(() => {
    const today = new Date()
    const next3Months = addDays(today, 90)
    const tenDaysAgo = addDays(today, -10)
    
    const performance = data.map(item => {
      const costo = parseFloat(item.precio_caja as any) || 0
      const margen = parseFloat((item.margen_caja || item.porcentaje_ganancia) as any) || 0
      const stock = parseInt(item.cajas as any) || 0
      const profit = (costo * (margen / 100)) * stock
      return { name: item.nombre_producto, totalProfit: profit }
    }).sort((a, b) => b.totalProfit - a.totalProfit)

    const deadStock = data.filter(item => {
      if (!item.updated_at) return false
      const lastUpdate = parseISO(item.updated_at)
      return isBefore(lastUpdate, tenDaysAgo) && (parseInt(item.cajas as any) || 0) > 0
    }).length

    return {
      totalItems: data.length,
      lowStock: data.filter(item => (parseInt(item.cajas as any) || 0) <= 2).length,
      expiringSoon: data.filter(item => item.fecha_vencimiento && isBefore(parseISO(item.fecha_vencimiento), next3Months)).length,
      inventoryValue: data.reduce((acc, item) => acc + ((parseInt(item.cajas as any) || 0) * (parseFloat(item.precio_caja as any) || 0)), 0),
      starProduct: performance[0]?.name || 'N/A',
      estimatedProfit: data.reduce((acc, item) => {
        const costo = parseFloat(item.precio_caja as any) || 0
        const margen = parseFloat((item.margen_caja || item.porcentaje_ganancia) as any) || 0
        const stock = parseInt(item.cajas as any) || 0
        return acc + ((costo * (margen / 100)) * stock)
      }, 0),
      deadStock
    }
  }, [data])

  const filteredData = useMemo(() => {
    let result = data.filter(item => 
      item.nombre_producto?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.codigo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.laboratorio?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.seccion?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    if (filterType === 'stock_bajo') result = result.filter(item => item.cajas <= 2)
    if (filterType === 'vencimiento') result = result.filter(item => item.fecha_vencimiento && isBefore(parseISO(item.fecha_vencimiento), addDays(new Date(), 90)))
    if (filterType === 'dead_stock') {
        const tenDaysAgo = addDays(new Date(), -10)
        result = result.filter(item => isBefore(parseISO(item.updated_at), tenDaysAgo) && item.cajas > 0)
    }
    return result
  }, [data, searchTerm, filterType])

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return filteredData.slice(startIndex, startIndex + itemsPerPage)
  }, [filteredData, currentPage])

  const totalPages = Math.ceil(filteredData.length / itemsPerPage)

  const calculatePV = (costo: number | string, margen: number | string) => {
    const c = typeof costo === 'string' ? parseFloat(costo) : costo
    const m = typeof margen === 'string' ? parseFloat(margen) : margen
    if (isNaN(c) || isNaN(m) || m >= 100) return 0
    return Math.round(c / (1 - (m / 100)))
  }

  // --- EXPORTACIÓN ROBUSTA (COMPATIBILIDAD EXCEL TOTAL) ---
  const handleExport = () => {
    const headers = ['CODIGO', 'PRODUCTO', 'LABORATORIO', 'SECCION', 'LOTE', 'INVIMA', 'VENCIMIENTO', 'STOCK_CAJAS', 'VALOR_COMPRA_TOTAL', 'VALOR_VENTA_ESTIMADO', 'MARGEN_%']
    
    const csvRows = [
      "sep=;", 
      headers.join(";"),
      ...filteredData.map(item => {
        const ventaTotal = calculatePV(item.precio_caja, item.margen_caja || item.porcentaje_ganancia) * item.cajas
        const costoTotal = item.precio_caja * item.cajas
        return [
          item.codigo,
          `"${item.nombre_producto}"`,
          `"${item.laboratorio}"`,
          `"${item.seccion || 'N/A'}"`,
          `"${item.ubicacion || 'N/A'}"`,
          item.lote || 'N/A',
          item.registro_invima || 'N/A',
          item.fecha_vencimiento,
          item.cajas,
          costoTotal.toFixed(2).replace('.', ','),
          ventaTotal.toFixed(2).replace('.', ','),
          item.porcentaje_ganancia
        ].join(";")
      })
    ]

    const csvContent = "\uFEFF" + csvRows.join("\n")
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)
    
    link.setAttribute("href", url)
    link.setAttribute("download", `auditoria_techpharmacy_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    toast.success('Auditoría exportada para Excel')
  }

  const selectProduct = (item: any) => {
    setFormData({
      ...formData,
      id: item.inventario_id,
      producto_id: item.producto_id,
      codigo: item.codigo,
      nombre: item.nombre_producto,
      laboratorio_id: item.laboratorio_id || '',
      fecha_vencimiento: item.fecha_vencimiento || '',
      cajas: item.cajas || 0,
      blisters: item.blisters || 0,
      unidades: item.unidades || 0,
      precio_caja: item.precio_caja || 0,
      porcentaje_ganancia: item.margen_caja || item.porcentaje_ganancia || 20,
      margen_blister: item.margen_blister || 20,
      margen_unidad: item.margen_unidad || 30,
      blisters_por_caja: 1, 
      unidades_por_blister: 1,
      lote: item.lote || '',
      registro_invima: item.registro_invima || '',
      seccion: item.seccion || '',
      ubicacion: item.ubicacion || ''
    })
    toast.success('Producto cargado con éxito')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const result = await upsertInventario(formData)
      if (result.success) {
        toast.success('Inventario guardado con éxito')
        setIsModalOpen(false)
        window.location.reload()
      } else {
        toast.error(result.error || 'Error al guardar')
      }
    } catch (error) {
      toast.error('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const [realHistory, setRealHistory] = useState<any[]>([])
  const openHistory = async (item: any) => {
    setHistoryProduct(item)
    setShowHistory(true)
    const logs = await getAuditoria(item.inventario_id)
    setRealHistory(logs)
  }

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleAddLab = async () => {
    if (!newLabName) return
    try {
      const lab = await createLaboratorio(newLabName)
      setLocalLabs([...localLabs, lab])
      setFormData({ ...formData, laboratorio_id: lab.id })
      setIsAddingLab(false)
      setNewLabName('')
      toast.success('Laboratorio creado')
    } catch (error) {
      toast.error('Error al crear laboratorio')
    }
  }

  // --- HELPER DE SEMÁFORO ---
  const getExpirationStatus = (dateStr: string) => {
    if (!dateStr) return { color: 'bg-slate-200', text: 'Sin fecha' }
    const date = parseISO(dateStr)
    const today = new Date()
    const months3 = addDays(today, 90)
    const months6 = addDays(today, 180)

    if (isBefore(date, today)) return { color: 'bg-rose-600 animate-pulse', text: 'VENCIDO' }
    if (isBefore(date, months3)) return { color: 'bg-rose-500', text: 'CRÍTICO' }
    if (isBefore(date, months6)) return { color: 'bg-amber-500', text: 'ALERTA' }
    return { color: 'bg-emerald-500', text: 'SEGURO' }
  }

  return (
    <div className="animate-in fade-in duration-1000 space-y-10 pb-20">
      {/* SEMÁFORO DE SALUD Y BI (Cards) */}
      {/* SEMÁFORO DE SALUD Y BI (Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-8">
        {[
          { label: 'VALOR DEL STOCK', val: `$${stats.inventoryValue.toLocaleString()}`, icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50', filter: 'todos', sub: 'Capital Activo' },
          { label: 'MARGEN ESPERADO', val: `$${stats.estimatedProfit.toLocaleString()}`, icon: Gem, color: 'text-emerald-600', bg: 'bg-emerald-50', filter: 'todos', sub: 'Ganancia Proyectada' },
          { label: 'CRÍTICOS / VENCIMIENTO', val: stats.expiringSoon, icon: AlertCircle, color: 'text-rose-600', bg: 'bg-rose-50', filter: 'vencimiento', sub: 'Revisión Inmediata' },
          { label: 'STOCK SIN MOVIMIENTO', val: stats.deadStock, icon: Activity, color: 'text-amber-600', bg: 'bg-amber-50', filter: 'dead_stock', sub: '10 Días Inactivo' },
        ].map((item, i) => (
          <button 
            key={i} 
            onClick={() => setFilterType(item.filter)}
            className={`text-left p-6 lg:p-10 rounded-[2.5rem] lg:rounded-[3.5rem] border transition-all relative group h-full flex flex-col justify-between ${filterType === item.filter && item.filter !== 'todos' ? 'border-indigo-500 ring-[10px] lg:ring-[15px] ring-indigo-500/5 bg-white shadow-2xl' : 'bg-white border-slate-100 hover:shadow-2xl hover:-translate-y-2'}`}
          >
            <div className="flex flex-col items-start gap-4 mb-6 lg:mb-8 w-full">
              <div className="flex items-center gap-4 w-full">
                <div className={`p-4 lg:p-5 rounded-2xl lg:rounded-[2rem] shrink-0 ${item.bg} group-hover:scale-110 transition-transform shadow-sm`}>
                  <item.icon className={`w-6 h-6 lg:w-8 lg:h-8 ${item.color}`} />
                </div>
                <p className="text-slate-400 text-[9px] lg:text-[10px] font-black uppercase tracking-[0.15em] lg:tracking-[0.2em] leading-tight flex-1">{item.label}</p>
              </div>
              <div className="w-full">
                <h3 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tighter break-words leading-none" title={item.val.toString()}>{item.val}</h3>
              </div>
            </div>
            <div className="flex items-center justify-between w-full mt-auto">
               <span className="text-[8px] lg:text-[9px] font-black text-slate-400 uppercase bg-slate-50 px-3 py-1.5 lg:px-4 lg:py-2 rounded-xl lg:rounded-2xl border border-slate-100">{item.sub}</span>
               <div className={`w-2 h-2 shrink-0 rounded-full ${item.color.replace('text', 'bg')} animate-pulse`} />
            </div>
          </button>
        ))}
      </div>

      {/* BARRA DE ACCIÓN SUPREMA */}
      <div className="bg-white/90 backdrop-blur-3xl p-4 lg:p-6 rounded-[3rem] lg:rounded-[4rem] border border-slate-100 shadow-2xl flex flex-col xl:flex-row gap-4 lg:gap-6 items-center sticky top-6 z-40">
        <div className="relative flex-1 group w-full">
          <Search className="absolute left-6 lg:left-8 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 w-5 h-5 lg:w-6 lg:h-6 transition-colors" />
          <input 
            type="text" 
            placeholder="Escanear código de barras o buscar medicamento/sección..." 
            className="w-full pl-14 lg:pl-20 pr-6 lg:pr-10 py-4 lg:py-6 bg-slate-50 border-none rounded-[2rem] lg:rounded-[2.5rem] text-base lg:text-lg font-bold focus:bg-white focus:ring-[10px] lg:focus:ring-[15px] focus:ring-indigo-600/5 transition-all outline-none shadow-inner"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-3 lg:gap-4 w-full xl:w-auto">
          <button onClick={handleExport} className="w-full sm:w-auto justify-center px-6 lg:px-10 py-4 lg:py-6 bg-white border-2 border-slate-100 rounded-[2rem] lg:rounded-[2.5rem] text-[10px] lg:text-xs font-black text-slate-600 flex items-center gap-2 lg:gap-3 hover:border-indigo-600 hover:text-indigo-600 transition-all active:scale-95 shadow-sm">
             <FileText className="w-4 h-4 lg:w-5 lg:h-5" /> AUDITORÍA EXCEL
          </button>
          <button 

            onClick={() => {
              setFormData({ 
                id: '', producto_id: '', codigo: '', nombre: '', laboratorio_id: '',
                fecha_vencimiento: '', cajas: 0, blisters: 0, unidades: 0,
                blisters_por_caja: 1, unidades_por_blister: 1,
                precio_caja: 0, precio_blister: 0, precio_unidad: 0, 
                porcentaje_ganancia: 20, margen_blister: 20, margen_unidad: 30,
                lote: '', registro_invima: '', seccion: '', ubicacion: ''
              })
              setIsModalOpen(true)
            }}
            className="w-full sm:w-auto justify-center bg-indigo-600 text-white px-8 lg:px-12 py-4 lg:py-6 rounded-[2rem] lg:rounded-[2.5rem] text-[11px] lg:text-sm font-black flex items-center gap-2 lg:gap-4 hover:bg-indigo-700 hover:shadow-2xl hover:shadow-indigo-200 transition-all active:scale-95 whitespace-nowrap"
          >
            <Plus className="w-5 h-5 lg:w-6 lg:h-6" /> AGREGAR PRODUCTO
          </button>
        </div>
      </div>

      {/* TABLA DE ALTA DENSIDAD SUPREME */}
      <div className="bg-white rounded-[3rem] border border-slate-100 shadow-[0_40px_80px_-15px_rgba(0,0,0,0.08)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100">
                <th className="px-8 py-5 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Medicamento / Legal</th>
                <th className="px-4 py-5 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Sección</th>
                <th className="px-4 py-5 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Vencimiento</th>
                <th className="px-4 py-5 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Stock (C/B/U)</th>
                <th className="px-4 py-5 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Venta (PVP)</th>
                <th className="px-8 py-5 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paginatedData.map((item) => {
                const pvCaja = calculatePV(item.precio_caja, item.margen_caja || item.porcentaje_ganancia)
                const pvBlister = calculatePV(item.precio_blister, item.margen_blister)
                const pvUnidad = calculatePV(item.precio_unidad, item.margen_unidad)
                
                const expStatus = getExpirationStatus(item.fecha_vencimiento)
                const isCritical = item.cajas <= 2

                return (
                  <tr key={item.inventario_id} className="hover:bg-slate-50/80 transition-all group">
                    <td className="px-8 py-4">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all bg-slate-100 text-slate-400 group-hover:bg-white group-hover:shadow-lg`}>
                           <Package className="w-6 h-6" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-2">
                             <div className="flex items-center gap-2">
                             <span className="text-sm font-black text-slate-900 uppercase truncate max-w-[200px] leading-tight group-hover:text-indigo-600" title={item.nombre_producto}>{item.nombre_producto}</span>
                             <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">{item.codigo}</span>
                          </div>
                             <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">{item.codigo}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                             <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">{item.laboratorio || 'S.L'}</span>
                             <span className="text-[9px] font-black text-white bg-slate-900 px-2 py-0.5 rounded-lg">Lote: {item.lote || 'N/A'}</span>
                             <span className="text-[10px] font-bold text-slate-400 truncate max-w-[80px]">INVIMA: {item.registro_invima || 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-4 text-center">
                       <div className="flex flex-col items-center gap-1">
                          <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100 uppercase">{item.seccion || 'General'}</span>
                          {item.ubicacion && <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{item.ubicacion}</span>}
                       </div>
                    </td>

                    <td className="px-4 py-4 text-center">
                       <div className="flex flex-col items-center gap-1">
                          <div className={`w-3 h-3 rounded-full ${expStatus.color}`} />
                          <span className="text-[10px] font-black text-slate-900">{item.fecha_vencimiento ? format(parseISO(item.fecha_vencimiento), 'dd MMM yyyy') : 'N/A'}</span>
                       </div>
                    </td>

                    <td className="px-4 py-4 text-center">
                      <div className={`inline-flex items-center gap-3 px-4 py-2 rounded-2xl border font-black text-xs ${isCritical ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-slate-50 border-slate-100 text-slate-700'}`}>
                        <div className="flex flex-col items-center"><span className="text-[8px] text-slate-400">C</span>{item.cajas}</div>
                        <div className="w-px h-4 bg-slate-200" />
                        <div className="flex flex-col items-center"><span className="text-[8px] text-slate-400">B</span>{item.blisters}</div>
                        <div className="w-px h-4 bg-slate-200" />
                        <div className="flex flex-col items-center"><span className="text-[8px] text-slate-400">U</span>{item.unidades}</div>
                      </div>
                    </td>

                    <td className="px-4 py-4">
                      <div className="flex justify-center gap-4 text-[11px] font-black">
                        <div className="flex flex-col items-center text-emerald-600"><span className="text-[8px] uppercase font-black">Caja</span>${pvCaja.toLocaleString()}</div>
                        <div className="flex flex-col items-center text-emerald-600/60"><span className="text-[8px] uppercase font-black">Blis</span>${pvBlister.toLocaleString()}</div>
                        <div className="flex flex-col items-center text-emerald-600/60"><span className="text-[8px] uppercase font-black">Unid</span>${pvUnidad.toLocaleString()}</div>
                      </div>
                    </td>

                    <td className="px-8 py-4 text-right">
                       <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openHistory(item)} className="w-8 h-8 flex items-center justify-center bg-white hover:bg-amber-500 hover:text-white rounded-xl border border-slate-200 transition-all shadow-sm"><History className="w-4 h-4" /></button>
                          <button onClick={() => { selectProduct(item); setIsModalOpen(true); }} className="w-8 h-8 flex items-center justify-center bg-white hover:bg-slate-900 hover:text-white rounded-xl border border-slate-200 transition-all shadow-sm"><Edit3 className="w-4 h-4" /></button>
                       </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* TERMINAL DE ABASTECIMIENTO ROBUSTA (Sidebar XXL) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-end bg-slate-900/80 backdrop-blur-md p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-3xl h-[calc(100vh-3rem)] rounded-[5rem] shadow-2xl flex flex-col animate-in slide-in-from-right duration-500 overflow-hidden relative border border-white/20">
            
            <div className="p-8 pb-4 flex justify-between items-center bg-slate-50/50">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tighter uppercase leading-none">{formData.id ? 'Editar Producto' : 'Nuevo Ingreso'}</h2>
                <p className="text-indigo-600 text-[10px] font-black uppercase tracking-[0.3em] mt-2 flex items-center gap-2"><Package className="w-3 h-3" /> Gestión de Existencias</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="w-14 h-14 bg-white hover:bg-rose-50 hover:text-rose-600 flex items-center justify-center rounded-2xl transition-all shadow-lg active:scale-90 border border-slate-100">
                <Plus className="w-8 h-8 rotate-45" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar">
              <form id="matrix-form" onSubmit={handleSubmit} className="space-y-12">
                
                {/* Identificación */}
                <div className="grid grid-cols-3 gap-6">
                   <div className="col-span-1 space-y-4">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] px-4">Código</label>
                      <input 
                        type="text" 
                        placeholder="ID..." 
                        className="w-full p-6 bg-slate-50 border-4 border-transparent rounded-[2.5rem] text-xl font-black focus:bg-white focus:border-indigo-600/10 outline-none transition-all shadow-inner" 
                        value={formData.codigo} 
                        onChange={(e) => {
                          const val = e.target.value
                          handleInputChange('codigo', val)
                          // Buscar producto por código automáticamente
                          const found = initialData.find(p => p.codigo === val)
                          if (found) {
                            setFormData(prev => ({
                              ...prev,
                              producto_id: found.producto_id,
                              nombre: found.nombre_producto,
                              laboratorio_id: found.laboratorio_id || '',
                              seccion: found.seccion || ''
                            }))
                          }
                        }}
                      />
                   </div>
                   <div className="col-span-2 space-y-4">
                      <label className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] px-4">Nombre del Medicamento</label>
                      <input 
                        type="text" 
                        placeholder="Escribir nombre..." 
                        className="w-full p-6 bg-slate-50 border-4 border-transparent rounded-[2.5rem] text-xl font-black focus:bg-white focus:border-indigo-600/10 outline-none transition-all shadow-inner" 
                        value={formData.nombre} 
                        onChange={(e) => handleInputChange('nombre', e.target.value)} 
                        required 
                      />
                   </div>
                </div>

                {/* Sección y Laboratorio */}
                <div className="grid grid-cols-2 gap-8">
                   <div className="space-y-4">
                      <label className="text-xs font-black text-slate-400 uppercase px-4 flex justify-between items-center">
                        Laboratorio
                        {!isAddingLab && (
                          <button type="button" onClick={() => setIsAddingLab(true)} className="text-indigo-600 hover:underline">+ Nuevo</button>
                        )}
                      </label>
                      {isAddingLab ? (
                        <div className="flex gap-2">
                          <input type="text" className="flex-1 p-4 bg-slate-50 rounded-2xl font-black outline-none border-2 border-indigo-200" value={newLabName} onChange={e => setNewLabName(e.target.value)} placeholder="Nombre..." />
                          <button type="button" onClick={handleAddLab} className="p-4 bg-indigo-600 text-white rounded-2xl"><Check className="w-5 h-5"/></button>
                          <button type="button" onClick={() => setIsAddingLab(false)} className="p-4 bg-slate-200 text-slate-600 rounded-2xl"><Plus className="w-5 h-5 rotate-45"/></button>
                        </div>
                      ) : (
                        <select className="w-full p-6 bg-slate-50 rounded-[2rem] font-black outline-none border-4 border-transparent focus:border-indigo-100" value={formData.laboratorio_id} onChange={e => handleInputChange('laboratorio_id', e.target.value)}>
                           <option value="">Seleccionar Laboratorio...</option>
                           {localLabs.map(l => <option key={l.id} value={l.id}>{l.nombre}</option>)}
                        </select>
                      )}
                   </div>
                   <div className="space-y-4">
                      <label className="text-xs font-black text-slate-400 uppercase px-4">Sección / Categoría</label>
                      <select className="w-full p-6 bg-slate-50 rounded-[2rem] font-black outline-none border-4 border-transparent focus:border-indigo-100" value={formData.seccion} onChange={e => handleInputChange('seccion', e.target.value)}>
                         <option value="">Seleccionar Sección...</option>
                         {SECCIONES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                   </div>
                </div>

                <div className="grid grid-cols-3 gap-8">
                   <div className="space-y-4">
                      <label className="text-xs font-black text-slate-400 uppercase px-4">Lote No.</label>
                      <input type="text" className="w-full p-6 bg-slate-50 rounded-[2rem] font-black outline-none border-4 border-transparent focus:border-indigo-100" value={formData.lote} onChange={e => handleInputChange('lote', e.target.value)} placeholder="Ej: L9082..." />
                   </div>
                   <div className="space-y-4">
                      <label className="text-xs font-black text-slate-400 uppercase px-4">Reg. INVIMA</label>
                      <input type="text" className="w-full p-6 bg-slate-50 rounded-[2rem] font-black outline-none border-4 border-transparent focus:border-indigo-100" value={formData.registro_invima} onChange={e => handleInputChange('registro_invima', e.target.value)} placeholder="Ej: 2023M..." />
                   </div>
                   <div className="space-y-4">
                      <label className="text-xs font-black text-slate-400 uppercase px-4">Vencimiento</label>
                      <input type="date" required className="w-full p-6 bg-slate-50 rounded-[2rem] font-black outline-none border-4 border-transparent focus:border-indigo-100" value={formData.fecha_vencimiento} onChange={e => handleInputChange('fecha_vencimiento', e.target.value)} />
                   </div>
                </div>

                <div className="space-y-4">
                  <label className="text-xs font-black text-slate-400 uppercase px-4">Ubicación Detallada (Módulo/Estante)</label>
                  <input type="text" className="w-full p-6 bg-slate-50 rounded-[2rem] font-black outline-none border-4 border-transparent focus:border-indigo-100" value={formData.ubicacion} onChange={e => handleInputChange('ubicacion', e.target.value)} placeholder="Ej: Módulo A - Fila 2" />
                </div>

                {/* Matriz de Conversión */}
                <div className="bg-indigo-50/50 p-8 rounded-[3rem] border border-indigo-100 space-y-6">
                   <div className="flex items-center gap-4 text-indigo-600 font-black uppercase text-[10px] tracking-widest"><Calculator className="w-4 h-4" /> Matriz de Empaque</div>
                   <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase text-center block">Blísters por Caja</label>
                        <input type="number" min="1" className="w-full p-5 bg-white rounded-2xl text-center text-xl font-black outline-none border border-indigo-100 shadow-sm" value={formData.blisters_por_caja} onChange={e => setFormData({...formData, blisters_por_caja: parseInt(e.target.value) || 1})} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase text-center block">Unidades por Blíster</label>
                        <input type="number" min="1" className="w-full p-5 bg-white rounded-2xl text-center text-xl font-black outline-none border border-indigo-100 shadow-sm" value={formData.unidades_por_blister} onChange={e => setFormData({...formData, unidades_por_blister: parseInt(e.target.value) || 1})} />
                      </div>
                   </div>
                </div>

                {/* Existencias */}
                <div className="bg-slate-50 p-8 rounded-[3rem] border border-slate-100 space-y-6 shadow-inner">
                   <p className="text-xs font-black text-indigo-600 uppercase tracking-widest flex items-center gap-3"><Package className="w-4 h-4"/> Conteo Físico</p>
                   <div className="grid grid-cols-3 gap-6">
                      {[ {l:'Cajas',k:'cajas'}, {l:'Blísters',k:'blisters'}, {l:'Unidades',k:'unidades'} ].map((x, i) => (
                        <div key={i} className="text-center">
                           <label className="text-[10px] font-black text-slate-400 uppercase mb-3 block">{x.l}</label>
                           <input type="number" className="w-full bg-white border-2 border-slate-100 rounded-[2rem] p-6 text-center text-3xl font-black outline-none shadow-xl focus:ring-indigo-600/5 transition-all" value={(formData as any)[x.k]} onChange={e => setFormData({...formData, [x.k]: parseInt(e.target.value) || 0})} />
                        </div>
                      ))}
                   </div>
                </div>

                {/* Precios */}
                <div className="bg-emerald-50/50 p-8 rounded-[3rem] border border-emerald-100 space-y-8 shadow-xl">
                   <label className="text-xs font-black text-emerald-600 uppercase block text-center tracking-widest">Costo Adquisición (Caja)</label>
                   <input type="number" step="0.01" className="w-full bg-white border-4 border-emerald-100 rounded-[2rem] p-5 text-center text-4xl font-black text-emerald-700 outline-none shadow-xl focus:ring-emerald-600/5 transition-all" value={formData.precio_caja} onChange={e => setFormData({...formData, precio_caja: parseFloat(e.target.value) || 0})} />

                   <div className="grid grid-cols-3 gap-6">
                      {[ 
                        {l:'PVP Caja', v:formData.precio_caja, m:formData.porcentaje_ganancia}, 
                        {l:'PVP Blíster', v:formData.precio_blister, m:formData.margen_blister}, 
                        {l:'PVP Unidad', v:formData.precio_unidad, m:formData.margen_unidad} 
                      ].map((x, i) => (
                        <div key={i} className="bg-white p-5 rounded-[2.5rem] border-2 border-emerald-50 shadow-xl text-center space-y-2 transform hover:scale-105 transition-transform">
                           <span className="text-[10px] font-black text-slate-400 uppercase block tracking-widest">{x.l}</span>
                           <span className="text-2xl font-black text-emerald-700 block tracking-tighter">
                             ${calculatePV(x.v, x.m).toLocaleString()}
                           </span>
                           <span className="text-[9px] font-bold text-emerald-500/60 block italic">Margen: {x.m}%</span>
                        </div>
                      ))}
                   </div>

                   <div className="grid grid-cols-3 gap-6">
                      {[ 
                        {l:'Margen Caja %', k:'porcentaje_ganancia'}, 
                        {l:'Margen Blíster %', k:'margen_blister'}, 
                        {l:'Margen Unidad %', k:'margen_unidad'} 
                      ].map((x, i) => (
                        <div key={i} className="text-center space-y-4">
                           <label className="text-[9px] font-black text-emerald-600 uppercase block tracking-widest">{x.l}</label>
                           <div className="flex items-center justify-center gap-3">
                              <button type="button" onClick={() => setFormData(p=>({...p, [x.k]: Math.max(0, (p as any)[x.k] - 5)}))} className="w-8 h-8 bg-emerald-600 text-white rounded-full flex items-center justify-center text-sm font-black shadow-lg">-</button>
                              <span className="text-xl font-black text-emerald-700">{(formData as any)[x.k]}%</span>
                              <button type="button" onClick={() => setFormData(p=>({...p, [x.k]: (p as any)[x.k] + 5}))} className="w-8 h-8 bg-emerald-600 text-white rounded-full flex items-center justify-center text-sm font-black shadow-lg">+</button>
                           </div>
                        </div>
                      ))}
                   </div>
                </div>
              </form>
            </div>

            <div className="p-10 bg-slate-900 border-t border-white/10 flex gap-6">
              <button form="matrix-form" disabled={loading} className="flex-1 bg-indigo-600 text-white p-6 rounded-3xl text-xl font-black hover:bg-indigo-700 transition-all shadow-2xl flex items-center justify-center gap-4 disabled:opacity-50 active:scale-95 group">
                {loading ? 'PROCESANDO...' : 'CONFIRMAR CAMBIOS'}
                <Check className="w-6 h-6 group-hover:scale-110 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Historial Auditoría */}
      {showHistory && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/90 backdrop-blur-xl p-6 animate-in fade-in">
           <div className="bg-white w-full max-w-3xl rounded-[5rem] shadow-2xl p-16 space-y-12 animate-in zoom-in-95">
              <div className="flex justify-between items-center">
                 <div className="flex items-center gap-6">
                    <div className="p-6 bg-amber-100 text-amber-600 rounded-[2.5rem]"><History className="w-10 h-10" /></div>
                    <div><h2 className="text-4xl font-black text-slate-900 uppercase tracking-tighter">Bitácora de Auditoría</h2><p className="text-slate-400 text-sm font-black uppercase tracking-widest">Trazabilidad inalterable</p></div>
                 </div>
                 <button onClick={() => setShowHistory(false)} className="p-6 bg-slate-50 rounded-3xl hover:bg-rose-50 hover:text-rose-600 transition-all"><Plus className="w-10 h-10 rotate-45" /></button>
              </div>
              <div className="space-y-8 max-h-[50vh] overflow-y-auto pr-4 custom-scrollbar">
                 {realHistory.length > 0 ? realHistory.map((log, i) => (
                   <div key={i} className="flex gap-8 p-10 bg-slate-50 rounded-[3.5rem] border border-slate-100 relative overflow-hidden group">
                      <div className={`w-2 rounded-full group-hover:w-4 transition-all ${log.accion === 'ENTRADA' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                      <div className="flex-1">
                         <div className="flex justify-between items-start mb-3">
                            <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest">{format(parseISO(log.created_at), 'dd MMM, hh:mm bbb', { locale: es })}</p>
                            <span className={`px-3 py-1 rounded-full text-[9px] font-black text-white ${log.accion === 'ENTRADA' ? 'bg-emerald-500' : 'bg-amber-500'}`}>{log.accion}</span>
                         </div>
                         <p className="text-xl font-black text-slate-900 mb-2 uppercase tracking-tighter">OPERADOR: {log.operador ? log.operador.split('@')[0] : 'SISTEMA'}</p>
                         <p className="text-base text-slate-500 leading-relaxed">{log.detalles}</p>
                      </div>
                   </div>
                 )) : (
                   <div className="text-center py-20 bg-slate-50 rounded-[4rem] border-2 border-dashed border-slate-200">
                      <Info className="w-16 h-16 text-slate-300 mx-auto mb-6" />
                      <p className="text-slate-400 font-black uppercase tracking-widest">Sin registros de auditoría</p>
                   </div>
                 )}
              </div>
              <button onClick={() => setShowHistory(false)} className="w-full bg-slate-900 text-white p-8 rounded-[3rem] text-xl font-black uppercase tracking-widest shadow-2xl active:scale-95 transition-all">Cerrar</button>
           </div>
        </div>
      )}
    </div>
  )
}

function calculateNetProfit(cost: number, margin: number) {
  return (cost * margin / 100)
}
