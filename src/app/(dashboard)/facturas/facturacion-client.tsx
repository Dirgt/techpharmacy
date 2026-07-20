/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { Search, Plus, Minus, Trash2, ShoppingCart, Wallet, ReceiptText, CheckCircle2, BarChart2, FileDown, RefreshCw, ChevronDown, X, Building2, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { crearFactura, FacturaData, FacturaItem, marcarComoPagada } from '@/app/actions/facturas'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { abrirCaja, cerrarCaja } from '@/app/actions/caja'

export function FacturacionClient({ 
  inventarioInitial, 
  vendedores,
  cajaAbierta
}: { 
  inventarioInitial: any[],
  vendedores: any[],
  cajaAbierta: any
}) {
  const router = useRouter()
  
  // --- STATE ---
  const [activeTab, setActiveTab] = useState<'pos' | 'ventas'>('pos')
  const [searchTerm, setSearchTerm] = useState('')
  const [cart, setCart] = useState<FacturaItem[]>([])
  // --- Vendedor (obligatorio, auto-default al primer vendedor) ---
  const [vendedorId, setVendedorId] = useState<string>(vendedores?.[0]?.id || '')
  // --- Cliente ---
  const [clienteSearch, setClienteSearch] = useState('')
  const [clienteSelected, setClienteSelected] = useState<any | null>(null)
  const [clienteResults, setClienteResults] = useState<any[]>([])
  const [showClienteDropdown, setShowClienteDropdown] = useState(false)
  const [showClienteForm, setShowClienteForm] = useState(false)
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: '', documento: '', tipo_doc: 'CC', tipo_cliente: 'persona', telefono: '', email: '' })
  const [savingCliente, setSavingCliente] = useState(false)
  // --- Pago y proceso ---
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'tarjeta' | 'transferencia'>('efectivo')
  const [tipoVenta, setTipoVenta] = useState<'contado' | 'credito'>('contado')
  const [condicionPagoDias, setCondicionPagoDias] = useState<number>(0)
  const [ordenCompra, setOrdenCompra] = useState('')
  const [descuentoPct, setDescuentoPct] = useState<number>(0)
  const [ivaPct, setIvaPct] = useState<number>(0)
  const [efectivoRecibido, setEfectivoRecibido] = useState<string>('')
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false)
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [createdFacturaId, setCreatedFacturaId] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isOpeningCaja, setIsOpeningCaja] = useState(false)
  const [montoApertura, setMontoApertura] = useState('0')
  const [ventasHoy, setVentasHoy] = useState<any[]>([])
  const [loadingVentas, setLoadingVentas] = useState(false)
  const [subTabVentas, setSubTabVentas] = useState<'historial' | 'cartera'>('historial')
  const [expandedFacturaId, setExpandedFacturaId] = useState<string | null>(null)
  const [nextFacturaNum, setNextFacturaNum] = useState<number | null>(null)

  const [showCloseCajaModal, setShowCloseCajaModal] = useState(false)
  const [isClosingCaja, setIsClosingCaja] = useState(false)
  const [efectivoCierreManual, setEfectivoCierreManual] = useState('')

  // Obtener numero de factura consecutivo exacto desde la DB
  useEffect(() => {
    async function fetchNextFacturaNum() {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('facturas')
        .select('numero')
        .order('numero', { ascending: false })
        .limit(1)
        .maybeSingle()
      
      if (!error && data) {
        setNextFacturaNum(data.numero + 1)
      } else {
        // Fallback si no hay facturas
        setNextFacturaNum(1)
      }
    }
    fetchNextFacturaNum()
  }, [])

  const ventasCreditoPendientes = useMemo(() => 
    ventasHoy.filter(f => f.tipo_venta === 'credito' && f.estado_pago === 'pendiente')
  , [ventasHoy])

  // --- DERIVED STATE ---
  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return []
    const term = searchTerm.toLowerCase()
    return inventarioInitial.filter(item => 
      item.nombre_producto?.toLowerCase().includes(term) ||
      item.codigo_producto?.toLowerCase().includes(term) ||
      item.laboratorio_nombre?.toLowerCase().includes(term) ||
      item.principio_activo?.toLowerCase().includes(term) ||
      item.seccion?.toLowerCase().includes(term)
    ).slice(0, 10) // Limit to 10 for performance
  }, [searchTerm, inventarioInitial])

  // cartTotal = suma bruta sin descuento ni IVA
  const cartSubtotalBruto = useMemo(() =>
    cart.reduce((sum, item) => sum + item.precio_unitario_base, 0)
  , [cart])

  const cartDescuentoMonto = useMemo(() =>
    cart.reduce((sum, item) => sum + (item.precio_unitario_base - item.precio_linea), 0)
  , [cart])

  const cartBaseIva = useMemo(() => cartSubtotalBruto - cartDescuentoMonto, [cartSubtotalBruto, cartDescuentoMonto])

  const cartIvaMonto = useMemo(() =>
    Math.round(cartBaseIva * (ivaPct / 100))
  , [cartBaseIva, ivaPct])

  const cartTotal = useMemo(() => cartBaseIva + cartIvaMonto, [cartBaseIva, cartIvaMonto])
  
  const vueltas = useMemo(() => {
    const recibido = Number(efectivoRecibido.replace(/\D/g, '')) || 0;
    return Math.max(0, recibido - cartTotal);
  }, [efectivoRecibido, cartTotal])

  const kpisVentas = useMemo(() => {
    let total = 0, efectivo = 0, tarjeta = 0, transferencia = 0
    ventasHoy.forEach(f => {
      const t = Number(f.total) || 0
      total += t
      if (f.metodo_pago === 'efectivo') efectivo += t
      else if (f.metodo_pago === 'tarjeta') tarjeta += t
      else transferencia += t
    })
    return { total, efectivo, tarjeta, transferencia, count: ventasHoy.length, promedio: ventasHoy.length > 0 ? total / ventasHoy.length : 0 }
  }, [ventasHoy])

  const topProductos = useMemo(() => {
    const map = new Map<string, { nombre: string, total: number, count: number }>()
    ventasHoy.forEach(f => {
      f.detalles?.forEach((d: any) => {
        const prodId = d.producto_id
        const current = map.get(prodId) || { nombre: d.producto?.nombre || 'Producto', total: 0, count: 0 }
        current.count += (d.cantidad_cajas || 0) + (d.cantidad_blisters || 0) + (d.cantidad_unidades || 0)
        current.total += Number(d.precio_unitario) || 0
        map.set(prodId, current)
      })
    })
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 5)
  }, [ventasHoy])

  const fetchVentas = useCallback(async () => {
    setLoadingVentas(true)
    try {
      if (!cajaAbierta?.id) return
      // Llamada directa a la API Route con cache desactivado para garantizar datos frescos
      const res = await fetch(`/api/ventas-sesion?cajaId=${cajaAbierta.id}`, { cache: 'no-store' })
      const json = await res.json()
      if (json.success) {
        setVentasHoy(json.data)
      } else {
        toast.error('Error cargando ventas')
      }
    } catch {
      toast.error('Error de conexión al cargar ventas')
    }
    setLoadingVentas(false)
  }, [])

  useEffect(() => {
    if (activeTab === 'ventas') fetchVentas()
  }, [activeTab, fetchVentas])

  // Auto-aplicar descuento y crédito cuando se selecciona cliente tipo distribuidor
  useEffect(() => {
    if (clienteSelected?.tipo_cliente === 'distribuidor') {
      setDescuentoPct(10)
      setTipoVenta('credito')
      setCondicionPagoDias(30)
      toast.info('Cliente Distribuidor: Descuento 10% y Crédito 30d auto-aplicados')
    } else {
      // Opcional: resetear al cambiar a cliente normal
      setDescuentoPct(0)
      setTipoVenta('contado')
      setCondicionPagoDias(0)
    }
  }, [clienteSelected])

  // Recalcular precios de cada item en el carrito cuando cambia el descuento global
  useEffect(() => {
    setCart(prev => prev.map(item => {
      if (item.descuento_porcentaje === descuentoPct) return item;
      return {
        ...item,
        descuento_porcentaje: descuentoPct,
        precio_linea: item.precio_unitario_base * (1 - (descuentoPct / 100))
      }
    }))
  }, [descuentoPct])

  const exportarCSV = () => {
    if (ventasHoy.length === 0) return
    const header = 'Factura,Fecha,Vendedor,Cliente,Documento,Metodo,Total'
    const rows = ventasHoy.map(f =>
      `${f.numero},"${new Date(f.created_at).toLocaleString()}","${f.vendedor?.full_name || 'N/A'}","${f.cliente_nombre}","${f.cliente_documento}","${f.metodo_pago}",${f.total}`
    ).join('\n')
    const uri = "data:text/csv;charset=utf-8," + encodeURI(header + '\n' + rows)
    const link = document.createElement('a')
    link.href = uri
    link.download = `ventas_${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // --- HANDLERS ---
  const addToCart = (product: any) => {
    setCart(prev => {
      const existing = prev.find(item => item.producto_id === product.producto_id)
      if (existing) {
        // Increment unidades by default
        return prev.map(item => {
          if (item.producto_id === product.producto_id) {
            const newUnidades = item.cantidad_unidades + 1
            const newPrice = calculateLinePrice(product, item.cantidad_cajas, item.cantidad_blisters, newUnidades)
            return { ...item, cantidad_unidades: newUnidades, precio_linea: newPrice }
          }
          return item
        })
      }

      // Add new item
      const newItem: FacturaItem = {
        producto_id: product.producto_id,
        nombre: product.nombre_producto,
        cantidad_cajas: 0,
        cantidad_blisters: 0,
        cantidad_unidades: 1, 
        precio_unitario_base: Number(product.precio_unidad || 0),
        descuento_porcentaje: descuentoPct,
        precio_linea: Number(product.precio_unidad || 0) * (1 - (descuentoPct / 100)),
        precio_linea_original: Number(product.precio_unidad || 0)
      }
      return [...prev, newItem]
    })
    setSearchTerm('')
    toast.success(`${product.nombre_producto} agregado al carrito`)
  }

  const updateQuantity = (producto_id: string, field: 'cantidad_cajas' | 'cantidad_blisters' | 'cantidad_unidades', value: number) => {
    if (value < 0) return

    setCart(prev => prev.map(item => {
      if (item.producto_id === producto_id) {
        const productDef = inventarioInitial.find(p => p.producto_id === producto_id)
        if (!productDef) return item

        const updatedItem = { ...item, [field]: value }
        
        const basePrice = calculateLinePrice(productDef, updatedItem.cantidad_cajas, updatedItem.cantidad_blisters, updatedItem.cantidad_unidades)
        updatedItem.precio_unitario_base = basePrice
        updatedItem.descuento_porcentaje = descuentoPct
        updatedItem.precio_linea = basePrice * (1 - (descuentoPct / 100))
        
        return updatedItem
      }
      return item
    }))
  }

  const removeFromCart = (producto_id: string) => {
    setCart(prev => prev.filter(item => item.producto_id !== producto_id))
  }

  const calculateLinePrice = (productDef: any, cajas: number, blisters: number, unidades: number) => {
    const pc = Number(productDef.precio_caja || 0) * cajas
    const pb = Number(productDef.precio_blister || 0) * blisters
    const pu = Number(productDef.precio_unidad || 0) * unidades
    return pc + pb + pu
  }

  const handleProcessSale = async () => {
    if (!cajaAbierta) {
      toast.error('Debes abrir la caja primero')
      return
    }
    if (!vendedorId) {
      toast.error('Selecciona un vendedor')
      return
    }
    if (cart.length === 0) {
      toast.error('El carrito está vacío')
      return
    }
    
    for (const item of cart) {
      const productDef = inventarioInitial.find(p => p.producto_id === item.producto_id)
      if (productDef) {
        if (item.cantidad_cajas > productDef.cajas || 
            item.cantidad_blisters > productDef.blisters || 
            item.cantidad_unidades > productDef.unidades) {
          toast.error(`Stock insuficiente para ${item.nombre}. Revisa las cantidades.`)
          return
        }
      }
    }

    setIsProcessing(true)
    const payload: FacturaData = {
      cliente_nombre:        clienteSelected?.nombre || 'Consumidor Final',
      cliente_documento:     clienteSelected?.documento || '000000000',
      metodo_pago:           metodoPago,
      tipo_venta:            tipoVenta,
      condicion_pago_dias:   tipoVenta === 'credito' ? condicionPagoDias : 0,
      orden_compra:          ordenCompra || undefined,
      subtotal_bruto:        cartSubtotalBruto,
      descuento_porcentaje:  descuentoPct,
      descuento_monto:       cartDescuentoMonto,
      iva_porcentaje:        ivaPct,
      iva_total:             cartIvaMonto,
      total:                 cartTotal,
      vendedor_id:           vendedorId,
      caja_sesion_id:        cajaAbierta.id,
      items:                 cart.map(i => ({ ...i, precio_linea_original: i.precio_linea }))
    }

    const res = await crearFactura(payload)
    if (res.success) {
      toast.success(`Factura #${res.factura?.numero} — ${tipoVenta === 'credito' ? `Crédito ${condicionPagoDias}d` : 'Contado'}`)
      setCart([])
      setClienteSelected(null)
      setClienteSearch('')
      setOrdenCompra('')
      setDescuentoPct(0)
      setIvaPct(0)
      setTipoVenta('contado')
      setCondicionPagoDias(0)
      router.refresh()
      fetchVentas()
      
      if (res.factura?.id) {
        setCreatedFacturaId(res.factura.id)
        setShowPrintModal(true)
      }
    } else {
      toast.error(res.error || 'Error al procesar la venta')
    }
    setIsProcessing(false)
  }

  const handleAbrirCaja = async () => {
    if (!montoApertura || isNaN(Number(montoApertura))) {
      toast.error('Monto inválido')
      return
    }
    setIsOpeningCaja(true)
    const res = await abrirCaja(Number(montoApertura))
    if (res.success) {
      toast.success('Caja abierta exitosamente')
      router.refresh()
    } else {
      toast.error(res.error || 'Error al abrir caja')
    }
    setIsOpeningCaja(false)
  }

  const handleCerrarCaja = async () => {
    if (!cajaAbierta) return
    const efectivoFinal = Number(efectivoCierreManual.replace(/\D/g, '')) || 0
    setIsClosingCaja(true)
    const res = await cerrarCaja(cajaAbierta.id, efectivoFinal)
    if (res.success) {
      toast.success('Caja cerrada exitosamente')
      setShowCloseCajaModal(false)
      router.refresh()
    } else {
      toast.error(res.error || 'Error al cerrar caja')
    }
    setIsClosingCaja(false)
  }

  if (!cajaAbierta) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-[calc(100vh-8rem)] bg-white rounded-[3rem] border border-slate-100 shadow-2xl p-10 text-center animate-in fade-in duration-1000">
        <div className="w-24 h-24 bg-rose-50 rounded-full flex items-center justify-center mb-6">
          <Wallet className="w-12 h-12 text-rose-500" />
        </div>
        <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">La caja está cerrada</h2>
        <p className="text-slate-500 font-bold mb-8 max-w-md">No puedes realizar ventas hasta que se inicie una nueva sesión de caja. Ingresa el dinero base para comenzar.</p>
        
        <div className="flex flex-col gap-4 w-full max-w-sm">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-black">$</span>
            <input 
              type="number" 
              value={montoApertura}
              onChange={e => {
                const val = Number(e.target.value);
                if (val >= 0) setMontoApertura(e.target.value);
              }}
              className="w-full pl-10 pr-6 py-4 bg-slate-50 border-none rounded-2xl font-black text-xl text-slate-900 focus:ring-4 focus:ring-indigo-600/10 transition-all outline-none"
              placeholder="Base en caja"
            />
          </div>
          <button 
            onClick={handleAbrirCaja}
            disabled={isOpeningCaja}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-2xl font-black text-lg transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isOpeningCaja ? 'Abriendo...' : 'Abrir Caja'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-in fade-in duration-1000 h-[calc(100vh-8rem)] flex flex-col gap-4">

      {/* TAB HEADER */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="bg-white border border-slate-100 shadow-sm rounded-2xl p-1 flex gap-1">
          <button
            onClick={() => setActiveTab('pos')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black transition-all ${activeTab === 'pos' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
          >
            <ReceiptText className="w-4 h-4" />
            Facturación POS
          </button>
          <button
            onClick={() => setActiveTab('ventas')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black transition-all ${activeTab === 'ventas' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
          >
            <BarChart2 className="w-4 h-4" />
            Ventas del Día
          </button>
        </div>

        {activeTab === 'ventas' ? (
          <div className="ml-auto flex gap-2">
            <button onClick={fetchVentas} disabled={loadingVentas} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-100 shadow-sm text-sm font-black text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${loadingVentas ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
            <button onClick={exportarCSV} disabled={ventasHoy.length === 0} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-black transition-all active:scale-95 disabled:opacity-50">
              <FileDown className="w-4 h-4" />
              Exportar CSV
            </button>
            <button onClick={() => setShowCloseCajaModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 text-sm font-black transition-all active:scale-95 ml-2">
              <Lock className="w-4 h-4" />
              Cerrar Caja
            </button>
          </div>
        ) : (
          <div className="ml-auto flex gap-2">
            <button onClick={() => setShowCloseCajaModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 text-sm font-black transition-all active:scale-95">
              <Lock className="w-4 h-4" />
              Cerrar Caja
            </button>
          </div>
        )}
      </div>

      {/* ── TABS CONTENT ── */}
      {activeTab === 'pos' ? (
        <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
          {/* LEFT: Search + Cart */}
          <div className="flex-1 flex flex-col gap-4 bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden p-4 lg:p-5 min-h-0">
            
            {/* Search Bar */}
            <div className="relative z-20 shrink-0">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 w-5 h-5 transition-colors" />
                <input 
                  type="text" 
                  placeholder="Buscar producto por nombre, código o lab..." 
                  className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:bg-white focus:ring-[6px] focus:ring-indigo-600/5 transition-all outline-none shadow-inner"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] overflow-hidden z-30">
                  {searchResults.map(item => (
                    <button key={item.producto_id} onClick={() => addToCart(item)}
                      className="w-full text-left px-5 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 flex items-center justify-between group">
                      <div>
                        <h4 className="font-black text-slate-900 text-sm group-hover:text-indigo-600 transition-colors">{item.nombre_producto}</h4>
                        {item.principio_activo && <p className="text-[10px] text-indigo-500 font-bold mb-0.5 mt-0.5 bg-indigo-50 inline-block px-1.5 py-0.5 rounded">Molécula: {item.principio_activo}</p>}
                        <p className="text-xs font-bold text-slate-400">{item.laboratorio_nombre} • {item.codigo_producto}</p>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <p className="text-emerald-600 font-black text-sm">${Number(item.precio_unidad || 0).toLocaleString()} <span className="text-[10px] text-slate-400">/u</span></p>
                        <p className="text-[10px] font-bold text-slate-400">Stock: {item.cajas}C / {item.blisters}B / {item.unidades}U</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Cart List */}
            <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar space-y-2 min-h-0">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-4">
                  <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center">
                    <ShoppingCart className="w-10 h-10" />
                  </div>
                  <p className="text-base font-black tracking-tight">El carrito está vacío</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {cart.map(item => {
                    const stockInfo = inventarioInitial.find(p => p.producto_id === item.producto_id);
                    return (
                    <div key={item.producto_id} className="bg-slate-50 p-3 rounded-2xl flex items-center justify-between gap-3 group border border-transparent hover:border-slate-200 transition-all">
                      <div className="flex-1 min-w-0 flex flex-col gap-1">
                        <p className="font-black text-slate-900 text-sm truncate">{item.nombre}</p>
                        <div className="flex items-center gap-2">
                          <p className="text-indigo-600 font-black text-base">${item.precio_linea.toLocaleString()}</p>
                          {item.descuento_porcentaje > 0 && (
                            <span className="bg-rose-100 text-rose-600 text-[8px] font-black px-1 rounded">-{item.descuento_porcentaje}%</span>
                          )}
                          {stockInfo && (
                            <span className="text-[9px] font-bold text-slate-500 bg-slate-200/50 px-1.5 py-0.5 rounded-md truncate">
                              Stock: {stockInfo.cajas}C {stockInfo.blisters}B {stockInfo.unidades}U
                            </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1 shrink-0">
                        {(['cantidad_cajas', 'cantidad_blisters', 'cantidad_unidades'] as const).map((field, idx) => {
                          const labels = ['CAJA', 'BLÍSTER', 'UNIDAD']
                          const val = item[field]
                          return (
                            <div key={field} className="flex flex-col items-center gap-0.5">
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{labels[idx]}</span>
                              <div className="flex items-center bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                                <button onClick={() => updateQuantity(item.producto_id, field, val - 1)} className="p-1.5 hover:bg-slate-100 transition-colors text-slate-700"><Minus className="w-3.5 h-3.5" /></button>
                                <span className="w-6 text-center text-sm font-black text-slate-900">{val}</span>
                                <button onClick={() => updateQuantity(item.producto_id, field, val + 1)} className="p-1.5 hover:bg-slate-100 transition-colors text-slate-700"><Plus className="w-3.5 h-3.5" /></button>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      <button onClick={() => removeFromCart(item.producto_id)} className="p-2 bg-rose-50 text-rose-500 hover:bg-rose-100 rounded-xl shrink-0 transition-colors ml-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )})}
                </div>
              )}
            </div>

          </div>{/* ── END LEFT PANEL ── */}

          {/* RIGHT: Checkout Panel (Simplified UI for older users) */}
          <div className="w-full lg:w-[380px] flex flex-col gap-3 shrink-0 min-h-0 overflow-y-auto">
            
            {/* ── HEADER DE FACTURACION ── */}
            <div className="bg-white rounded-[2rem] p-5 border-2 border-indigo-100 shadow-sm flex flex-col gap-4 shrink-0">
              <div className="text-center">
                <p className="text-slate-500 text-xs font-black uppercase tracking-widest mb-1">Total a Cobrar</p>
                <h3 className="text-5xl font-black tracking-tighter text-indigo-600 transition-all duration-300">
                  ${cartTotal.toLocaleString()}
                </h3>
              </div>

              {/* Selector de Método de Pago Grande */}
              <div className="mt-2">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-tight mb-2 text-center">Método de Pago</p>
                <div className="grid grid-cols-3 gap-2">
                  {(['efectivo', 'tarjeta', 'transferencia'] as const).map(metodo => (
                    <button 
                      key={metodo}
                      onClick={() => setMetodoPago(metodo)}
                      className={`py-3 rounded-xl font-black text-xs transition-all border-2 ${metodoPago === metodo ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm' : 'border-slate-100 bg-white text-slate-500 hover:border-slate-300'}`}
                    >
                      {metodo.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Calculadora de Vueltas (Sólo Efectivo) */}
              {metodoPago === 'efectivo' && (
                <div className="bg-slate-50 rounded-2xl p-4 mt-2 border border-slate-100">
                  <p className="text-slate-600 text-xs font-black uppercase tracking-tight mb-2 text-center">Efectivo Recibido</p>
                  
                  {/* Botones de dinero rápido */}
                  <div className="flex gap-2 mb-3 overflow-x-auto pb-1 custom-scrollbar">
                    <button onClick={() => setEfectivoRecibido(cartTotal.toString())} className="px-3 py-2 shrink-0 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors">Exacto</button>
                    <button onClick={() => setEfectivoRecibido('20000')} className="px-3 py-2 shrink-0 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors">$20k</button>
                    <button onClick={() => setEfectivoRecibido('50000')} className="px-3 py-2 shrink-0 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors">$50k</button>
                    <button onClick={() => setEfectivoRecibido('100000')} className="px-3 py-2 shrink-0 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors">$100k</button>
                  </div>

                  {/* Input de Efectivo manual */}
                  <div className="relative mb-4">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-lg">$</span>
                    <input 
                      type="text" 
                      value={efectivoRecibido ? Number(efectivoRecibido.replace(/\D/g, '') || 0).toLocaleString() : ''} 
                      onChange={e => setEfectivoRecibido(e.target.value.replace(/\D/g, ''))}
                      className="w-full pl-8 pr-4 py-3 bg-white border-2 border-slate-200 focus:border-indigo-500 rounded-xl font-black text-xl text-slate-900 text-right outline-none transition-all shadow-inner"
                      placeholder="0"
                    />
                  </div>

                  {/* Vueltas result */}
                  <div className={`p-3 rounded-xl flex items-center justify-between border-2 ${vueltas > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-100 border-slate-200 text-slate-500'}`}>
                    <span className="text-xs font-black uppercase tracking-widest">Cambio / Vueltas</span>
                    <span className="text-2xl font-black">${vueltas.toLocaleString()}</span>
                  </div>
                </div>
              )}

              {/* Botón de Opciones Avanzadas */}
              <div className="mt-2">
                <button 
                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                  className="w-full flex items-center justify-center gap-2 py-2 text-slate-400 hover:text-indigo-600 transition-colors text-[10px] font-black uppercase tracking-widest"
                >
                  <ChevronDown className={`w-3 h-3 transition-transform ${showAdvancedOptions ? 'rotate-180' : ''}`} />
                  {showAdvancedOptions ? 'Ocultar Opciones Avanzadas' : 'Opciones Avanzadas'}
                  <ChevronDown className={`w-3 h-3 transition-transform ${showAdvancedOptions ? 'rotate-180' : ''}`} />
                </button>
                
                {showAdvancedOptions && (
                  <div className="grid grid-cols-2 gap-3 mt-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                    <div className="bg-white rounded-xl p-2 border border-slate-100 relative">
                      <p className="text-slate-400 text-[8px] font-black uppercase tracking-tight mb-1">Vendedor</p>
                      <select value={vendedorId} onChange={e => setVendedorId(e.target.value)}
                        className="bg-transparent text-slate-700 font-black text-xs outline-none w-full appearance-none pr-6 cursor-pointer relative z-10">
                        <option value="">-- Seleccionar --</option>
                        {vendedores.map(v => <option key={v.id} value={v.id}>{v.full_name}</option>)}
                      </select>
                    </div>
                    <div className="bg-white rounded-xl p-2 border border-slate-100 relative">
                      <p className="text-slate-400 text-[8px] font-black uppercase tracking-tight mb-1">Condición</p>
                      <select value={tipoVenta} onChange={e => setTipoVenta(e.target.value as any)}
                        className="bg-transparent text-slate-700 font-black text-xs outline-none w-full appearance-none pr-6 cursor-pointer relative z-10">
                        <option value="contado">CONTADO</option>
                        <option value="credito">CRÉDITO</option>
                      </select>
                    </div>
                    <div className="bg-white rounded-xl p-2 border border-slate-100">
                      <p className="text-slate-400 text-[8px] font-black uppercase tracking-tight mb-1">Descuento (%)</p>
                      <input type="number" min="0" max="100" value={descuentoPct} onChange={e => setDescuentoPct(Math.max(0, Number(e.target.value) || 0))}
                        className="bg-transparent text-indigo-600 font-black text-sm outline-none w-full" />
                    </div>
                    <div className="bg-white rounded-xl p-2 border border-slate-100">
                      <p className="text-slate-400 text-[8px] font-black uppercase tracking-tight mb-1">IVA (%)</p>
                      <input type="number" min="0" max="100" value={ivaPct} onChange={e => setIvaPct(Math.max(0, Number(e.target.value) || 0))}
                        className="bg-transparent text-slate-700 font-black text-xs outline-none w-full" />
                    </div>
                    <div className="col-span-2 bg-slate-100 rounded-xl p-2 border border-slate-200 flex justify-between items-center">
                      <p className="text-slate-400 text-[8px] font-black uppercase tracking-tight">Factura # (Automática)</p>
                      <p className="text-slate-600 font-black text-xs tracking-widest">{nextFacturaNum ? nextFacturaNum : 'PENDIENTE'}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── CLIENTE ── */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4 flex flex-col gap-3 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  <span className="text-sm font-black text-slate-900">Cliente</span>
                </div>
                <button onClick={() => setShowClienteForm(!showClienteForm)}
                  className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-xl hover:bg-indigo-100 transition-all">
                  + NUEVO
                </button>
              </div>

              {clienteSelected ? (
                <div className="flex items-center gap-3 bg-indigo-50/50 border border-indigo-100 rounded-2xl px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-indigo-900 text-sm truncate">{clienteSelected.nombre}</p>
                    <p className="text-[10px] font-bold text-indigo-400 uppercase">{clienteSelected.tipo_doc}: {clienteSelected.documento}</p>
                  </div>
                  <button onClick={() => setClienteSelected(null)} className="p-2 hover:bg-indigo-200 rounded-xl text-indigo-600 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="text" value={clienteSearch} placeholder="Buscar por Nombre o NIT..."
                    className="w-full pl-11 pr-4 py-3.5 bg-slate-50 rounded-2xl text-sm font-bold outline-none border border-transparent focus:bg-white focus:border-indigo-100 transition-all"
                    onChange={async e => {
                      const val = e.target.value; setClienteSearch(val); setShowClienteDropdown(true)
                      if (val.length >= 1) {
                        const res = await fetch(`/api/clientes?q=${encodeURIComponent(val)}`, { cache: 'no-store' })
                        const json = await res.json(); setClienteResults(json.data || [])
                      }
                    }}
                    onFocus={() => setShowClienteDropdown(true)}
                  />
                  {showClienteDropdown && clienteResults.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-2xl z-40 overflow-hidden max-h-60 overflow-y-auto">
                      {clienteResults.map(c => (
                        <button key={c.id} onMouseDown={() => { setClienteSelected(c); setClienteSearch(''); setShowClienteDropdown(false) }}
                          className="w-full text-left px-4 py-3.5 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 group">
                          <p className="font-black text-slate-900 text-sm group-hover:text-indigo-600 transition-colors">{c.nombre}</p>
                          <p className="text-[10px] font-bold text-slate-400">{c.documento}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {showClienteForm && (
                <div className="bg-slate-50 rounded-2xl p-4 flex flex-col gap-2.5 border border-slate-100 mt-1 animate-in zoom-in-95 duration-200">
                  <input type="text" placeholder="Nombre completo *" value={nuevoCliente.nombre} onChange={e => setNuevoCliente(p => ({...p, nombre: e.target.value}))} className="w-full px-4 py-2.5 bg-white rounded-xl text-sm font-bold text-slate-900 outline-none border border-slate-200" />
                  <div className="grid grid-cols-2 gap-2">
                    <select value={nuevoCliente.tipo_doc} onChange={e => setNuevoCliente(p => ({...p, tipo_doc: e.target.value}))} className="px-3 py-2.5 bg-white rounded-xl text-sm font-bold outline-none border border-slate-200">
                      <option value="NIT">NIT</option>
                      <option value="CC">CC</option>
                    </select>
                    <input type="text" placeholder="Documento *" value={nuevoCliente.documento} onChange={e => setNuevoCliente(p => ({...p, documento: e.target.value}))} className="w-full px-4 py-2.5 bg-white rounded-xl text-sm font-bold text-slate-900 outline-none border border-slate-200" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="email" placeholder="Correo (opcional)" value={nuevoCliente.email} onChange={e => setNuevoCliente(p => ({...p, email: e.target.value}))} className="w-full px-4 py-2.5 bg-white rounded-xl text-sm font-bold text-slate-900 outline-none border border-slate-200" />
                    <select value={nuevoCliente.tipo_cliente} onChange={e => setNuevoCliente(p => ({...p, tipo_cliente: e.target.value}))} className="w-full px-3 py-2.5 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-black outline-none border border-indigo-100">
                      <option value="persona">Consumidor Final</option>
                      <option value="distribuidor">Distribuidora (Descuento)</option>
                    </select>
                  </div>
                  <button
                    disabled={!nuevoCliente.nombre || !nuevoCliente.documento || savingCliente}
                    onClick={async () => {
                      setSavingCliente(true)
                      try {
                        const res = await fetch('/api/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nuevoCliente) })
                        const json = await res.json()
                        if (json.success) {
                          setClienteSelected(json.data); setShowClienteForm(false); toast.success('Cliente registrado')
                        } else { toast.error(json.error) }
                      } catch { toast.error('Error') }
                      setSavingCliente(false)
                    }}
                    className="w-full py-3 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-all shadow-lg shadow-indigo-600/10">
                    {savingCliente ? 'GUARDANDO...' : 'REGISTRAR CLIENTE'}
                  </button>
                </div>
              )}
            </div>

            {/* ── PLAZO CREDITO (Solo si es crédito) ── */}
            {tipoVenta === 'credito' && (
              <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 flex flex-col gap-3 animate-in slide-in-from-right-4 duration-300">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-slate-900">Días de Crédito</span>
                  <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-black uppercase">Pronto Pago</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[15, 30, 45, 60].map(d => (
                    <button key={d} onClick={() => setCondicionPagoDias(d)}
                      className={`py-3 rounded-2xl text-xs font-black border transition-all ${condicionPagoDias === d ? 'bg-amber-500 border-amber-500 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-500 hover:bg-slate-50'}`}>
                      {d} D
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── RESUMEN DE PAGO ── */}
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm p-5 flex flex-col gap-3 mt-auto shrink-0">
              <div className="space-y-2">
                <div className="flex justify-between text-sm font-bold text-slate-400">
                  <span>Total sin descuento</span>
                  <span>${cartSubtotalBruto.toLocaleString()}</span>
                </div>
                {cartDescuentoMonto > 0 ? (
                  <div className="flex flex-col gap-2 font-black text-rose-500 bg-rose-50 px-4 py-3 rounded-2xl border border-rose-100/50">
                    <div className="flex justify-between text-sm">
                      <span>Descuento Aplicado</span>
                      <span>-${cartDescuentoMonto.toLocaleString()}</span>
                    </div>
                    <div className="flex flex-col gap-1 pt-2 border-t border-rose-200/50">
                      {cart.filter(item => item.descuento_porcentaje > 0).map(item => (
                        <div key={item.producto_id} className="flex justify-between items-center text-[10px] font-bold text-rose-400 opacity-90">
                          <span className="truncate max-w-[200px]">{item.nombre} ({item.descuento_porcentaje}%)</span>
                          <span>-${(item.precio_unitario_base - item.precio_linea).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between text-sm font-black text-slate-300 bg-slate-50 px-4 py-2 rounded-2xl">
                    <span>Descuento Aplicado</span>
                    <span>-$0</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-slate-400">
                  <span>Impuestos (IVA {ivaPct}%)</span>
                  <span>+${cartIvaMonto.toLocaleString()}</span>
                </div>
              </div>
              
              <div className="h-px bg-slate-100 my-1" />
              
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <span className="text-sm font-black text-slate-500 uppercase tracking-widest">Total Neto a Pagar</span>
                  <span className="text-4xl font-black text-indigo-600 tracking-tighter leading-none">${cartTotal.toLocaleString()}</span>
                </div>
                <button 
                  onClick={handleProcessSale}
                  disabled={isProcessing || cart.length === 0}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-5 rounded-2xl font-black text-2xl shadow-xl shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-50 flex justify-center items-center gap-3"
                >
                  {isProcessing ? <RefreshCw className="w-8 h-8 animate-spin" /> : <CheckCircle2 className="w-8 h-8" />}
                  FACTURAR E IMPRIMIR
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ── VENTAS DEL DÍA TAB ── */
        <div className="flex-1 overflow-y-auto min-h-0 space-y-5 animate-in fade-in duration-500">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-emerald-500 rounded-2xl p-5 text-white shadow-lg shadow-emerald-500/20 relative overflow-hidden col-span-2 lg:col-span-1">
              <div className="absolute -top-6 -right-6 w-24 h-24 bg-white rounded-full opacity-10" />
              <p className="text-emerald-100 text-[10px] font-black uppercase tracking-widest mb-2">Total Vendido Hoy</p>
              <p className="text-3xl font-black tracking-tighter">${kpisVentas.total.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex flex-col gap-2">
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Facturas</p>
              <p className="text-3xl font-black text-slate-900 tracking-tighter">{kpisVentas.count}</p>
            </div>
            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm flex flex-col gap-2">
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Ticket Prom.</p>
              <p className="text-3xl font-black text-slate-900 tracking-tighter">${Math.round(kpisVentas.promedio).toLocaleString()}</p>
            </div>
            <div className="bg-slate-900 rounded-2xl p-5 text-white flex flex-col gap-2">
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">Por Método</p>
              <div className="flex justify-between text-sm"><span className="text-slate-400">Efectivo</span><span className="font-black">${kpisVentas.efectivo.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-400">Tarjeta</span><span className="font-black">${kpisVentas.tarjeta.toLocaleString()}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-400">Transf.</span><span className="font-black">${kpisVentas.transferencia.toLocaleString()}</span></div>
            </div>
          </div>

          {/* Top Productos Summary */}
          {topProductos.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <BarChart2 className="w-3 h-3" /> Productos más vendidos hoy
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {topProductos.map((p, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <p className="text-[10px] font-black text-slate-900 truncate">{p.nombre}</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(p.count / topProductos[0].count) * 100}%` }} />
                      </div>
                      <span className="text-[10px] font-black text-slate-500">{p.count} ud.</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sub-tabs Ventas */}
          <div className="flex gap-2 border-b border-slate-100 pb-1">
            <button onClick={() => setSubTabVentas('historial')}
              className={`px-4 py-2 text-xs font-black uppercase transition-all border-b-2 ${subTabVentas === 'historial' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              Historial del día
            </button>
            <button onClick={() => setSubTabVentas('cartera')}
              className={`px-4 py-2 text-xs font-black uppercase transition-all border-b-2 ${subTabVentas === 'cartera' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              Cartera (Cuentas por Cobrar)
            </button>
          </div>

          {subTabVentas === 'historial' && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
                <h2 className="text-base font-black text-slate-900">Ventas Registradas</h2>
                <button onClick={exportarCSV} className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[10px] font-black transition-all">
                  <FileDown className="w-3 h-3" /> EXPORTAR CSV
                </button>
              </div>
              {loadingVentas ? (
                <div className="py-16 text-center text-slate-400 font-bold animate-pulse">Cargando ventas...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-slate-50">
                        {['#', 'Hora', 'Cliente', 'Tipo', 'Estado', 'Total', 'Acciones'].map(h => (
                          <th key={h} className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {ventasHoy.length === 0 ? (
                        <tr><td colSpan={7} className="py-20 text-center text-slate-300 font-black">No hay ventas registradas</td></tr>
                      ) : ventasHoy.map(f => (
                        <React.Fragment key={f.id}>
                          <tr className={`hover:bg-slate-50/50 transition-colors cursor-pointer ${expandedFacturaId === f.id ? 'bg-slate-50' : ''}`}
                            onClick={() => setExpandedFacturaId(expandedFacturaId === f.id ? null : f.id)}>
                            <td className="px-5 py-3 font-black text-indigo-600 flex items-center gap-2">
                              {expandedFacturaId === f.id ? <ChevronDown className="w-3 h-3 rotate-180" /> : <ChevronDown className="w-3 h-3" />}
                              #{f.numero}
                            </td>
                            <td className="px-5 py-3 font-bold text-slate-600">{new Date(f.created_at).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</td>
                            <td className="px-5 py-3">
                              <p className="font-bold text-slate-900">{f.cliente_nombre}</p>
                              <p className="text-[10px] text-slate-400 font-bold">{f.cliente_documento}</p>
                            </td>
                            <td className="px-5 py-3">
                              <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-black uppercase ${f.tipo_venta === 'contado' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-700'}`}>
                                {f.tipo_venta}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-black uppercase ${f.estado_pago === 'pagado' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                {f.estado_pago}
                              </span>
                            </td>
                            <td className="px-5 py-3 font-black text-slate-900 text-base">${Number(f.total).toLocaleString()}</td>
                            <td className="px-5 py-3">
                              <div className="flex gap-2">
                                {f.estado_pago === 'pendiente' && (
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation()
                                      if (!cajaAbierta) { toast.error('Abre caja para registrar el pago'); return }
                                      const confirm = window.confirm(`¿Registrar pago de $${Number(f.total).toLocaleString()} para la factura #${f.numero}?`)
                                      if (!confirm) return
                                      const res = await marcarComoPagada(f.id, cajaAbierta.id, 'efectivo')
                                      if (res.success) { toast.success('Pago registrado'); fetchVentas() } else { toast.error(res.error) }
                                    }}
                                    className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-white text-[9px] font-black rounded-lg shadow-sm transition-all uppercase">
                                    Pagar
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {expandedFacturaId === f.id && (
                            <tr>
                              <td colSpan={7} className="px-5 py-4 bg-slate-50/50">
                                <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm animate-in slide-in-from-top-1 duration-200">
                                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Detalle de Productos</h4>
                                  <div className="space-y-2">
                                    {f.detalles?.map((d: any, idx: number) => (
                                      <div key={idx} className="flex justify-between items-center text-xs">
                                        <div className="flex items-center gap-3">
                                          <span className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center font-black text-slate-500 text-[10px]">
                                            {idx + 1}
                                          </span>
                                          <div>
                                            <p className="font-bold text-slate-900">{d.producto?.nombre}</p>
                                            <p className="text-[10px] text-slate-400 font-bold">
                                              {d.cantidad_cajas > 0 && `${d.cantidad_cajas} Caj `}
                                              {d.cantidad_blisters > 0 && `${d.cantidad_blisters} Blis `}
                                              {d.cantidad_unidades > 0 && `${d.cantidad_unidades} Und `}
                                            </p>
                                          </div>
                                        </div>
                                        <div className="text-right">
                                          {f.descuento_porcentaje > 0 ? (
                                            <>
                                              <p className="text-[10px] text-slate-400 line-through font-bold">${Number(d.precio_unitario / (1 - (f.descuento_porcentaje/100))).toLocaleString()}</p>
                                              <p className="font-black text-emerald-600">${Number(d.precio_unitario).toLocaleString()} <span className="bg-rose-100 text-rose-600 text-[8px] px-1 rounded ml-1 tracking-tight">-{f.descuento_porcentaje}%</span></p>
                                            </>
                                          ) : (
                                            <p className="font-black text-slate-900">${Number(d.precio_unitario).toLocaleString()}</p>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {subTabVentas === 'cartera' && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h2 className="text-base font-black text-slate-900">Cartera de Créditos (Distribuidora)</h2>
                <p className="text-xs text-slate-400 font-bold">Ventas a crédito pendientes de cobro</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      {['Factura', 'Cliente', 'Vencimiento', 'Estado', 'Saldo'].map(h => (
                        <th key={h} className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {ventasCreditoPendientes.length === 0 ? (
                      <tr><td colSpan={5} className="py-20 text-center text-slate-300 font-black">No hay créditos pendientes</td></tr>
                    ) : (
                      ventasCreditoPendientes.map(f => {
                        const diasVencido = Math.floor((new Date().getTime() - new Date(f.fecha_vencimiento).getTime()) / (1000 * 3600 * 24))
                        const esVencido = new Date(f.fecha_vencimiento) < new Date()
                        const totalSinDescuento = Number(f.total) + Number(f.descuento_monto || 0)
                      
                      return (
                        <tr key={f.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3 font-black text-indigo-600">#{f.numero}</td>
                          <td className="px-5 py-3">
                            <p className="font-bold text-slate-900">{f.cliente_nombre}</p>
                            <p className="text-[10px] text-slate-400 font-bold">OC: {f.orden_compra || 'N/A'}</p>
                          </td>
                          <td className="px-5 py-3">
                            <p className={`font-bold ${esVencido ? 'text-rose-600' : 'text-slate-600'}`}>
                              {new Date(f.fecha_vencimiento).toLocaleDateString()}
                            </p>
                            <p className="text-[10px] text-slate-400 font-bold">
                              {esVencido ? `⚠️ Vencido hace ${diasVencido}d` : `✅ Vence en ${-diasVencido}d`}
                            </p>
                          </td>
                          <td className="px-5 py-3">
                            <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-black uppercase ${esVencido ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {esVencido ? 'EXPIRADO' : 'PRONTO PAGO'}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            {esVencido ? (
                              <div className="flex flex-col">
                                <span className="text-rose-600 font-black text-base">${totalSinDescuento.toLocaleString()}</span>
                                <span className="text-[9px] text-slate-400 line-through font-bold">Base: ${Number(f.total).toLocaleString()}</span>
                              </div>
                            ) : (
                              <div className="flex flex-col">
                                <span className="text-emerald-600 font-black text-base">${Number(f.total).toLocaleString()}</span>
                                <span className="text-[9px] text-indigo-400 font-bold">Ahorro: ${Number(f.descuento_monto).toLocaleString()}</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    }))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      {/* Modal de Impresión */}
      {showPrintModal && createdFacturaId && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-2">Venta Exitosa</h3>
            <p className="text-slate-500 font-bold mb-8">¿Deseas imprimir el recibo para el cliente?</p>
            
            <div className="flex flex-col gap-3 w-full">
              <button 
                onClick={() => {
                  window.open(`/facturas/${createdFacturaId}/print`, '_blank')
                  setShowPrintModal(false)
                  setCreatedFacturaId(null)
                }}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-4 rounded-xl font-black text-lg shadow-lg shadow-indigo-600/20 transition-all active:scale-95"
              >
                SÍ, IMPRIMIR RECIBO
              </button>
              <button 
                onClick={() => {
                  setShowPrintModal(false)
                  setCreatedFacturaId(null)
                }}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-4 rounded-xl font-black text-lg transition-all active:scale-95"
              >
                NO, NUEVA VENTA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cierre de Caja */}
      {showCloseCajaModal && cajaAbierta && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-6">
              <Lock className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-2">Cerrar Turno</h3>
            <p className="text-slate-500 font-bold mb-6 text-center text-sm">
              Ingresa el efectivo exacto que hay en la gaveta. El sistema calculará automáticamente si hay algún descuadre.
            </p>

            <div className="w-full bg-slate-50 rounded-2xl p-5 mb-6 border border-slate-100 space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-bold">Fondo Base (Apertura)</span>
                <span className="font-black text-slate-900">${Number(cajaAbierta.monto_apertura).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-bold">Ventas en Efectivo</span>
                <span className="font-black text-emerald-600">+ ${kpisVentas.efectivo.toLocaleString()}</span>
              </div>
              <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                <span className="text-slate-900 font-black uppercase text-xs">Total Esperado</span>
                <span className="font-black text-xl text-indigo-600">${(Number(cajaAbierta.monto_apertura) + kpisVentas.efectivo).toLocaleString()}</span>
              </div>
            </div>

            <div className="w-full relative mb-6">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Efectivo Físico en Gaveta</label>
              <span className="absolute left-4 top-[38px] text-slate-400 font-black text-lg">$</span>
              <input 
                type="text" 
                value={efectivoCierreManual ? Number(efectivoCierreManual.replace(/\D/g, '')).toLocaleString() : ''} 
                onChange={e => setEfectivoCierreManual(e.target.value.replace(/\D/g, ''))}
                className="w-full pl-10 pr-6 py-4 bg-white border-2 border-slate-200 focus:border-rose-500 rounded-2xl font-black text-2xl text-slate-900 text-right outline-none transition-all shadow-inner"
                placeholder="0"
              />
            </div>

            <div className="flex gap-3 w-full">
              <button 
                onClick={() => setShowCloseCajaModal(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-4 rounded-xl font-black transition-all active:scale-95"
              >
                CANCELAR
              </button>
              <button 
                onClick={handleCerrarCaja}
                disabled={isClosingCaja || !efectivoCierreManual}
                className="flex-1 bg-rose-600 hover:bg-rose-500 text-white py-4 rounded-xl font-black shadow-lg shadow-rose-600/20 transition-all active:scale-95 disabled:opacity-50"
              >
                {isClosingCaja ? 'CERRANDO...' : 'CONFIRMAR CIERRE'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

