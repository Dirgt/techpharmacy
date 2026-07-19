/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useEffect } from 'react'
import { Printer } from 'lucide-react'

export default function PrintClient({ factura, detalles }: { factura: any, detalles: any[] }) {
  useEffect(() => {
    // Optionally trigger print automatically
    // window.print()
  }, [])

  const handlePrint = () => {
    window.print()
  }

  const isCredito = factura.tipo_venta === 'credito'

  // Pre-calcular líneas para asegurar consistencia total en los redondeos
  const lineasCalculadas = detalles.map(d => {
    const isDiscounted = factura.descuento_porcentaje > 0;
    const subtotalConDescuento = Number(d.precio_unitario);
    
    // Calculamos el precio base de la línea redondeado a 2 decimales
    const rawPrecioBase = isDiscounted 
      ? subtotalConDescuento / (1 - (factura.descuento_porcentaje / 100))
      : subtotalConDescuento;
    
    const precioBaseRow = Math.round(rawPrecioBase * 100) / 100;
    const descuentoRow = Math.round((precioBaseRow - subtotalConDescuento) * 100) / 100;

    return {
      ...d,
      precioBaseRow,
      descuentoRow,
      subtotalConDescuento
    };
  });

  // Totales basados exclusivamente en lo que se muestra en las filas
  const totalSinDescuentoCalculado = lineasCalculadas.reduce((acc, curr) => acc + curr.precioBaseRow, 0);
  const totalDescuentoCalculado = lineasCalculadas.reduce((acc, curr) => acc + curr.descuentoRow, 0);
  const totalFinalCalculado = totalSinDescuentoCalculado - totalDescuentoCalculado;

  return (
    <div className="w-full max-w-4xl mx-auto bg-white shadow-2xl print:shadow-none print:max-w-none rounded-2xl print:rounded-none overflow-hidden flex flex-col relative print:w-full print:max-w-[215mm] print:mx-auto">
      <style jsx global>{`
        @media print {
          @page {
            margin: 5mm 10mm;
            size: letter;
          }
          body {
            background: white !important;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>
      
      {/* Non-printable action bar */}
      <div className="bg-slate-900 px-6 py-4 flex justify-between items-center print:hidden rounded-t-2xl">
        <div>
          <h2 className="text-white font-black text-lg">Factura #{factura.numero}</h2>
          <p className="text-slate-400 text-xs font-bold">Vista previa de impresión</p>
        </div>
        <button 
          onClick={handlePrint}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-black text-sm flex items-center gap-2 transition-all shadow-lg shadow-indigo-600/20"
        >
          <Printer className="w-4 h-4" />
          IMPRIMIR FACTURA
        </button>
      </div>

      {/* Printable Invoice Body */}
      <div className="p-10 print:p-4 bg-white text-slate-900 w-full font-sans print:text-[11px]">
        
        {/* Header */}
        <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6 mb-6 print:pb-2 print:mb-3">
          <div>
            <h1 className="text-5xl print:text-3xl font-black tracking-tighter text-slate-900 mb-2 print:mb-0 leading-none">TechPharmacy</h1>
            <p className="text-sm print:text-[10px] font-bold text-slate-500">NIT: 900.123.456-7 | Régimen Común</p>
            <p className="text-sm print:text-[10px] font-bold text-slate-500">Sede Principal: Calle 123 # 45-67, Bogotá</p>
            <p className="text-sm print:text-[10px] font-bold text-slate-500">Tel: (601) 555-0123</p>
          </div>
          <div className="text-right">
            <h2 className="text-4xl print:text-2xl font-black text-indigo-600 tracking-tighter leading-none">FACTURA</h2>
            <div className="inline-block bg-slate-900 text-white px-4 py-1.5 print:py-0.5 rounded-lg mt-2 mb-4 print:mt-1 print:mb-2">
              <span className="font-black text-lg print:text-sm">N° {factura.numero}</span>
            </div>
            <p className="text-sm print:text-[10px] font-black text-slate-900">Fecha: <span className="font-bold text-slate-600">{new Date(factura.created_at).toLocaleDateString()}</span></p>
            <p className="text-sm print:text-[10px] font-black text-slate-900">Vendedor: <span className="font-bold text-slate-600">{factura.vendedor?.full_name}</span></p>
          </div>
        </div>

        {/* Client & Conditions */}
        <div className="grid grid-cols-2 gap-8 mb-8 print:gap-2 print:mb-4">
          <div className="bg-slate-50 p-5 print:p-3 rounded-2xl border border-slate-200">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 print:mb-1">Datos del Cliente</h3>
            <p className="text-xl print:text-base font-black text-slate-900 uppercase">{factura.cliente_nombre}</p>
            <p className="text-sm print:text-[10px] font-bold text-slate-600 mt-1 print:mt-0">ID: <span className="font-black">{factura.cliente_documento}</span></p>
          </div>
          <div className="bg-slate-50 p-5 print:p-3 rounded-2xl border border-slate-200">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 print:mb-1">Condiciones</h3>
            <div className="grid grid-cols-2 gap-4 print:gap-x-4 print:gap-y-1">
              <div>
                <p className="text-[10px] print:text-[9px] font-bold text-slate-500 uppercase">Condición</p>
                <p className="text-sm print:text-[10px] font-black text-slate-900 uppercase">{factura.tipo_venta}</p>
              </div>
              <div>
                <p className="text-[10px] print:text-[9px] font-bold text-slate-500 uppercase">Método</p>
                <p className="text-sm print:text-[10px] font-black text-slate-900 uppercase">{factura.metodo_pago}</p>
              </div>
              {isCredito && (
                <>
                  <div>
                    <p className="text-[10px] print:text-[9px] font-bold text-slate-500 uppercase">Plazo</p>
                    <p className="text-sm print:text-[10px] font-black text-slate-900 uppercase">{factura.condicion_pago_dias} Días</p>
                  </div>
                  <div>
                    <p className="text-[10px] print:text-[9px] font-bold text-slate-500 uppercase">Vencimiento</p>
                    <p className="text-sm print:text-[10px] font-black text-slate-900 uppercase">{new Date(factura.fecha_vencimiento).toLocaleDateString()}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Products Table */}
        <div className="mb-8 print:mb-4 overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full text-left text-sm print:text-[10px] border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="px-4 py-3 print:py-2 text-[10px] print:text-[9px] font-black uppercase tracking-widest">Cant</th>
                <th className="px-4 py-3 print:py-2 text-[10px] print:text-[9px] font-black uppercase tracking-widest">Producto</th>
                <th className="px-4 py-3 print:py-2 text-[10px] print:text-[9px] font-black uppercase tracking-widest text-right">Base</th>
                {factura.descuento_porcentaje > 0 && (
                  <th className="px-4 py-3 print:py-2 text-[10px] print:text-[9px] font-black uppercase tracking-widest text-right">Dcto</th>
                )}
                <th className="px-4 py-3 print:py-2 text-[10px] print:text-[9px] font-black uppercase tracking-widest text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {lineasCalculadas.map((linea, idx) => (
                <tr key={idx} className="bg-white">
                  <td className="px-4 py-4 print:py-2 align-middle">
                    <div className="flex flex-wrap gap-1 font-black text-slate-900">
                      {linea.cantidad_cajas > 0 && <span>{linea.cantidad_cajas}C</span>}
                      {linea.cantidad_blisters > 0 && <span>{linea.cantidad_blisters}B</span>}
                      {linea.cantidad_unidades > 0 && <span>{linea.cantidad_unidades}U</span>}
                    </div>
                  </td>
                  <td className="px-4 py-4 print:py-2 align-middle">
                    <p className="font-black text-slate-900 uppercase leading-none">{linea.producto?.nombre}</p>
                    <p className="text-[10px] print:text-[8px] font-bold text-slate-400">Ref: {linea.producto?.codigo || 'N/A'}</p>
                  </td>
                  <td className="px-4 py-4 print:py-2 align-middle text-right font-bold text-slate-600">
                    ${linea.precioBaseRow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  {factura.descuento_porcentaje > 0 && (
                    <td className="px-4 py-4 print:py-2 align-middle text-right">
                      <p className="font-black text-rose-600">-${linea.descuentoRow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </td>
                  )}
                  <td className="px-4 py-4 print:py-2 align-middle text-right font-black text-indigo-900 text-base print:text-[11px]">
                    ${linea.subtotalConDescuento.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end mb-12 print:mb-4">
          <div className="w-72 print:w-64 flex flex-col gap-3 print:gap-1">
            <div className="flex justify-between items-center text-sm print:text-[10px] font-bold text-slate-600">
              <span>Total sin descuento</span>
              <span>${totalSinDescuentoCalculado.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            
            {factura.descuento_porcentaje > 0 && (
              <div className="flex justify-between items-center text-sm print:text-[10px] font-black text-rose-600 border-b border-rose-100 pb-2 print:pb-0.5">
                <span>Descuento Global (-{factura.descuento_porcentaje}%)</span>
                <span>-${totalDescuentoCalculado.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
            
            <div className="flex justify-between items-center text-sm print:text-[10px] font-bold text-slate-600">
              <span>Impuestos (IVA {factura.iva_porcentaje}%)</span>
              <span>+${Number(factura.iva_total).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            
            <div className="flex justify-between items-end border-t-4 border-slate-900 pt-4 mt-2 print:pt-2 print:mt-1">
              <span className="text-sm print:text-xs font-black uppercase tracking-widest text-slate-900">TOTAL</span>
              <span className="text-3xl print:text-xl font-black tracking-tighter text-indigo-600">${totalFinalCalculado.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 pt-8 print:pt-4 text-center flex flex-col items-center">
          {isCredito && factura.descuento_porcentaje > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 print:p-2.5 text-center w-full max-w-2xl mb-8 print:mb-4">
              <h4 className="text-amber-800 font-black text-xs print:text-[10px] uppercase mb-1 tracking-widest leading-none">⚠️ Condición de Pronto Pago</h4>
              <p className="text-amber-700 text-xs print:text-[10px] font-medium leading-tight">
                Si paga antes o el mismo <span className="font-black text-amber-900">{new Date(factura.fecha_vencimiento).toLocaleDateString()}</span>, aplica su descuento del <span className="font-black text-amber-900">{factura.descuento_porcentaje}%</span> y solo paga <span className="font-black text-indigo-700">${totalFinalCalculado.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>.<br/>
                De lo contrario, el total será <span className="font-black text-rose-600">${totalSinDescuentoCalculado.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>.
              </p>
            </div>
          )}

          <p className="text-[10px] print:text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 print:mb-0.5">¡Gracias por su compra!</p>
          <p className="text-xs print:text-[10px] font-medium text-slate-500">Esta factura es un título valor según la ley colombiana.</p>
          <p className="text-[9px] print:text-[8px] font-bold text-slate-400 mt-4 print:mt-1">Impreso por Sistema POS TechPharmacy</p>
        </div>
        
      </div>
    </div>
  )
}
