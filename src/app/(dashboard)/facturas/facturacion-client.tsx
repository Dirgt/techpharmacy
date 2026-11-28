/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { Search, Plus, Minus, Trash2, ShoppingCart, Wallet, ReceiptText, CheckCircle2, BarChart2, FileDown, RefreshCw, ChevronDown, X, Building2, Lock, Ban, AlertTriangle, ArrowLeftRight } from 'lucide-react'
import { toast } from 'sonner'
import {
  anularVenta,
  cargarCartera,
  cargarVentasSesion,
  cobrarSaldoTotal,
  crearVenta,
  registrarAbono,
  type FacturaItem,
} from '@/lib/pos/ventas-navegador'
import type { CatalogoHook } from '@/lib/catalogo/use-catalogo'
import type { FilaPOS } from '@/lib/catalogo/modelo'
import { EstadoCatalogo } from '@/components/catalogo/estado-catalogo'
import { useRouter } from 'next/navigation'
import { abrirCaja, cerrarCaja } from '@/app/actions/caja'
import { GastoModal } from '@/components/tesoreria/gasto-modal'
import { useBarcodeScanner } from '@/hooks/use-barcode-scanner'
import { calculatePV, formatCurrency } from '@/lib/utils'
import { canFulfillWithUnpacking, suggestPackConsolidation } from '@/lib/inventario/fraccionamiento'
import { calcularEfectivoEsperadoCaja, validateAndNormalizePago, type MetodoPagoPos } from '@/lib/pos/pago-mixto'
import { aplicarDescuento, calcularIvaLinea, normalizarTarifaIva, type TarifaIva } from '@/lib/pos/montos'

type PresentationMode = 'caja' | 'blister' | 'unidad'
type CartItem = FacturaItem & { iva_porcentaje: TarifaIva }

const normalizeIvaRate = normalizarTarifaIva

const isFracProduct = (p: any) =>
  Math.max(1, Number(p?.blisters_por_caja) || 1) > 1 ||
  Math.max(1, Number(p?.unidades_por_blister) || 1) > 1 ||
  (Number(p?.blisters) || 0) > 0 ||
  (Number(p?.unidades) || 0) > 0

const calculateLinePrice = (productDef: any, cajas: number, blisters: number, unidades: number) => {
  const pvpCaja = calculatePV(productDef.precio_caja, productDef.margen_caja ?? productDef.porcentaje_ganancia ?? 0)
  const pvpBlister = calculatePV(productDef.precio_blister, productDef.margen_blister ?? 0)
  const pvpUnidad = calculatePV(productDef.precio_unidad, productDef.margen_unidad ?? 0)
  return (pvpCaja * cajas) + (pvpBlister * blisters) + (pvpUnidad * unidades)
}

const isProductBlockedExpired = (product: any) => Boolean(product?.todo_vencido)

const hasSellableStock = (product: any) =>
  (Number(product?.cajas) || 0) > 0 ||
  (Number(product?.blisters) || 0) > 0 ||
  (Number(product?.unidades) || 0) > 0

