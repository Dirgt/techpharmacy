'use client'

import { useState } from 'react'
import { Database } from '@/lib/supabase/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Plus, Search, FileText, Calendar, PlusCircle, Trash2, ShoppingCart, AlertCircle } from 'lucide-react'
import { registrarCompra } from '@/app/actions/tesoreria'
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
} from "@/components/ui/select"

type Compra = Database['public']['Tables']['compras']['Row'] & {
  proveedores: { nombre: string } | null,
  caja_sesiones: { abierto_por: string } | null
}
type Proveedor = Database['public']['Tables']['proveedores']['Row']
type Producto = Database['public']['Tables']['productos']['Row']
type Caja = Database['public']['Tables']['caja_sesiones']['Row']

export default function ComprasClient({ 
  initialData, 
  proveedores,
  productos,
  caja
}: { 
  initialData: any[],
  proveedores: Proveedor[],
  productos: Producto[],
  caja: Caja | null
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const [proveedorId, setProveedorId] = useState('')
  const [numeroFactura, setNumeroFactura] = useState('')
  const [estadoPago, setEstadoPago] = useState('pendiente')
  const [metodoPago, setMetodoPago] = useState('efectivo')
  const [detalles, setDetalles] = useState<{producto_id: string, cantidad: number, costo_unitario: number}[]>([])

  const filteredData = initialData.filter(c => 
    c.numero_factura.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.proveedores?.nombre.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleAddDetalle = () => {
    setDetalles([...detalles, { producto_id: '', cantidad: 1, costo_unitario: 0 }])
  }

  const handleRemoveDetalle = (index: number) => {
    const newDetalles = [...detalles]
    newDetalles.splice(index, 1)
    setDetalles(newDetalles)
  }

  const handleDetalleChange = (index: number, field: string, value: any) => {
    const newDetalles = [...detalles]
    newDetalles[index] = { ...newDetalles[index], [field]: value }
    setDetalles(newDetalles)
  }

  const calcularTotal = () => {
    return detalles.reduce((acc, det) => acc + (det.cantidad * det.costo_unitario), 0)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!proveedorId) return toast.error('Seleccione un proveedor')
    if (detalles.length === 0) return toast.error('Agregue al menos un producto a la compra')
    if (detalles.some(d => !d.producto_id)) return toast.error('Seleccione los productos en los detalles')

    if (estadoPago === 'pagado' && metodoPago === 'efectivo' && (!caja || caja.estado !== 'abierta')) {
      return toast.error('No hay caja abierta para realizar el pago en efectivo')
    }

    setIsSubmitting(true)
    const total = calcularTotal()

    const result = await registrarCompra({
      proveedor_id: proveedorId,
      numero_factura: numeroFactura,
      total,
      estado_pago: estadoPago as any,
      metodo_pago: metodoPago as any,
      caja_sesion_id: caja?.id || null,
      detalles: detalles
    })

    if (result.success) {
      toast.success('Compra registrada correctamente')
      setIsModalOpen(false)
      // Reset form
      setProveedorId('')
      setNumeroFactura('')
      setEstadoPago('pendiente')
      setMetodoPago('efectivo')
      setDetalles([])
    } else {
      toast.error(result.error || 'Error al registrar compra')
    }
    setIsSubmitting(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Compras a Proveedores</h1>
          <p className="text-slate-500 mt-1">Gestión de abastecimiento e ingreso de mercancía</p>
        </div>
        
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200">
              <Plus className="w-4 h-4 mr-2" />
              Registrar Compra
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center">
                <ShoppingCart className="w-5 h-5 mr-2 text-indigo-600" />
                Nueva Compra e Ingreso al Inventario
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

            <form onSubmit={handleSubmit} className="space-y-6 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-4 rounded-lg border border-slate-200">
                <div className="space-y-2">
                  <Label>Proveedor *</Label>
                  <Select value={proveedorId} onValueChange={setProveedorId} required>
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Seleccione un proveedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {proveedores.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
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
                      onChange={e => setNumeroFactura(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Estado de Pago</Label>
                  <Select value={estadoPago} onValueChange={setEstadoPago}>
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
                    <Select value={metodoPago} onValueChange={setMetodoPago}>
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
              </div>

              {/* Detalles de productos */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label className="text-lg font-semibold text-slate-800">Productos Ingresados (Cajas)</Label>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddDetalle} className="border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                    <PlusCircle className="w-4 h-4 mr-2" /> Agregar Producto
                  </Button>
                </div>

                <div className="rounded-md border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Producto</th>
                        <th className="px-4 py-2 text-left font-medium w-32">Cajas</th>
                        <th className="px-4 py-2 text-left font-medium w-40">Costo Unit. (Caja)</th>
                        <th className="px-4 py-2 text-left font-medium w-32">Subtotal</th>
                        <th className="px-4 py-2 w-16"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detalles.map((det, index) => (
                        <tr key={index} className="bg-white">
                          <td className="px-4 py-2">
                            <Select value={det.producto_id} onValueChange={(val) => handleDetalleChange(index, 'producto_id', val)}>
                              <SelectTrigger className="border-slate-200">
                                <SelectValue placeholder="Seleccione..." />
                              </SelectTrigger>
                              <SelectContent>
                                {productos.map(p => (
                                  <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-4 py-2">
                            <Input 
                              type="number" min="1" 
                              value={det.cantidad || ''}
                              onChange={e => handleDetalleChange(index, 'cantidad', parseInt(e.target.value) || 0)}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <Input 
                              type="number" step="0.01" min="0"
                              value={det.costo_unitario || ''}
                              onChange={e => handleDetalleChange(index, 'costo_unitario', parseFloat(e.target.value) || 0)}
                            />
                          </td>
                          <td className="px-4 py-2 font-medium text-slate-700">
                            ${(det.cantidad * det.costo_unitario).toFixed(2)}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <Button type="button" variant="ghost" size="icon" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleRemoveDetalle(index)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {detalles.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-500 bg-white">
                            No hay productos en esta compra. Añade productos para registrarlos en el inventario.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end pt-2">
                  <div className="text-xl font-bold text-slate-800 bg-slate-100 px-4 py-2 rounded-lg inline-flex items-center">
                    Total: <span className="text-indigo-600 ml-2">${calcularTotal().toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={isSubmitting || detalles.length === 0} className="bg-indigo-600 hover:bg-indigo-700">
                  {isSubmitting ? 'Procesando...' : 'Confirmar Compra'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por factura o proveedor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-white"
            />
          </div>
        </div>

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
                      {new Date(compra.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-900">
                      #{compra.numero_factura}
                    </td>
                    <td className="px-6 py-4">
                      {compra.proveedores?.nombre}
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-900">
                      ${Number(compra.total).toFixed(2)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                        compra.estado_pago === 'pagado' ? 'bg-emerald-100 text-emerald-700' :
                        compra.estado_pago === 'credito' ? 'bg-amber-100 text-amber-700' :
                        'bg-rose-100 text-rose-700'
                      }`}>
                        {compra.estado_pago.charAt(0).toUpperCase() + compra.estado_pago.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="sm" className="text-slate-400 hover:text-indigo-600">
                        Ver Detalles
                      </Button>
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
    </div>
  )
}
