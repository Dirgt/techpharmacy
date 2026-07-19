/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useMemo } from 'react'
import { FileDown, DollarSign, Receipt, CreditCard, Wallet, Banknote } from 'lucide-react'

export default function ReportesClient({ initialFacturas }: { initialFacturas: any[] }) {
  const kpis = useMemo(() => {
    let totalEfectivo = 0
    let totalTarjeta = 0
    let totalTransferencia = 0
    let totalIngresos = 0

    initialFacturas.forEach(f => {
      const t = Number(f.total) || 0
      totalIngresos += t
      if (f.metodo_pago === 'efectivo') totalEfectivo += t
      else if (f.metodo_pago === 'tarjeta') totalTarjeta += t
      else if (f.metodo_pago === 'transferencia') totalTransferencia += t
    })

    return {
      totalIngresos,
      totalEfectivo,
      totalTarjeta,
      totalTransferencia,
      cantidadFacturas: initialFacturas.length,
      ticketPromedio: initialFacturas.length > 0 ? totalIngresos / initialFacturas.length : 0
    }
  }, [initialFacturas])

  const exportarCSV = () => {
    if (initialFacturas.length === 0) return

    const cabeceras = [
      'Numero Factura',
      'Fecha',
      'Cliente',
      'Documento',
      'Vendedor',
      'Metodo Pago',
      'Total'
    ].join(',')

    const filas = initialFacturas.map(f => {
      const fecha = new Date(f.created_at).toLocaleString()
      const vendedor = f.vendedor?.full_name || 'Desconocido'
      return `${f.numero},"${fecha}","${f.cliente_nombre}","${f.cliente_documento}","${vendedor}","${f.metodo_pago}",${f.total}`
    }).join('\n')

    const csvContent = "data:text/csv;charset=utf-8," + cabeceras + "\n" + filas
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `reporte_ventas_${new Date().toISOString().split('T')[0]}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-1000">
      
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-emerald-500 rounded-3xl p-6 text-white shadow-xl shadow-emerald-500/20 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white rounded-full blur-[50px] opacity-20 -translate-y-1/2 translate-x-1/2" />
          <div className="relative z-10 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <span className="text-emerald-50 font-black uppercase tracking-wider text-xs">Total Vendido Hoy</span>
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md">
                <DollarSign className="w-5 h-5 text-white" />
              </div>
            </div>
            <span className="text-4xl font-black tracking-tighter">${kpis.totalIngresos.toLocaleString()}</span>
          </div>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xl flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <span className="text-slate-400 font-black uppercase tracking-wider text-xs">Facturas Emitidas</span>
            <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
              <Receipt className="w-5 h-5 text-indigo-600" />
            </div>
          </div>
          <span className="text-4xl font-black text-slate-900 tracking-tighter">{kpis.cantidadFacturas}</span>
        </div>

        <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xl flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <span className="text-slate-400 font-black uppercase tracking-wider text-xs">Ticket Promedio</span>
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <span className="text-4xl font-black text-slate-900 tracking-tighter">${Math.round(kpis.ticketPromedio).toLocaleString()}</span>
        </div>

        {/* Desglose Métodos de Pago */}
        <div className="bg-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-col justify-center gap-3">
          <h3 className="text-slate-400 font-black uppercase tracking-wider text-[10px] mb-1">Desglose por Pago</h3>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Banknote className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-bold text-slate-300">Efectivo</span>
            </div>
            <span className="font-black">${kpis.totalEfectivo.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-indigo-400" />
              <span className="text-sm font-bold text-slate-300">Tarjeta</span>
            </div>
            <span className="font-black">${kpis.totalTarjeta.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-bold text-slate-300">Transf</span>
            </div>
            <span className="font-black">${kpis.totalTransferencia.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Tabla de Facturas Recientes */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100 flex flex-wrap justify-between items-center gap-4">
          <h2 className="text-xl font-black text-slate-900">Historial de Ventas de Hoy</h2>
          <button 
            onClick={exportarCSV}
            className="bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl font-black text-sm transition-all flex items-center gap-2 active:scale-95"
          >
            <FileDown className="w-4 h-4" />
            Exportar CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Factura</th>
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Hora</th>
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Vendedor</th>
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Cliente</th>
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">Método</th>
                <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {initialFacturas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-bold">
                    No hay ventas registradas el día de hoy.
                  </td>
                </tr>
              ) : (
                initialFacturas.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <span className="font-black text-indigo-600">#{f.numero}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-bold text-slate-600">
                        {new Date(f.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-bold text-slate-900">{f.vendedor?.full_name || 'N/A'}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900">{f.cliente_nombre}</span>
                        <span className="text-xs font-bold text-slate-400">{f.cliente_documento}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${
                        f.metodo_pago === 'efectivo' ? 'bg-emerald-50 text-emerald-700' :
                        f.metodo_pago === 'tarjeta' ? 'bg-indigo-50 text-indigo-700' :
                        'bg-purple-50 text-purple-700'
                      }`}>
                        {f.metodo_pago}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="font-black text-slate-900 text-lg">${Number(f.total).toLocaleString()}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