export function FacturacionClient({
  inventario,
  catalogo,
  vendedores,
  cajaAbierta,
  userRole = 'vendedor',
  prefijoFactura = null,
}: {
  /** Catálogo local (IndexedDB) con el stock vendible por lotes vigentes. */
  inventario: FilaPOS[],
  catalogo: CatalogoHook,
  vendedores: any[],
  cajaAbierta: any,
  userRole?: string,
  prefijoFactura?: string | null,
}) {
  const router = useRouter()
  const isAdmin = userRole === 'admin' || userRole === 'superadmin'
  const formatFacturaNum = useCallback(
    (num: number | string | null | undefined) => {
      if (num === null || num === undefined || num === '') return 'PENDIENTE'
      return prefijoFactura ? `${prefijoFactura}-${num}` : `#${num}`
    },
    [prefijoFactura]
  )
  const [cancelingFactura, setCancelingFactura] = useState<any | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [isCancelingFactura, setIsCancelingFactura] = useState(false)
  const [equivalentesSource, setEquivalentesSource] = useState<any | null>(null)
  const [payingAbonoFactura, setPayingAbonoFactura] = useState<any | null>(null)
  const [abonoMonto, setAbonoMonto] = useState('')
  const [abonoMetodo, setAbonoMetodo] = useState<'efectivo' | 'tarjeta' | 'transferencia'>('efectivo')
  const [abonoNotas, setAbonoNotas] = useState('')
  const [isSavingAbono, setIsSavingAbono] = useState(false)

  const equivalentesList = useMemo(() => {
    const rawMolecula = equivalentesSource?.principio_activo?.trim().toLowerCase()
    if (!rawMolecula) return []
    return inventario.filter((p) => {
      if (p.producto_id === equivalentesSource.producto_id) return false
      if ((p.principio_activo || '').trim().toLowerCase() !== rawMolecula) return false
      if (isProductBlockedExpired(p)) return false
      return (Number(p.cajas) || 0) > 0 || (Number(p.blisters) || 0) > 0 || (Number(p.unidades) || 0) > 0
    })
  }, [equivalentesSource, inventario])

  // --- STATE ---
  const [activeTab, setActiveTab] = useState<'pos' | 'ventas'>('pos')
  const [searchTerm, setSearchTerm] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])

  const hasFormulaItems = useMemo(() => {
    return cart.some((item) => {
      const info = inventario.find((p) => p.producto_id === item.producto_id)
      return Boolean(info?.requiere_formula)
    })
  }, [cart, inventario])
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
  const [metodoPago, setMetodoPago] = useState<MetodoPagoPos>('efectivo')
  const [pagoEfectivoStr, setPagoEfectivoStr] = useState<string>('')
  const [pagoTarjetaStr, setPagoTarjetaStr] = useState<string>('')
  const [pagoTransferenciaStr, setPagoTransferenciaStr] = useState<string>('')
  const [tipoVenta, setTipoVenta] = useState<'contado' | 'credito'>('contado')
  const [condicionPagoDias, setCondicionPagoDias] = useState<number>(0)
  const [ordenCompra, setOrdenCompra] = useState('')
  const [descuentoPct, setDescuentoPct] = useState<number>(0)
  const [efectivoRecibido, setEfectivoRecibido] = useState<string>('')
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false)
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [createdFacturaId, setCreatedFacturaId] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isOpeningCaja, setIsOpeningCaja] = useState(false)
  const [montoApertura, setMontoApertura] = useState('0')
  const [ventasHoy, setVentasHoy] = useState<any[]>([])
  const [cartera, setCartera] = useState<any[]>([])
  const [gastosSesion, setGastosSesion] = useState<any[]>([])
  const [comprasEfectivoSesion, setComprasEfectivoSesion] = useState<any[]>([])
  const [abonosEfectivoSesion, setAbonosEfectivoSesion] = useState<any[]>([])
  const [loadingVentas, setLoadingVentas] = useState(false)
  const [subTabVentas, setSubTabVentas] = useState<'historial' | 'cartera'>('historial')
  const [expandedFacturaId, setExpandedFacturaId] = useState<string | null>(null)
  const [nextFacturaNum, setNextFacturaNum] = useState<number | null>(null)
  const [filterMethod, setFilterMethod] = useState<'todos' | 'efectivo' | 'tarjeta' | 'transferencia'>('todos')

  const [showCloseCajaModal, setShowCloseCajaModal] = useState(false)
  const [isClosingCaja, setIsClosingCaja] = useState(false)
  const [efectivoCierreManual, setEfectivoCierreManual] = useState('')

  const addToCart = useCallback((product: any, preferredMode?: PresentationMode) => {
    if (isProductBlockedExpired(product)) {
      toast.error(`Bloqueado: ${product.nombre_producto} tiene lote vencido sin stock vigente.`)
      return
    }
    if (!hasSellableStock(product)) {
      toast.error(`Sin stock vigente disponible para ${product.nombre_producto}.`)
      return
    }

    const bpc = Math.max(1, Number(product.blisters_por_caja) || 1)
    const upb = Math.max(1, Number(product.unidades_por_blister) || 1)
    const avail = {
      cajas: Number(product.cajas) || 0,
      blisters: Number(product.blisters) || 0,
      unidades: Number(product.unidades) || 0,
    }

    const modeToField: Record<PresentationMode, 'cantidad_cajas' | 'cantidad_blisters' | 'cantidad_unidades'> = {
      caja: 'cantidad_cajas',
      blister: 'cantidad_blisters',
      unidad: 'cantidad_unidades',
    }

    let added = false
    let stockShortage = false
    setCart(prev => {
      const existing = prev.find(item => item.producto_id === product.producto_id)

      if (existing) {
        return prev.map(item => {
          if (item.producto_id === product.producto_id) {
            let fieldToIncrement: 'cantidad_unidades' | 'cantidad_blisters' | 'cantidad_cajas' | null = null

            if (preferredMode) {
              const f = modeToField[preferredMode]
              const req = {
                cajas: f === 'cantidad_cajas' ? item.cantidad_cajas + 1 : item.cantidad_cajas,
                blisters: f === 'cantidad_blisters' ? item.cantidad_blisters + 1 : item.cantidad_blisters,
                unidades: f === 'cantidad_unidades' ? item.cantidad_unidades + 1 : item.cantidad_unidades,
              }
              if (canFulfillWithUnpacking(avail, req, bpc, upb)) {
                fieldToIncrement = f
              } else {
                stockShortage = true
              }
            } else {
              const tryOrder: Array<'cantidad_unidades' | 'cantidad_blisters' | 'cantidad_cajas'> = !isFracProduct(product)
                ? ['cantidad_cajas']
                : ['cantidad_unidades', 'cantidad_blisters', 'cantidad_cajas']
              for (const f of tryOrder) {
                const req = {
                  cajas: f === 'cantidad_cajas' ? item.cantidad_cajas + 1 : item.cantidad_cajas,
                  blisters: f === 'cantidad_blisters' ? item.cantidad_blisters + 1 : item.cantidad_blisters,
                  unidades: f === 'cantidad_unidades' ? item.cantidad_unidades + 1 : item.cantidad_unidades,
                }
                if (f === 'cantidad_unidades' && (avail.unidades > 0 || upb > 1 || bpc > 1) && canFulfillWithUnpacking(avail, req, bpc, upb)) {
                  fieldToIncrement = f
                  break
                }
                if (f === 'cantidad_blisters' && (avail.blisters > 0 || bpc > 1) && canFulfillWithUnpacking(avail, req, bpc, upb)) {
                  fieldToIncrement = f
                  break
                }
                if (f === 'cantidad_cajas' && canFulfillWithUnpacking(avail, req, bpc, upb)) {
                  fieldToIncrement = f
                  break
                }
              }
            }

            if (fieldToIncrement) {
              added = true
              const newVal = item[fieldToIncrement] + 1
              const newPrice = calculateLinePrice(
                product,
                fieldToIncrement === 'cantidad_cajas' ? newVal : item.cantidad_cajas,
                fieldToIncrement === 'cantidad_blisters' ? newVal : item.cantidad_blisters,
                fieldToIncrement === 'cantidad_unidades' ? newVal : item.cantidad_unidades
              )
              return {
                ...item,
                [fieldToIncrement]: newVal,
                precio_linea: aplicarDescuento(newPrice, descuentoPct),
                precio_unitario_base: Math.round(newPrice),
              }
            }
            return item
          }
          return item
        })
      }

      let defUnidades = 0, defBlisters = 0, defCajas = 0
      if (preferredMode === 'caja') {
        if (canFulfillWithUnpacking(avail, { cajas: 1, blisters: 0, unidades: 0 }, bpc, upb)) {
          defCajas = 1
        } else {
          stockShortage = true
          return prev
        }
      } else if (preferredMode === 'blister') {
        if ((avail.blisters > 0 || bpc > 1) && canFulfillWithUnpacking(avail, { cajas: 0, blisters: 1, unidades: 0 }, bpc, upb)) {
          defBlisters = 1
        } else {
          stockShortage = true
          return prev
        }
      } else if (preferredMode === 'unidad') {
        if ((avail.unidades > 0 || upb > 1 || bpc > 1) && canFulfillWithUnpacking(avail, { cajas: 0, blisters: 0, unidades: 1 }, bpc, upb)) {
          defUnidades = 1
        } else {
          stockShortage = true
          return prev
        }
      } else if (!isFracProduct(product)) {
        defCajas = 1
      } else if (avail.unidades > 0) {
        defUnidades = 1
      } else if (avail.blisters > 0) {
        defBlisters = 1
      } else if ((upb > 1 || bpc > 1) && canFulfillWithUnpacking(avail, { cajas: 0, blisters: 0, unidades: 1 }, bpc, upb)) {
        defUnidades = 1
      } else {
        defCajas = 1
      }

      added = true
      const basePrice = Math.round(calculateLinePrice(product, defCajas, defBlisters, defUnidades))

      const newItem: CartItem = {
        producto_id: product.producto_id,
        nombre: product.nombre_producto,
        cantidad_cajas: defCajas,
        cantidad_blisters: defBlisters,
        cantidad_unidades: defUnidades,
        precio_unitario_base: basePrice,
        descuento_porcentaje: descuentoPct,
        precio_linea: aplicarDescuento(basePrice, descuentoPct),
        precio_linea_original: basePrice,
        iva_porcentaje: normalizeIvaRate(product.iva_porcentaje),
      }
      return [...prev, newItem]
    })
    setSearchTerm('')
    if (stockShortage) {
      toast.error(`Stock vigente insuficiente para agregar esa presentación de ${product.nombre_producto}.`)
    } else if (added) {
      const modeLabel =
        preferredMode === 'caja'
          ? ' (1 Caja)'
          : preferredMode === 'blister'
            ? ' (1 Sobre/Blíster)'
            : preferredMode === 'unidad'
              ? ' (1 Unidad)'
              : ''
      toast.success(`${product.nombre_producto}${modeLabel} agregado`)
    }
  }, [descuentoPct])

  useBarcodeScanner((barcode) => {
    // Only process if we are in POS tab and not currently interacting with an input
    if (activeTab !== 'pos') return

    // Check if the barcode matches any product in inventario
    const product = inventario.find(p => p.codigo === barcode)

    if (product) {
      addToCart(product)
    } else {
      toast.error(`Producto no encontrado (Código: ${barcode})`)
    }
  })

  const ventasFiltradas = useMemo(() => {
    if (filterMethod === 'todos') return ventasHoy
    return ventasHoy.filter((v) => {
      if (v.metodo_pago === filterMethod) return true
      if (v.metodo_pago === 'mixto') {
        if (filterMethod === 'efectivo') return Number(v.pago_efectivo || 0) > 0
        if (filterMethod === 'tarjeta') return Number(v.pago_tarjeta || 0) > 0
        if (filterMethod === 'transferencia') return Number(v.pago_transferencia || 0) > 0
      }
      return false
    })
  }, [ventasHoy, filterMethod])

  const carteraPendiente = useMemo(
    () => cartera.filter(f => f.tipo_venta === 'credito' && f.estado_pago === 'pendiente'),
    [cartera]
  )

  // --- DERIVED STATE ---
  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return []
    const term = searchTerm.toLowerCase()
    // busqueda = nombre, código, laboratorio, molécula y sección en minúsculas (precalculado).
    return inventario.filter(item => item.busqueda.includes(term)).slice(0, 10) // Limit to 10 for performance
  }, [searchTerm, inventario])

  const cartSubtotalBruto = useMemo(
    () => cart.reduce((sum, item) => sum + Math.round(item.precio_unitario_base), 0),
    [cart]
  )

  const cartDescuentoMonto = useMemo(
    () => cart.reduce(
      (sum, item) => sum + (Math.round(item.precio_unitario_base) - Math.round(item.precio_linea)),
      0
    ),
    [cart]
  )

  const cartBaseIva = useMemo(
    () => cart.reduce((sum, item) => sum + Math.round(item.precio_linea), 0),
    [cart]
  )

  const cartIvaRates = useMemo(
    () => Array.from(new Set(cart.map((item) => normalizeIvaRate(item.iva_porcentaje)))),
    [cart]
  )
  const cartIvaPct = cartIvaRates.length === 1 ? cartIvaRates[0] : 0
  const hasMixedIva = cartIvaRates.length > 1

  const cartIvaMonto = useMemo(
    () => cart.reduce(
      (sum, item) => sum + calcularIvaLinea(item.precio_linea, item.iva_porcentaje),
      0
    ),
    [cart]
  )

  const cartTotal = useMemo(() => Math.round(cartBaseIva + cartIvaMonto), [cartBaseIva, cartIvaMonto])

  const pagoEfectivoNum = Number(pagoEfectivoStr.replace(/\D/g, '')) || 0
  const pagoTarjetaNum = Number(pagoTarjetaStr.replace(/\D/g, '')) || 0
  const pagoTransferenciaNum = Number(pagoTransferenciaStr.replace(/\D/g, '')) || 0

  const pagoMixtoValidation = useMemo(
    () =>
      validateAndNormalizePago({
        total: cartTotal,
        tipoVenta,
        metodoPago,
        pagoEfectivo: pagoEfectivoNum,
        pagoTarjeta: pagoTarjetaNum,
        pagoTransferencia: pagoTransferenciaNum,
      }),
    [cartTotal, tipoVenta, metodoPago, pagoEfectivoNum, pagoTarjetaNum, pagoTransferenciaNum]
  )

  const vueltas = useMemo(() => {
    const recibido = Number(efectivoRecibido.replace(/\D/g, '')) || 0;
    return Math.max(0, recibido - cartTotal);
  }, [efectivoRecibido, cartTotal])

  const kpisVentas = useMemo(() => {
    let total = 0, efectivo = 0, tarjeta = 0, transferencia = 0, count = 0
    ventasHoy.forEach(f => {
      if (f.estado_pago === 'anulada') return
      const t = Number(f.total) || 0
      total += t
      count += 1
      if (f.estado_pago === 'pagado') {
        if (f.metodo_pago === 'mixto') {
          efectivo += Number(f.pago_efectivo) || 0
          tarjeta += Number(f.pago_tarjeta) || 0
          transferencia += Number(f.pago_transferencia) || 0
        } else if (f.metodo_pago === 'efectivo') {
          efectivo += Number(f.pago_efectivo) > 0 ? Number(f.pago_efectivo) : t
        } else if (f.metodo_pago === 'tarjeta') {
          tarjeta += Number(f.pago_tarjeta) > 0 ? Number(f.pago_tarjeta) : t
        } else {
          transferencia += Number(f.pago_transferencia) > 0 ? Number(f.pago_transferencia) : t
        }
      }
    })
    return { total, efectivo, tarjeta, transferencia, count, promedio: count > 0 ? total / count : 0 }
  }, [ventasHoy])

  const totalGastosSesion = useMemo(
    () => gastosSesion.reduce((sum, g) => sum + (Number(g.monto) || 0), 0),
    [gastosSesion]
  )
  const totalComprasEfectivoSesion = useMemo(
    () => comprasEfectivoSesion.reduce((sum, c) => sum + (Number(c.total) || 0), 0),
    [comprasEfectivoSesion]
  )
  const totalAbonosEfectivoSesion = useMemo(
    () => abonosEfectivoSesion.reduce((sum, a) => sum + (Number(a.monto) || 0), 0),
    [abonosEfectivoSesion]
  )
  const totalEsperadoCaja = useMemo(
    () =>
      calcularEfectivoEsperadoCaja({
        montoApertura: Number(cajaAbierta?.monto_apertura) || 0,
        facturasSesion: ventasHoy,
        abonosEfectivoTotal: totalAbonosEfectivoSesion,
        gastosEfectivoTotal: totalGastosSesion,
        comprasEfectivoTotal: totalComprasEfectivoSesion,
      }),
    [cajaAbierta?.monto_apertura, ventasHoy, totalAbonosEfectivoSesion, totalGastosSesion, totalComprasEfectivoSesion]
  )

  const topProductos = useMemo(() => {
    const map = new Map<string, { nombre: string, total: number, count: number }>()
    ventasHoy.forEach(f => {
      if (f.estado_pago === 'anulada') return
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

  const cajaId = cajaAbierta?.id

  // Ventas, cartera y movimientos de la caja se leen directo de Supabase y solo
  // cuando se necesitan: al abrir "Ventas del Día", al abrir el cierre de caja o
  // después de cobrar, abonar o anular. Vender no las vuelve a descargar.
  const fetchVentas = useCallback(async () => {
    if (!cajaId) return
    setLoadingVentas(true)
    const [res, carteraData] = await Promise.all([cargarVentasSesion(cajaId), cargarCartera()])
    if (res.success) {
      setVentasHoy(res.ventas)
      setGastosSesion(res.gastos)
      setComprasEfectivoSesion(res.comprasEfectivo)
      setAbonosEfectivoSesion(res.abonosEfectivo)
    } else {
      toast.error(res.error)
    }
    if (carteraData) {
      setCartera(carteraData)
    }
    setLoadingVentas(false)
  }, [cajaId])

  useEffect(() => {
    if (activeTab === 'ventas' || showCloseCajaModal) fetchVentas()
  }, [activeTab, showCloseCajaModal, fetchVentas])

  // Si el catálogo trae precios o IVA nuevos, el carrito se recalcula: el total en
  // pantalla siempre es el que la base va a cobrar.
  useEffect(() => {
    setCart(prev => {
      let cambios = false
      const next = prev.map(item => {
        const def = inventario.find(p => p.producto_id === item.producto_id)
        if (!def) return item
        const base = Math.round(calculateLinePrice(def, item.cantidad_cajas, item.cantidad_blisters, item.cantidad_unidades))
        const iva = normalizeIvaRate(def.iva_porcentaje)
        if (base === item.precio_unitario_base && iva === item.iva_porcentaje) return item
        cambios = true
        return {
          ...item,
          precio_unitario_base: base,
          precio_linea: aplicarDescuento(base, item.descuento_porcentaje),
          precio_linea_original: base,
          iva_porcentaje: iva,
        }
      })
      if (!cambios) return prev
      // Mismo id: si React repite el cálculo, el aviso no se duplica.
      queueMicrotask(() =>
        toast.info('Se actualizaron precios del carrito con el catálogo vigente', { id: 'carrito-precios' })
      )
      return next
    })
  }, [inventario])

  useEffect(() => {
    const query = clienteSearch.trim()
    if (query.length < 2) {
      setClienteResults([])
      return
    }

    const controller = new AbortController()
    let isCurrent = true
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/clientes?q=${encodeURIComponent(query)}`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('No se pudo buscar el cliente')
        const json = await response.json()
        if (isCurrent) setClienteResults(json.data || [])
      } catch (error) {
        if (isCurrent && !(error instanceof DOMException && error.name === 'AbortError')) {
          setClienteResults([])
        }
      }
    }, 300)

    return () => {
      isCurrent = false
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [clienteSearch])

  // Auto-aplicar descuento y crédito cuando se selecciona cliente tipo distribuidor
  useEffect(() => {
    if (clienteSelected?.tipo_cliente === 'distribuidor') {
      setDescuentoPct(10)
      setTipoVenta('credito')
      setCondicionPagoDias(30)
      setMetodoPago((prev) => (prev === 'mixto' ? 'efectivo' : prev))
      toast.info('Cliente Distribuidor: Descuento 10% y Crédito 30d auto-aplicados')
    } else {
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
        precio_linea: aplicarDescuento(item.precio_unitario_base, descuentoPct)
      }
    }))
  }, [descuentoPct])

  const exportarCSV = () => {
    if (ventasHoy.length === 0) return
    const header = 'Factura,Fecha,Vendedor,Cliente,Documento,Metodo,Efectivo,Tarjeta,Transferencia,Total'
    const rows = ventasHoy.map(f =>
      `${formatFacturaNum(f.numero)},"${new Date(f.created_at).toLocaleString()}","${f.vendedor?.full_name || 'N/A'}","${f.cliente_nombre}","${f.cliente_documento}","${f.metodo_pago}",${f.pago_efectivo || 0},${f.pago_tarjeta || 0},${f.pago_transferencia || 0},${f.total}`
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
  const updateQuantity = (producto_id: string, field: 'cantidad_cajas' | 'cantidad_blisters' | 'cantidad_unidades', value: number) => {
    if (value < 0) return

    let rejected = false
    setCart(prev => prev.map(item => {
      if (item.producto_id === producto_id) {
        const productDef = inventario.find(p => p.producto_id === producto_id)
        if (!productDef) return item

        const updatedItem = { ...item, [field]: value }
        const bpc = Math.max(1, Number(productDef.blisters_por_caja) || 1)
        const upb = Math.max(1, Number(productDef.unidades_por_blister) || 1)
        const avail = {
          cajas: Number(productDef.cajas) || 0,
          blisters: Number(productDef.blisters) || 0,
          unidades: Number(productDef.unidades) || 0,
        }
        const req = {
          cajas: updatedItem.cantidad_cajas,
          blisters: updatedItem.cantidad_blisters,
          unidades: updatedItem.cantidad_unidades,
        }

        if (!canFulfillWithUnpacking(avail, req, bpc, upb)) {
          rejected = true
          return item
        }

        const basePrice = Math.round(calculateLinePrice(productDef, updatedItem.cantidad_cajas, updatedItem.cantidad_blisters, updatedItem.cantidad_unidades))
        updatedItem.precio_unitario_base = basePrice
        updatedItem.descuento_porcentaje = descuentoPct
        updatedItem.precio_linea = aplicarDescuento(basePrice, descuentoPct)

        return updatedItem
      }
      return item
    }))
    if (rejected) {
      toast.error('La cantidad supera el stock vigente disponible')
    }
  }

  const replaceCartCounts = (
    producto_id: string,
    nextCounts: { cajas: number; blisters: number; unidades: number },
    feedback?: string
  ) => {
    let rejected = false
    setCart(prev => prev.map(item => {
      if (item.producto_id !== producto_id) return item
      const productDef = inventario.find(p => p.producto_id === producto_id)
      if (!productDef) return item

      const bpc = Math.max(1, Number(productDef.blisters_por_caja) || 1)
      const upb = Math.max(1, Number(productDef.unidades_por_blister) || 1)
      const avail = {
        cajas: Number(productDef.cajas) || 0,
        blisters: Number(productDef.blisters) || 0,
        unidades: Number(productDef.unidades) || 0,
      }

      if (!canFulfillWithUnpacking(avail, nextCounts, bpc, upb)) {
        rejected = true
        return item
      }

      const basePrice = Math.round(calculateLinePrice(productDef, nextCounts.cajas, nextCounts.blisters, nextCounts.unidades))
      return {
        ...item,
        cantidad_cajas: nextCounts.cajas,
        cantidad_blisters: nextCounts.blisters,
        cantidad_unidades: nextCounts.unidades,
        precio_unitario_base: basePrice,
        descuento_porcentaje: descuentoPct,
        precio_linea: aplicarDescuento(basePrice, descuentoPct),
      }
    }))

    if (rejected) {
      toast.error('Stock vigente insuficiente para esa presentación')
    } else if (feedback) {
      toast.success(feedback)
    }
  }

  const removeFromCart = (producto_id: string) => {
    setCart(prev => prev.filter(item => item.producto_id !== producto_id))
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
      const totalCant = item.cantidad_cajas + item.cantidad_blisters + item.cantidad_unidades
      if (totalCant <= 0) {
        toast.error(`Revisa ${item.nombre}: las cantidades no pueden quedar en 0.`)
        return
      }
      const productDef = inventario.find(p => p.producto_id === item.producto_id)
      if (productDef) {
        if (isProductBlockedExpired(productDef)) {
          toast.error(`${item.nombre} tiene lote vencido bloqueado y no se puede vender.`)
          return
        }
        const bpc = Math.max(1, Number(productDef.blisters_por_caja) || 1)
        const upb = Math.max(1, Number(productDef.unidades_por_blister) || 1)
        const avail = {
          cajas: Number(productDef.cajas) || 0,
          blisters: Number(productDef.blisters) || 0,
          unidades: Number(productDef.unidades) || 0,
        }
        const req = {
          cajas: item.cantidad_cajas,
          blisters: item.cantidad_blisters,
          unidades: item.cantidad_unidades,
        }
        if (!canFulfillWithUnpacking(avail, req, bpc, upb)) {
          toast.error(`Stock vigente insuficiente para ${item.nombre}. Revisa las cantidades.`)
          return
        }
      }
    }

    if (!pagoMixtoValidation.ok) {
      toast.error(pagoMixtoValidation.error)
      return
    }

    setIsProcessing(true)
    try {
      // Directo a la base (sin Vercel). La RPC recalcula precios, IVA y pagos y
      // rechaza la venta si el total difiere del que ve el cajero.
      const res = await crearVenta({
        cliente_nombre: clienteSelected?.nombre || 'Consumidor Final',
        cliente_documento: clienteSelected?.documento || '222222222222',
        metodo_pago: pagoMixtoValidation.metodoPago,
        pago_efectivo: pagoMixtoValidation.pagoEfectivo,
        pago_tarjeta: pagoMixtoValidation.pagoTarjeta,
        pago_transferencia: pagoMixtoValidation.pagoTransferencia,
        tipo_venta: tipoVenta,
        condicion_pago_dias: tipoVenta === 'credito' ? condicionPagoDias : 0,
        orden_compra: ordenCompra || undefined,
        descuento_porcentaje: descuentoPct,
        total: cartTotal,
        vendedor_id: vendedorId,
        caja_sesion_id: cajaAbierta.id,
        items: cart.map((item) => ({
          producto_id: item.producto_id,
          cantidad_cajas: item.cantidad_cajas,
          cantidad_blisters: item.cantidad_blisters,
          cantidad_unidades: item.cantidad_unidades,
        })),
      })
      // Stock (y precios si cambiaron) al día: solo viajan los productos tocados.
      void catalogo.sincronizar()
      if (res.success) {
        const numeroShown = res.factura?.numero ? formatFacturaNum(res.factura.numero) : ''
        toast.success(`Factura ${numeroShown} — ${tipoVenta === 'credito' ? `Crédito ${condicionPagoDias}d` : 'Contado'}`)
        if (res.factura?.numero) {
          setNextFacturaNum(Number(res.factura.numero) + 1)
        }
        setCart([])
        setClienteSelected(null)
        setClienteSearch('')
        setOrdenCompra('')
        setDescuentoPct(0)
        setTipoVenta('contado')
        setCondicionPagoDias(0)
        setMetodoPago('efectivo')
        setPagoEfectivoStr('')
        setPagoTarjetaStr('')
        setPagoTransferenciaStr('')
        setEfectivoRecibido('')

        if (res.factura?.id) {
          setCreatedFacturaId(res.factura.id)
          setShowPrintModal(true)
        }
      } else {
        toast.error(res.error || 'Error al procesar la venta')
      }
    } catch {
      toast.error('No se pudo confirmar la venta por un problema de conexión. Verifica el historial de ventas antes de intentarlo de nuevo.')
    } finally {
      setIsProcessing(false)
    }
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
            <GastoModal cajaAbierta={cajaAbierta} onGastoRegistrado={fetchVentas} />
            <button onClick={() => setShowCloseCajaModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 text-sm font-black transition-all active:scale-95 ml-2">
              <Lock className="w-4 h-4" />
              Cerrar Caja
            </button>
          </div>
        ) : (
          <div className="ml-auto flex items-center gap-2">
            <EstadoCatalogo catalogo={catalogo} className="hidden sm:inline-flex" />
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
              {!catalogo.listo && (
                <p className="mt-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs font-bold text-amber-800">
                  {catalogo.sincronizando
                    ? 'Descargando el catálogo en este equipo (solo la primera vez)…'
                    : catalogo.error || 'El catálogo no está cargado. Usa el botón de actualizar.'}
                </p>
              )}
              {searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-2xl shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] overflow-hidden z-30 max-h-96 overflow-y-auto">
                  {searchResults.map(item => {
                    const blockedExpired = isProductBlockedExpired(item)
                    const sellable = hasSellableStock(item)
                    const disabledAdd = blockedExpired || !sellable
                    const frac = isFracProduct(item)
                    const bpc = Math.max(1, Number(item.blisters_por_caja) || 1)
                    const upb = Math.max(1, Number(item.unidades_por_blister) || 1)
                    const avail = {
                      cajas: Number(item.cajas) || 0,
                      blisters: Number(item.blisters) || 0,
                      unidades: Number(item.unidades) || 0,
                    }
                    const pvpCaja = calculatePV(item.precio_caja || 0, item.margen_caja ?? 0)
                    const pvpBlister = calculatePV(item.precio_blister || 0, item.margen_blister ?? 0)
                    const pvpUnidad = calculatePV(item.precio_unidad || 0, item.margen_unidad ?? 0)
                    const canCaja = !disabledAdd && avail.cajas >= 1
                    const canBlister = !disabledAdd && (avail.blisters > 0 || bpc > 1) && canFulfillWithUnpacking(avail, { cajas: 0, blisters: 1, unidades: 0 }, bpc, upb)
                    const canUnidad = !disabledAdd && (avail.unidades > 0 || upb > 1 || bpc > 1) && canFulfillWithUnpacking(avail, { cajas: 0, blisters: 0, unidades: 1 }, bpc, upb)

                    return (
                      <div key={item.producto_id}
                        className={`w-full px-4 py-3 transition-colors border-b border-slate-100 last:border-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${disabledAdd ? 'bg-rose-50/40' : 'hover:bg-slate-50/80'}`}>
                        <div className="flex-1 text-left min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className={`font-black text-sm truncate ${disabledAdd ? 'text-slate-500' : 'text-slate-900'}`}>{item.nombre_producto}</h4>
                            {item.requiere_formula && (
                              <span className="text-[9px] font-black text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded uppercase">Rx Fórmula</span>
                            )}
                            {blockedExpired && (
                              <span className="text-[9px] font-black text-white bg-rose-600 px-1.5 py-0.5 rounded uppercase">Vencido • Bloqueado</span>
                            )}
                            {!blockedExpired && item.tiene_stock_vencido && (
                              <span className="text-[9px] font-black text-amber-800 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded">Lote vencido retenido</span>
                            )}
                            {!blockedExpired && !sellable && (
                              <span className="text-[9px] font-black text-slate-600 bg-slate-200 px-1.5 py-0.5 rounded uppercase">Sin stock</span>
                            )}
                          </div>
                          {item.principio_activo && <p className="text-[10px] text-indigo-500 font-bold mb-0.5 mt-0.5 bg-indigo-50 inline-block px-1.5 py-0.5 rounded">Molécula: {item.principio_activo}</p>}
                          <p className="text-xs font-bold text-slate-400">
                            {item.laboratorio} • {item.codigo} • Stock: {item.cajas}C / {item.blisters}B / {item.unidades}U
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                          {item.principio_activo && (
                            <button
                              type="button"
                              onClick={() => setEquivalentesSource(item)}
                              className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-black inline-flex items-center gap-1 transition-colors"
                              title="Ver equivalentes con el mismo principio activo"
                            >
                              <ArrowLeftRight className="w-3 h-3" />
                              Equiv.
                            </button>
                          )}

                          {!frac ? (
                            <button
                              type="button"
                              onClick={() => addToCart(item, 'caja')}
                              disabled={!canCaja}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                              + Agregar ${pvpCaja.toLocaleString()}
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => addToCart(item, 'caja')}
                                disabled={!canCaja}
                                className="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-black disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
                              >
                                + Caja ${pvpCaja.toLocaleString()}
                              </button>
                              {(avail.blisters > 0 || bpc > 1) && (
                                <button
                                  type="button"
                                  onClick={() => addToCart(item, 'blister')}
                                  disabled={!canBlister}
                                  className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
                                >
                                  + Sobre ${pvpBlister.toLocaleString()}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => addToCart(item, 'unidad')}
                                disabled={!canUnidad}
                                className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-[11px] font-black disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
                              >
                                + Unidad ${pvpUnidad.toLocaleString()}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
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
                  {hasFormulaItems && (
                    <div className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 flex items-center gap-2 text-xs font-bold text-rose-700">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                      <span>
                        Atención: el carrito contiene medicamentos sujetos a fórmula médica (Rx). Verifica la receta antes de dispensar.
                      </span>
                    </div>
                  )}
                  {cart.map(item => {
                    const stockInfo = inventario.find(p => p.producto_id === item.producto_id);
                    const bpc = Math.max(1, Number(stockInfo?.blisters_por_caja) || 1)
                    const upb = Math.max(1, Number(stockInfo?.unidades_por_blister) || 1)
                    const avail = {
                      cajas: Number(stockInfo?.cajas) || 0,
                      blisters: Number(stockInfo?.blisters) || 0,
                      unidades: Number(stockInfo?.unidades) || 0,
                    }
                    const frac = isFracProduct(stockInfo)
                    const usesUnpacking =
                      Boolean(stockInfo) &&
                      (item.cantidad_blisters > avail.blisters || item.cantidad_unidades > avail.unidades)

                    const pvpCaja = stockInfo ? calculatePV(stockInfo.precio_caja || 0, stockInfo.margen_caja ?? 0) : 0
                    const pvpBlister = stockInfo ? calculatePV(stockInfo.precio_blister || 0, stockInfo.margen_blister ?? 0) : 0
                    const pvpUnidad = stockInfo ? calculatePV(stockInfo.precio_unidad || 0, stockInfo.margen_unidad ?? 0) : 0

                    const packSuggestion = stockInfo
                      ? suggestPackConsolidation(
                          {
                            cajas: item.cantidad_cajas,
                            blisters: item.cantidad_blisters,
                            unidades: item.cantidad_unidades,
                          },
                          avail,
                          bpc,
                          upb,
                          { pvpCaja, pvpBlister, pvpUnidad }
                        )
                      : null

                    const isOnlyCaja = item.cantidad_cajas > 0 && item.cantidad_blisters === 0 && item.cantidad_unidades === 0
                    const isOnlyBlister = item.cantidad_blisters > 0 && item.cantidad_cajas === 0 && item.cantidad_unidades === 0
                    const isOnlyUnidad = item.cantidad_unidades > 0 && item.cantidad_cajas === 0 && item.cantidad_blisters === 0

                    return (
                      <div key={item.producto_id} className="bg-slate-50 p-3 rounded-2xl flex flex-col gap-2 border border-transparent hover:border-slate-200 transition-all">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex-1 min-w-0 flex flex-col gap-1">
                            <p className="font-black text-slate-900 text-sm truncate">{item.nombre}</p>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-indigo-600 font-black text-base">{formatCurrency(item.precio_linea)}</p>
                              {item.descuento_porcentaje > 0 && (
                                <span className="bg-rose-100 text-rose-600 text-[8px] font-black px-1 rounded">-{item.descuento_porcentaje}%</span>
                              )}
                              {stockInfo && (
                                <span className="text-[9px] font-bold text-slate-500 bg-slate-200/50 px-1.5 py-0.5 rounded-md truncate">
                                  Stock: {stockInfo.cajas}C {stockInfo.blisters}B {stockInfo.unidades}U
                                </span>
                              )}
                              {usesUnpacking && (
                                <span className="text-[9px] font-black text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded-md">
                                  Destape auto.
                                </span>
                              )}
                            </div>

                            {frac && (
                              <div className="flex items-center gap-1 pt-0.5 flex-wrap">
                                <span className="text-[9px] font-bold text-slate-400 mr-0.5">Cambiar rápido:</span>
                                <button
                                  type="button"
                                  onClick={() => replaceCartCounts(item.producto_id, { cajas: 1, blisters: 0, unidades: 0 })}
                                  disabled={!canFulfillWithUnpacking(avail, { cajas: 1, blisters: 0, unidades: 0 }, bpc, upb)}
                                  className={`px-2 py-0.5 rounded-md text-[9px] font-black transition-colors disabled:opacity-35 ${
                                    isOnlyCaja
                                      ? 'bg-indigo-600 text-white'
                                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-indigo-50'
                                  }`}
                                >
                                  Solo Caja
                                </button>
                                {(avail.blisters > 0 || bpc > 1) && (
                                  <button
                                    type="button"
                                    onClick={() => replaceCartCounts(item.producto_id, { cajas: 0, blisters: 1, unidades: 0 })}
                                    disabled={!canFulfillWithUnpacking(avail, { cajas: 0, blisters: 1, unidades: 0 }, bpc, upb)}
                                    className={`px-2 py-0.5 rounded-md text-[9px] font-black transition-colors disabled:opacity-35 ${
                                      isOnlyBlister
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-emerald-50'
                                    }`}
                                  >
                                    Solo Sobre
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => replaceCartCounts(item.producto_id, { cajas: 0, blisters: 0, unidades: 1 })}
                                  disabled={!canFulfillWithUnpacking(avail, { cajas: 0, blisters: 0, unidades: 1 }, bpc, upb)}
                                  className={`px-2 py-0.5 rounded-md text-[9px] font-black transition-colors disabled:opacity-35 ${
                                    isOnlyUnidad
                                      ? 'bg-slate-900 text-white'
                                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                                  }`}
                                >
                                  Solo Unidad
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <div className="flex items-center gap-1">
                              {(['cantidad_cajas', 'cantidad_blisters', 'cantidad_unidades'] as const).map((field, idx) => {
                                const labels = ['CAJA', 'SOBRE', 'UNIDAD']
                                const val = item[field]

                                const nextReq = {
                                  cajas: field === 'cantidad_cajas' ? item.cantidad_cajas + 1 : item.cantidad_cajas,
                                  blisters: field === 'cantidad_blisters' ? item.cantidad_blisters + 1 : item.cantidad_blisters,
                                  unidades: field === 'cantidad_unidades' ? item.cantidad_unidades + 1 : item.cantidad_unidades,
                                }
                                const canAdd = stockInfo
                                  ? canFulfillWithUnpacking(avail, nextReq, bpc, upb) &&
                                    (field === 'cantidad_cajas' ||
                                      (field === 'cantidad_blisters' && (avail.blisters > 0 || bpc > 1)) ||
                                      (field === 'cantidad_unidades' && (avail.unidades > 0 || upb > 1 || bpc > 1)))
                                  : false
                                const canEverUse =
                                  field === 'cantidad_cajas'
                                    ? avail.cajas > 0
                                    : field === 'cantidad_blisters'
                                      ? avail.blisters > 0 || (bpc > 1 && avail.cajas > 0)
                                      : avail.unidades > 0 ||
                                        ((upb > 1 || bpc > 1) &&
                                          canFulfillWithUnpacking(avail, { cajas: 0, blisters: 0, unidades: 1 }, bpc, upb))

                                return (
                                  <div key={field} className={`flex flex-col items-center gap-0.5 ${!canEverUse && val === 0 ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
                                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{labels[idx]}</span>
                                    <div className="flex items-center bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                                      <button type="button" onClick={() => updateQuantity(item.producto_id, field, val - 1)} disabled={val <= 0} className="p-1.5 hover:bg-slate-100 transition-colors text-slate-700 disabled:opacity-30"><Minus className="w-3.5 h-3.5" /></button>
                                      <input
                                        type="number"
                                        min={0}
                                        aria-label={`Cantidad ${labels[idx]} de ${item.nombre}`}
                                        value={val}
                                        onChange={(e) => {
                                          const raw = parseInt(e.target.value, 10)
                                          updateQuantity(item.producto_id, field, isNaN(raw) || raw < 0 ? 0 : raw)
                                        }}
                                        className="w-9 text-center text-sm font-black text-slate-900 bg-transparent outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                      />
                                      <button type="button" onClick={() => updateQuantity(item.producto_id, field, val + 1)} disabled={!canAdd} className="p-1.5 hover:bg-slate-100 transition-colors text-slate-700 disabled:opacity-30"><Plus className="w-3.5 h-3.5" /></button>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>

                            <button type="button" onClick={() => removeFromCart(item.producto_id)} className="p-2 bg-rose-50 text-rose-500 hover:bg-rose-100 rounded-xl shrink-0 transition-colors ml-1">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {packSuggestion && (
                          <div className="flex items-center justify-between gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-1.5 text-[11px]">
                            <span className="font-bold text-amber-900">
                              {packSuggestion.summaryText}
                              {packSuggestion.savings > 0
                                ? ` (ahorra $${packSuggestion.savings.toLocaleString()} al cliente)`
                                : ''}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                replaceCartCounts(
                                  item.producto_id,
                                  packSuggestion.suggested,
                                  'Presentación ajustada al precio justo'
                                )
                              }
                              className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-black text-[10px] shrink-0 transition-colors"
                            >
                              Convertir por ${packSuggestion.newBasePrice.toLocaleString()}
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
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
                  {formatCurrency(cartTotal)}
                </h3>
              </div>

              {/* Selector de Método de Pago Grande */}
              <div className="mt-2">
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-tight mb-2 text-center">Método de Pago</p>
                {tipoVenta === 'credito' ? (
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-center text-xs font-bold text-amber-800">
                    Venta a crédito: el saldo se cobrará después en la pestaña Cartera.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {(['efectivo', 'transferencia', 'tarjeta', 'mixto'] as const).map(metodo => (
                      <button
                        key={metodo}
                        type="button"
                        onClick={() => setMetodoPago(metodo)}
                        className={`py-2.5 px-2 rounded-xl font-black text-xs transition-all border-2 ${metodoPago === metodo ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm' : 'border-slate-100 bg-white text-slate-500 hover:border-slate-300'}`}
                      >
                        {metodo === 'mixto' ? 'PAGO MIXTO' : metodo.toUpperCase()}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Calculadora de Vueltas (Sólo Efectivo) */}
              {tipoVenta === 'contado' && metodoPago === 'efectivo' && (
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

              {/* Pago Mixto Exacto */}
              {tipoVenta === 'contado' && metodoPago === 'mixto' && (
                <div className="bg-slate-50 rounded-2xl p-4 mt-1 border border-slate-200 space-y-2.5">
                  <p className="text-slate-700 text-xs font-black uppercase tracking-tight text-center">
                    Dividir Pago (Solo efectivo entra a gaveta)
                  </p>

                  {[
                    {
                      label: 'Efectivo',
                      valStr: pagoEfectivoStr,
                      setter: setPagoEfectivoStr,
                      otherSum: pagoTarjetaNum + pagoTransferenciaNum,
                    },
                    {
                      label: 'Transferencia (Nequi / Bancolombia)',
                      valStr: pagoTransferenciaStr,
                      setter: setPagoTransferenciaStr,
                      otherSum: pagoEfectivoNum + pagoTarjetaNum,
                    },
                    {
                      label: 'Tarjeta',
                      valStr: pagoTarjetaStr,
                      setter: setPagoTarjetaStr,
                      otherSum: pagoEfectivoNum + pagoTransferenciaNum,
                    },
                  ].map((field) => {
                    const restante = Math.max(0, Math.round(cartTotal - field.otherSum))
                    return (
                      <div key={field.label} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-slate-600">{field.label}</span>
                          <button
                            type="button"
                            onClick={() => field.setter(String(restante))}
                            className="text-[10px] font-black text-indigo-600 hover:underline"
                          >
                            Restante (${restante.toLocaleString()})
                          </button>
                        </div>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-sm">$</span>
                          <input
                            type="text"
                            value={field.valStr ? Number(field.valStr.replace(/\D/g, '') || 0).toLocaleString() : ''}
                            onChange={(e) => field.setter(e.target.value.replace(/\D/g, ''))}
                            placeholder="0"
                            className="w-full pl-7 pr-3 py-2 bg-white border border-slate-200 focus:border-indigo-500 rounded-xl font-black text-sm text-slate-900 text-right outline-none"
                          />
                        </div>
                      </div>
                    )
                  })}

                  <div
                    className={`p-2.5 rounded-xl border text-xs font-black text-center ${
                      pagoMixtoValidation.ok
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : 'bg-amber-50 border-amber-200 text-amber-800'
                    }`}
                  >
                    {pagoMixtoValidation.ok
                      ? `Cuadrado exacto (${formatCurrency(cartTotal)})`
                      : pagoMixtoValidation.error}
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
                      <select
                        value={tipoVenta}
                        onChange={(e) => {
                          const nextVal = e.target.value as 'contado' | 'credito'
                          setTipoVenta(nextVal)
                          if (nextVal === 'credito') {
                            setMetodoPago((prev) => (prev === 'mixto' ? 'efectivo' : prev))
                          }
                        }}
                        className="bg-transparent text-slate-700 font-black text-xs outline-none w-full appearance-none pr-6 cursor-pointer relative z-10">
                        <option value="contado">CONTADO</option>
                        <option value="credito">CRÉDITO</option>
                      </select>
                    </div>
                    <div className="bg-white rounded-xl p-2 border border-slate-100">
                      <p className="text-slate-400 text-[8px] font-black uppercase tracking-tight mb-1">Descuento (%)</p>
                      <input type="number" min="0" max="100" value={descuentoPct} onChange={e => setDescuentoPct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                        className="bg-transparent text-indigo-600 font-black text-sm outline-none w-full" />
                    </div>
                    <div className="col-span-2 bg-slate-100 rounded-xl p-2 border border-slate-200 flex justify-between items-center">
                      <p className="text-slate-400 text-[8px] font-black uppercase tracking-tight">Factura (Automática Sede)</p>
                      <p className="text-slate-600 font-black text-xs tracking-widest">{formatFacturaNum(nextFacturaNum)}</p>
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
                    onChange={e => {
                      setClienteSearch(e.target.value)
                      setShowClienteDropdown(true)
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
                  <input type="text" placeholder="Nombre completo *" value={nuevoCliente.nombre} onChange={e => setNuevoCliente(p => ({ ...p, nombre: e.target.value }))} className="w-full px-4 py-2.5 bg-white rounded-xl text-sm font-bold text-slate-900 outline-none border border-slate-200" />
                  <div className="grid grid-cols-2 gap-2">
                    <select value={nuevoCliente.tipo_doc} onChange={e => setNuevoCliente(p => ({ ...p, tipo_doc: e.target.value }))} className="px-3 py-2.5 bg-white rounded-xl text-sm font-bold outline-none border border-slate-200">
                      <option value="NIT">NIT</option>
                      <option value="CC">CC</option>
                    </select>
                    <input type="text" placeholder="Documento *" value={nuevoCliente.documento} onChange={e => setNuevoCliente(p => ({ ...p, documento: e.target.value }))} className="w-full px-4 py-2.5 bg-white rounded-xl text-sm font-bold text-slate-900 outline-none border border-slate-200" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input type="email" placeholder="Correo (opcional)" value={nuevoCliente.email} onChange={e => setNuevoCliente(p => ({ ...p, email: e.target.value }))} className="w-full px-4 py-2.5 bg-white rounded-xl text-sm font-bold text-slate-900 outline-none border border-slate-200" />
                    <select value={nuevoCliente.tipo_cliente} onChange={e => setNuevoCliente(p => ({ ...p, tipo_cliente: e.target.value }))} className="w-full px-3 py-2.5 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-black outline-none border border-indigo-100">
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
                  <span>{formatCurrency(cartSubtotalBruto)}</span>
                </div>
                {cartDescuentoMonto > 0 ? (
                  <div className="flex flex-col gap-2 font-black text-rose-500 bg-rose-50 px-4 py-3 rounded-2xl border border-rose-100/50">
                    <div className="flex justify-between text-sm">
                      <span>Descuento Aplicado</span>
                      <span>-{formatCurrency(cartDescuentoMonto)}</span>
                    </div>
                    <div className="flex flex-col gap-1 pt-2 border-t border-rose-200/50">
                      {cart.filter(item => item.descuento_porcentaje > 0).map(item => (
                        <div key={item.producto_id} className="flex justify-between items-center text-[10px] font-bold text-rose-400 opacity-90">
                          <span className="truncate max-w-[200px]">{item.nombre} ({item.descuento_porcentaje}%)</span>
                          <span>-{formatCurrency(item.precio_unitario_base - item.precio_linea)}</span>
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
                  <span>{hasMixedIva ? 'Impuestos (IVA por producto)' : `Impuestos (IVA ${cartIvaPct}%)`}</span>
                  <span>+{formatCurrency(cartIvaMonto)}</span>
                </div>
              </div>

              <div className="h-px bg-slate-100 my-1" />

              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <span className="text-sm font-black text-slate-500 uppercase tracking-widest">Total Neto a Pagar</span>
                  <span className="text-4xl font-black text-indigo-600 tracking-tighter leading-none">{formatCurrency(cartTotal)}</span>
                </div>
                <button
                  onClick={handleProcessSale}
                  disabled={isProcessing || cart.length === 0 || (tipoVenta === 'contado' && !pagoMixtoValidation.ok)}
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
              <button
                onClick={() => setFilterMethod(filterMethod === 'efectivo' ? 'todos' : 'efectivo')}
                className={`flex justify-between items-center text-sm p-1.5 rounded-lg transition-all ${filterMethod === 'efectivo' ? 'bg-indigo-500 text-white' : 'hover:bg-slate-800'}`}
              >
                <span className={filterMethod === 'efectivo' ? 'text-indigo-100 font-bold' : 'text-slate-400'}>Efectivo</span>
                <span className="font-black">${kpisVentas.efectivo.toLocaleString()}</span>
              </button>
              <button
                onClick={() => setFilterMethod(filterMethod === 'tarjeta' ? 'todos' : 'tarjeta')}
                className={`flex justify-between items-center text-sm p-1.5 rounded-lg transition-all ${filterMethod === 'tarjeta' ? 'bg-indigo-500 text-white' : 'hover:bg-slate-800'}`}
              >
                <span className={filterMethod === 'tarjeta' ? 'text-indigo-100 font-bold' : 'text-slate-400'}>Tarjeta</span>
                <span className="font-black">${kpisVentas.tarjeta.toLocaleString()}</span>
              </button>
              <button
                onClick={() => setFilterMethod(filterMethod === 'transferencia' ? 'todos' : 'transferencia')}
                className={`flex justify-between items-center text-sm p-1.5 rounded-lg transition-all ${filterMethod === 'transferencia' ? 'bg-indigo-500 text-white' : 'hover:bg-slate-800'}`}
              >
                <span className={filterMethod === 'transferencia' ? 'text-indigo-100 font-bold' : 'text-slate-400'}>Transf.</span>
                <span className="font-black">${kpisVentas.transferencia.toLocaleString()}</span>
              </button>
            </div>
          </div>

          {filterMethod !== 'todos' && (
            <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 px-6 py-3 rounded-2xl animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
                <p className="text-xs font-bold text-indigo-900">
                  Filtro activo: <span className="uppercase font-black text-indigo-700">{filterMethod}</span> ({ventasFiltradas.length} resultados)
                </p>
              </div>
              <button
                onClick={() => setFilterMethod('todos')}
                className="text-xs font-black text-indigo-600 hover:text-indigo-800 bg-white px-3 py-1.5 rounded-xl border border-indigo-200 shadow-sm transition-all active:scale-95"
              >
                Quitar Filtro ✕
              </button>
            </div>
          )}

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
                      {ventasFiltradas.length === 0 ? (
                        <tr><td colSpan={7} className="py-20 text-center text-slate-300 font-black">No hay ventas registradas</td></tr>
                      ) : ventasFiltradas.map(f => (
                        <React.Fragment key={f.id}>
                          <tr className={`hover:bg-slate-50/50 transition-colors cursor-pointer ${expandedFacturaId === f.id ? 'bg-slate-50' : ''}`}
                            onClick={() => setExpandedFacturaId(expandedFacturaId === f.id ? null : f.id)}>
                            <td className="px-5 py-3 font-black text-indigo-600 flex items-center gap-2">
                              {expandedFacturaId === f.id ? <ChevronDown className="w-3 h-3 rotate-180" /> : <ChevronDown className="w-3 h-3" />}
                              {formatFacturaNum(f.numero)}
                            </td>
                            <td className="px-5 py-3 font-bold text-slate-600">{new Date(f.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                            <td className="px-5 py-3">
                              <p className="font-bold text-slate-900">{f.cliente_nombre}</p>
                              <p className="text-[10px] text-slate-400 font-bold">{f.cliente_documento}</p>
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex flex-wrap gap-1">
                                <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-black uppercase ${f.tipo_venta === 'contado' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-700'}`}>
                                  {f.tipo_venta}
                                </span>
                                {f.metodo_pago === 'mixto' ? (
                                  <span className="inline-block px-2 py-0.5 rounded text-[9px] font-black uppercase bg-indigo-100 text-indigo-700">
                                    Mixto
                                  </span>
                                ) : (
                                  <span className="inline-block px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-50 text-slate-500 border border-slate-100">
                                    {f.metodo_pago}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-3">
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[9px] font-black uppercase ${f.estado_pago === 'pagado'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : f.estado_pago === 'anulada'
                                      ? 'bg-slate-200 text-slate-600'
                                      : 'bg-rose-100 text-rose-700'
                                  }`}
                              >
                                {f.estado_pago}
                              </span>
                            </td>
                            <td
                              className={`px-5 py-3 font-black text-base ${f.estado_pago === 'anulada'
                                  ? 'text-slate-400 line-through'
                                  : 'text-slate-900'
                                }`}
                            >
                              ${Number(f.total).toLocaleString()}
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex gap-2">
                                {f.estado_pago === 'pendiente' && (
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation()
                                      if (!cajaAbierta) { toast.error('Abre caja para registrar el pago'); return }
                                      const confirm = window.confirm(`¿Registrar pago de $${Number(f.total).toLocaleString()} para la factura ${formatFacturaNum(f.numero)}?`)
                                      if (!confirm) return
                                      const res = await cobrarSaldoTotal(f.id, cajaAbierta.id, 'efectivo')
                                      if (res.success) { toast.success('Pago registrado'); fetchVentas() } else { toast.error(res.error) }
                                    }}
                                    className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-white text-[9px] font-black rounded-lg shadow-sm transition-all uppercase">
                                    Pagar
                                  </button>
                                )}
                                {isAdmin && f.estado_pago !== 'anulada' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setCancelingFactura(f)
                                      setCancelReason('')
                                    }}
                                    className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[9px] font-black rounded-lg transition-all uppercase inline-flex items-center gap-1"
                                    title="Anular factura y devolver stock"
                                  >
                                    <Ban className="w-3 h-3" />
                                    Anular
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {expandedFacturaId === f.id && (
                            <tr>
                              <td colSpan={7} className="px-5 py-4 bg-slate-50/50">
                                <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm animate-in slide-in-from-top-1 duration-200">
                                  {f.estado_pago === 'anulada' && (
                                    <div className="mb-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700 font-bold">
                                      Factura anulada{f.motivo_anulacion ? ` — Motivo: ${f.motivo_anulacion}` : ' (stock devuelto al inventario)'}
                                    </div>
                                  )}
                                  {f.metodo_pago === 'mixto' && (
                                    <div className="mb-3 rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2 text-xs text-indigo-800 font-bold flex flex-wrap gap-3">
                                      <span>Desglose Pago Mixto:</span>
                                      {Number(f.pago_efectivo || 0) > 0 && <span>Efectivo: ${Number(f.pago_efectivo).toLocaleString()}</span>}
                                      {Number(f.pago_transferencia || 0) > 0 && <span>Transferencia: ${Number(f.pago_transferencia).toLocaleString()}</span>}
                                      {Number(f.pago_tarjeta || 0) > 0 && <span>Tarjeta: ${Number(f.pago_tarjeta).toLocaleString()}</span>}
                                    </div>
                                  )}
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
                                              <p className="text-[10px] text-slate-400 line-through font-bold">${Number(d.precio_unitario / (1 - (f.descuento_porcentaje / 100))).toLocaleString()}</p>
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
                      {['Factura', 'Cliente', 'Vencimiento', 'Estado', 'Saldo', 'Acción'].map(h => (
                        <th key={h} className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {carteraPendiente.length === 0 ? (
                      <tr><td colSpan={6} className="py-20 text-center text-slate-300 font-black">No hay créditos pendientes</td></tr>
                    ) : (
                      carteraPendiente.map(f => {
                        const esVencido = f.estado_plazo === 'vencido' || (f.fecha_vencimiento ? new Date(f.fecha_vencimiento) < new Date() : false)
                        const diasRestantes = typeof f.dias_restantes === 'number'
                          ? f.dias_restantes
                          : Math.ceil((new Date(f.fecha_vencimiento).getTime() - new Date().getTime()) / (1000 * 3600 * 24))
                        const totalConDescuento = Number(f.total_con_descuento ?? f.total ?? 0)
                        const totalSinDescuento = Number(f.total_sin_descuento ?? (totalConDescuento + Number(f.descuento_monto || 0)))

                        return (
                          <tr key={f.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-5 py-3 font-black text-indigo-600">{formatFacturaNum(f.numero)}</td>
                            <td className="px-5 py-3">
                              <p className="font-bold text-slate-900">{f.cliente_nombre}</p>
                              <p className="text-[10px] text-slate-400 font-bold">OC: {f.orden_compra || 'N/A'}</p>
                            </td>
                            <td className="px-5 py-3">
                              <p className={`font-bold ${esVencido ? 'text-rose-600' : 'text-slate-600'}`}>
                                {f.fecha_vencimiento ? new Date(f.fecha_vencimiento).toLocaleDateString() : '-'}
                              </p>
                              <p className="text-[10px] text-slate-400 font-bold">
                                {esVencido ? `⚠️ Vencido hace ${Math.abs(diasRestantes)}d` : `✅ Vence en ${Math.max(0, diasRestantes)}d`}
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
                                  <span className="text-rose-600 font-black text-base">{formatCurrency(f.saldo_pendiente ?? totalSinDescuento)}</span>
                                  {Number(f.monto_abonado || 0) > 0 && (
                                    <span className="text-[9px] text-indigo-600 font-bold">Abonado: {formatCurrency(f.monto_abonado)}</span>
                                  )}
                                  <span className="text-[9px] text-slate-400 line-through font-bold">Base: {formatCurrency(totalConDescuento)}</span>
                                </div>
                              ) : (
                                <div className="flex flex-col">
                                  <span className="text-emerald-600 font-black text-base">{formatCurrency(f.saldo_pendiente ?? totalConDescuento)}</span>
                                  {Number(f.monto_abonado || 0) > 0 ? (
                                    <span className="text-[9px] text-indigo-600 font-bold">Abonado: {formatCurrency(f.monto_abonado)}</span>
                                  ) : (
                                    <span className="text-[9px] text-indigo-400 font-bold">Ahorro: {formatCurrency(f.descuento_monto)}</span>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  onClick={() => {
                                    if (!cajaAbierta) { toast.error('Abre caja para registrar el abono'); return }
                                    const saldo = Number(f.saldo_pendiente ?? (esVencido ? totalSinDescuento : totalConDescuento))
                                    setPayingAbonoFactura({ ...f, saldo_calc: saldo })
                                    setAbonoMonto(String(Math.round(saldo)))
                                    setAbonoMetodo('efectivo')
                                    setAbonoNotas('')
                                  }}
                                  className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10px] font-black rounded-lg transition-all uppercase"
                                >
                                  Abonar
                                </button>
                                <button
                                  onClick={async () => {
                                    if (!cajaAbierta) { toast.error('Abre caja para registrar el cobro'); return }
                                    const monto = Number(f.saldo_pendiente ?? (esVencido ? totalSinDescuento : totalConDescuento))
                                    if (!window.confirm(`¿Registrar pago total del saldo (${formatCurrency(monto)}) para la factura ${formatFacturaNum(f.numero)}?`)) return
                                    const res = Number(f.monto_abonado || 0) > 0
                                      ? await registrarAbono(f.id, cajaAbierta.id, monto, 'efectivo', 'Pago saldo final')
                                      : await cobrarSaldoTotal(f.id, cajaAbierta.id, 'efectivo')
                                    if (res.success) {
                                      toast.success('Cobro registrado correctamente')
                                      await fetchVentas()
                                    } else {
                                      toast.error(res.error || 'Error al registrar cobro')
                                    }
                                  }}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black rounded-lg shadow-sm transition-all uppercase"
                                >
                                  Cobrar
                                </button>
                              </div>
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
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col items-center text-center animate-in zoom-in-95 duration-300">
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
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col items-center animate-in zoom-in-95 duration-300">
            <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mb-6">
              <Lock className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-2">Cerrar Turno</h3>
            <p className="text-slate-500 font-bold mb-6 text-center text-sm">
              Ingresa el efectivo exacto que hay en la gaveta. El sistema calculará automáticamente si hay algún descuadre.
            </p>

            {isAdmin ? (
              <div className="w-full bg-slate-50 rounded-2xl p-5 mb-6 border border-slate-100 space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500 font-bold">Fondo Base (Apertura)</span>
                  <span className="font-black text-slate-900">${Number(cajaAbierta.monto_apertura).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500 font-bold">Ventas en Efectivo</span>
                  <span className="font-black text-emerald-600">+ ${kpisVentas.efectivo.toLocaleString()}</span>
                </div>
                {totalAbonosEfectivoSesion > 0 && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 font-bold">Abonos Cartera Efectivo</span>
                    <span className="font-black text-emerald-600">+ ${totalAbonosEfectivoSesion.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500 font-bold">Gastos en Efectivo</span>
                  <span className="font-black text-rose-600">- ${totalGastosSesion.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500 font-bold">Compras en Efectivo</span>
                  <span className="font-black text-rose-600">- ${totalComprasEfectivoSesion.toLocaleString()}</span>
                </div>
                <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                  <span className="text-slate-900 font-black uppercase text-xs">Total Esperado en Gaveta</span>
                  <span className="font-black text-xl text-indigo-600">${totalEsperadoCaja.toLocaleString()}</span>
                </div>
              </div>
            ) : (
              <div className="w-full bg-amber-50 rounded-2xl p-4 mb-6 border border-amber-200 text-xs font-bold text-amber-800 text-center">
                Arqueo ciego activo: cuenta el efectivo físico de tu gaveta y regístralo aquí para finalizar tu turno.
              </div>
            )}

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

      {cancelingFactura && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  Anular Factura #{cancelingFactura.numero}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Se devolverán automáticamente las cantidades vendidas al inventario y se registrará en auditoría.
                </p>
              </div>
              <button
                onClick={() => setCancelingFactura(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs space-y-1">
              <p>
                <span className="font-bold text-slate-500">Cliente:</span>{' '}
                <span className="font-black text-slate-800">{cancelingFactura.cliente_nombre}</span>
              </p>
              <p>
                <span className="font-bold text-slate-500">Total:</span>{' '}
                <span className="font-black text-slate-800">
                  ${Number(cancelingFactura.total).toLocaleString()}
                </span>
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-600 block">
                Motivo de anulación *
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ej. Error en digitación o devolución del cliente"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancelingFactura(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl text-xs font-black"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isCancelingFactura || cancelReason.trim().length < 3}
                onClick={async () => {
                  setIsCancelingFactura(true)
                  const res = await anularVenta(cancelingFactura.id, cancelReason)
                  if (res.success) {
                    toast.success(`Factura #${cancelingFactura.numero} anulada y stock devuelto`)
                    setCancelingFactura(null)
                    setCancelReason('')
                    void catalogo.sincronizar()
                    await fetchVentas()
                  } else {
                    toast.error(res.error || 'No se pudo anular la factura')
                  }
                  setIsCancelingFactura(false)
                }}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white py-2.5 rounded-xl text-xs font-black disabled:opacity-50"
              >
                {isCancelingFactura ? 'Anulando...' : 'Confirmar Anulación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Equivalentes por Principio Activo */}
      {equivalentesSource && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-indigo-600">
                  Alternativas Terapéuticas Disponibles
                </p>
                <h3 className="text-lg font-black text-slate-900">
                  Molécula: {equivalentesSource.principio_activo}
                </h3>
                <p className="text-xs text-slate-500">
                  Alternativas con stock en tu droguería para {equivalentesSource.nombre_producto}.
                </p>
              </div>
              <button
                onClick={() => setEquivalentesSource(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {equivalentesList.length > 0 ? (
              <div className="space-y-2">
                {equivalentesList.map((eq) => {
                  const frac = isFracProduct(eq)
                  const bpc = Math.max(1, Number(eq.blisters_por_caja) || 1)
                  const upb = Math.max(1, Number(eq.unidades_por_blister) || 1)
                  const avail = {
                    cajas: Number(eq.cajas) || 0,
                    blisters: Number(eq.blisters) || 0,
                    unidades: Number(eq.unidades) || 0,
                  }
                  return (
                    <div
                      key={eq.producto_id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-2xl bg-slate-50 border border-slate-100"
                    >
                      <div className="min-w-0">
                        <p className="font-black text-sm text-slate-900 truncate">
                          {eq.nombre_producto}
                        </p>
                        <p className="text-[11px] font-bold text-slate-500">
                          {eq.laboratorio || 'Genérico'} • Stock: {eq.cajas}C / {eq.blisters}B / {eq.unidades}U
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5 shrink-0">
                        {!frac ? (
                          <button
                            type="button"
                            onClick={() => {
                              addToCart(eq, 'caja')
                              setEquivalentesSource(null)
                            }}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black"
                          >
                            + Agregar
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              disabled={avail.cajas < 1}
                              onClick={() => {
                                addToCart(eq, 'caja')
                                setEquivalentesSource(null)
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black disabled:opacity-35"
                            >
                              + Caja
                            </button>
                            {(avail.blisters > 0 || bpc > 1) && (
                              <button
                                type="button"
                                disabled={!canFulfillWithUnpacking(avail, { cajas: 0, blisters: 1, unidades: 0 }, bpc, upb)}
                                onClick={() => {
                                  addToCart(eq, 'blister')
                                  setEquivalentesSource(null)
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black disabled:opacity-35"
                              >
                                + Sobre
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={!canFulfillWithUnpacking(avail, { cajas: 0, blisters: 0, unidades: 1 }, bpc, upb)}
                              onClick={() => {
                                addToCart(eq, 'unidad')
                                setEquivalentesSource(null)
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-black disabled:opacity-35"
                            >
                              + Unidad
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="rounded-2xl bg-slate-50 border border-dashed border-slate-200 p-6 text-center text-xs font-bold text-slate-500">
                No hay otros productos disponibles con esta misma molécula en stock.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Abono Parcial en Cartera */}
      {payingAbonoFactura && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">
                  Registrar Abono — Factura #{payingAbonoFactura.numero}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Cliente: <strong>{payingAbonoFactura.cliente_nombre}</strong> • Saldo pendiente:{' '}
                  <strong className="text-emerald-600">
                    {formatCurrency(payingAbonoFactura.saldo_calc)}
                  </strong>
                </p>
              </div>
              <button
                onClick={() => setPayingAbonoFactura(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 block">Monto a abonar *</label>
                <input
                  type="number"
                  min={1}
                  max={payingAbonoFactura.saldo_calc}
                  step="1"
                  value={abonoMonto}
                  onChange={(e) => setAbonoMonto(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 block">Método de pago</label>
                <select
                  value={abonoMetodo}
                  onChange={(e) =>
                    setAbonoMetodo(e.target.value as 'efectivo' | 'tarjeta' | 'transferencia')
                  }
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none"
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="transferencia">Transferencia</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 block">Nota (opcional)</label>
                <input
                  type="text"
                  value={abonoNotas}
                  onChange={(e) => setAbonoNotas(e.target.value)}
                  placeholder="Ej. Abono transferencia Bancolombia"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPayingAbonoFactura(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl text-xs font-black"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  isSavingAbono ||
                  !abonoMonto ||
                  Number(abonoMonto) <= 0 ||
                  Number(abonoMonto) > Number(payingAbonoFactura.saldo_calc) + 0.01
                }
                onClick={async () => {
                  if (!cajaAbierta) return
                  setIsSavingAbono(true)
                  const res = await registrarAbono(
                    payingAbonoFactura.id,
                    cajaAbierta.id,
                    Number(abonoMonto),
                    abonoMetodo,
                    abonoNotas
                  )
                  if (res.success) {
                    toast.success('Abono registrado correctamente')
                    setPayingAbonoFactura(null)
                    await fetchVentas()
                  } else {
                    toast.error(res.error || 'Error al registrar abono')
                  }
                  setIsSavingAbono(false)
                }}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-xs font-black disabled:opacity-50"
              >
                {isSavingAbono ? 'Guardando...' : 'Confirmar Abono'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

