/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState } from 'react'
import { Printer, MessageCircle, ReceiptText, FileText } from 'lucide-react'

type DrogueriaInfo = {
  id: string
  nombre: string
  nit: string | null
  direccion: string | null
  telefono: string | null
  regimen: string | null
  mensaje_pie_factura?: string | null
  prefijo_factura?: string | null
  resolucion_dian?: string | null
} | null

type PrintFormat = '80mm' | '58mm' | 'carta'

const safeNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const formatCop = (value: unknown) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safeNumber(value))

const parseLocalDate = (value: unknown) => {
  if (!value) return null
  const raw = String(value)
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00` : raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const formatDate = (value: unknown) => {
  const parsed = parseLocalDate(value)
  return parsed ? parsed.toLocaleDateString('es-CO') : '—'
}

const formatDateTime = (value: unknown) => {
  const parsed = parseLocalDate(value)
  return parsed ? parsed.toLocaleString('es-CO') : '—'
}

export default function PrintClient({
  factura,
  detalles,
  drogueria,
}: {
  factura: any
  detalles: any[]
  drogueria?: DrogueriaInfo
}) {
  const [format, setFormat] = useState<PrintFormat>('80mm')
  const [whatsappPhone, setWhatsappPhone] = useState('')

  const handlePrint = () => {
    window.print()
  }

  const isCredito = factura.tipo_venta === 'credito'
  const isThermal = format === '80mm' || format === '58mm'
  const numeroFormateado = drogueria?.prefijo_factura
    ? `${drogueria.prefijo_factura}-${factura.numero}`
    : `${factura.numero}`
  const isMixto = factura.metodo_pago === 'mixto'
  const pagoEf = safeNumber(factura.pago_efectivo)
  const pagoTj = safeNumber(factura.pago_tarjeta)
  const pagoTr = safeNumber(factura.pago_transferencia)
  const mixtoTexto = isMixto
    ? [
        pagoEf > 0 ? `Efec: ${formatCop(pagoEf)}` : '',
        pagoTr > 0 ? `Transf: ${formatCop(pagoTr)}` : '',
        pagoTj > 0 ? `Tarj: ${formatCop(pagoTj)}` : '',
      ]
        .filter(Boolean)
        .join(' | ')
    : ''

  const lineasCalculadas = detalles.map((detalle) => {
    const subtotalConDescuento = safeNumber(detalle.precio_unitario)
    const precioBaseRow = safeNumber(
      detalle.precio_linea_original ?? detalle.precio_unitario_base ?? subtotalConDescuento
    )
    const descuentoRow = safeNumber(
      detalle.descuento_monto ?? Math.max(0, precioBaseRow - subtotalConDescuento)
    )

    return {
      ...detalle,
      precioBaseRow,
      descuentoRow,
      subtotalConDescuento,
    }
  })

  const totalSinDescuentoCalculado = safeNumber(factura.subtotal_bruto)
  const totalDescuentoCalculado = safeNumber(factura.descuento_monto)
  const ivaCalculado = safeNumber(factura.iva_total)
  const totalFinalCalculado = safeNumber(factura.total)
  // Total sin el descuento de pronto pago: el IVA también se calcula sobre la base sin descuento.
  const baseConDescuento = totalSinDescuentoCalculado - totalDescuentoCalculado
  const ivaSinDescuento =
    baseConDescuento > 0
      ? Math.round((ivaCalculado * totalSinDescuentoCalculado) / baseConDescuento)
      : ivaCalculado
  const totalSinDescuentoConIva = totalSinDescuentoCalculado + ivaSinDescuento
  const ivaPorcentaje = safeNumber(factura.iva_porcentaje)
  const ivaLabel = ivaCalculado > 0 && ivaPorcentaje === 0
    ? 'IVA por producto'
    : `IVA (${ivaPorcentaje}%)`

  const handleSendWhatsApp = () => {
    const drogueriaNombre = drogueria?.nombre || 'TechPharmacy'
    const itemsTexto = lineasCalculadas
      .map((l) => {
        const cant = [
          l.cantidad_cajas > 0 ? `${l.cantidad_cajas}C` : '',
          l.cantidad_blisters > 0 ? `${l.cantidad_blisters}B` : '',
          l.cantidad_unidades > 0 ? `${l.cantidad_unidades}U` : '',
        ]
          .filter(Boolean)
          .join(' ')
        return `- ${cant} ${l.producto?.nombre || 'Producto'}: ${formatCop(l.subtotalConDescuento)}`
      })
      .join('\n')

    const lines = [
      `*${drogueriaNombre}*`,
      drogueria?.nit ? `NIT: ${drogueria.nit}` : '',
      `Comprobante *${drogueria?.prefijo_factura ? numeroFormateado : `#${numeroFormateado}`}*`,
      `Fecha: ${formatDateTime(factura.created_at)}`,
      `Cliente: ${factura.cliente_nombre || 'Consumidor Final'}`,
      `Condición: ${String(factura.tipo_venta || 'contado').toUpperCase()} (${isMixto ? `MIXTO: ${mixtoTexto}` : factura.metodo_pago || 'efectivo'})`,
      '',
      '*Detalle:*',
      itemsTexto,
      '',
      factura.descuento_porcentaje > 0
        ? `Descuento (${factura.descuento_porcentaje}%): -${formatCop(totalDescuentoCalculado)}`
        : '',
      safeNumber(factura.iva_total) > 0
        ? `${ivaLabel}: ${formatCop(ivaCalculado)}`
        : '',
      `*TOTAL: ${formatCop(totalFinalCalculado)}*`,
      '',
      drogueria?.mensaje_pie_factura || '¡Gracias por su compra!',
    ]
      .filter((line, idx, arr) => line !== '' || (idx > 0 && arr[idx - 1] !== ''))
      .join('\n')

    const digits = whatsappPhone.replace(/\D/g, '')
    const phoneWithCode =
      digits.length === 10 && digits.startsWith('3') ? `57${digits}` : digits
    const url = phoneWithCode
      ? `https://wa.me/${phoneWithCode}?text=${encodeURIComponent(lines)}`
      : `https://wa.me/?text=${encodeURIComponent(lines)}`

    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const pageSizeCss =
    format === '58mm'
      ? '58mm auto'
      : format === '80mm'
        ? '80mm auto'
        : 'letter'

  const containerWidthClass =
    format === '58mm'
      ? 'max-w-[230px] print:w-[58mm] print:max-w-[58mm]'
      : format === '80mm'
        ? 'max-w-[330px] print:w-[80mm] print:max-w-[80mm]'
        : 'max-w-4xl print:w-full print:max-w-[215mm]'

  return (
    <div className="w-full flex flex-col items-center gap-4">
      <style jsx global>{`
        @media print {
          @page {
            margin: ${isThermal ? '2mm' : '5mm 10mm'};
            size: ${pageSizeCss};
          }
          body {
            background: white !important;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>

      {/* Non-printable action bar */}
      <div className="w-full max-w-4xl bg-slate-900 px-5 py-4 flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4 print:hidden rounded-2xl shadow-xl">
        <div>
          <h2 className="text-white font-black text-lg">
            Comprobante interno de venta {drogueria?.prefijo_factura ? numeroFormateado : `#${numeroFormateado}`}
          </h2>
          <p className="text-slate-400 text-xs font-bold">
            Elige formato tirilla POS o carta, o envía el recibo por WhatsApp
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-slate-800 p-1 border border-slate-700">
            <button
              type="button"
              onClick={() => setFormat('80mm')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-colors ${
                format === '80mm'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <ReceiptText className="w-3.5 h-3.5" />
              80mm
            </button>
            <button
              type="button"
              onClick={() => setFormat('58mm')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-colors ${
                format === '58mm'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <ReceiptText className="w-3.5 h-3.5" />
              58mm
            </button>
            <button
              type="button"
              onClick={() => setFormat('carta')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition-colors ${
                format === 'carta'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Carta
            </button>
          </div>

          <input
            type="tel"
            value={whatsappPhone}
            onChange={(e) => setWhatsappPhone(e.target.value)}
            placeholder="Celular WhatsApp (opcional)"
            className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-semibold text-white placeholder:text-slate-400 outline-none focus:border-emerald-500 w-48"
          />

          <button
            type="button"
            onClick={handleSendWhatsApp}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl font-black text-xs flex items-center gap-1.5 transition-all"
          >
            <MessageCircle className="w-4 h-4" />
            WhatsApp
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl font-black text-xs flex items-center gap-1.5 transition-all shadow-lg shadow-indigo-600/20"
          >
            <Printer className="w-4 h-4" />
            IMPRIMIR
          </button>
        </div>
      </div>

      {/* Printable Invoice Body */}
      <div
        className={`w-full mx-auto bg-white shadow-2xl print:shadow-none rounded-2xl print:rounded-none overflow-hidden flex flex-col relative ${containerWidthClass}`}
      >
        {isThermal ? (
          <div
            className={`${
              format === '58mm' ? 'p-3 text-[10px]' : 'p-4 text-[11px]'
            } bg-white text-slate-900 font-mono leading-snug`}
          >
            <div className="text-center border-b border-dashed border-slate-400 pb-2 mb-2">
              <h1 className="text-sm font-black uppercase tracking-tight">
                {drogueria?.nombre || 'TechPharmacy'}
              </h1>
              {drogueria?.nit && <p className="text-[10px] font-bold">NIT: {drogueria.nit}</p>}
              {drogueria?.regimen && <p className="text-[9px]">{drogueria.regimen}</p>}
              {drogueria?.direccion && <p className="text-[9px]">{drogueria.direccion}</p>}
              {drogueria?.telefono && <p className="text-[9px]">Tel: {drogueria.telefono}</p>}
            </div>

            <div className="border-b border-dashed border-slate-400 pb-2 mb-2 space-y-0.5 text-[10px]">
              <div className="flex justify-between font-black">
                <span>COMPROBANTE INTERNO DE VENTA</span>
                <span>N° {numeroFormateado}</span>
              </div>
              {drogueria?.resolucion_dian && (
                <p className="text-[8px] leading-tight text-slate-600">
                  {drogueria.resolucion_dian}
                </p>
              )}
              <p>Fecha: {formatDateTime(factura.created_at)}</p>
              <p>Vendedor: {factura.vendedor?.full_name || 'Mostrador'}</p>
              <p className="truncate">Cliente: {factura.cliente_nombre}</p>
              {factura.cliente_documento && <p>Doc: {factura.cliente_documento}</p>}
              <p className="uppercase">
                Pago: {factura.tipo_venta} / {factura.metodo_pago}
              </p>
              {isMixto && mixtoTexto && (
                <p className="text-[9px] font-bold">Desglose: {mixtoTexto}</p>
              )}
              {isCredito && factura.fecha_vencimiento && (
                <p>Vence: {formatDate(factura.fecha_vencimiento)}</p>
              )}
            </div>

            <div className="border-b border-dashed border-slate-400 pb-2 mb-2">
              <div className="flex justify-between font-black text-[9px] uppercase border-b border-slate-300 pb-1 mb-1">
                <span>Cant / Descripción</span>
                <span>Valor</span>
              </div>
              <div className="space-y-1.5">
                {lineasCalculadas.map((linea, idx) => (
                  <div key={idx}>
                    <p className="font-bold uppercase leading-tight">{linea.producto?.nombre}</p>
                    <div className="flex justify-between text-[10px]">
                      <span>
                        {[
                          linea.cantidad_cajas > 0 ? `${linea.cantidad_cajas}C` : '',
                          linea.cantidad_blisters > 0 ? `${linea.cantidad_blisters}B` : '',
                          linea.cantidad_unidades > 0 ? `${linea.cantidad_unidades}U` : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      </span>
                      <span className="font-black">
                        {formatCop(linea.subtotalConDescuento)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-0.5 border-b border-dashed border-slate-400 pb-2 mb-2 text-[10px]">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatCop(totalSinDescuentoCalculado)}</span>
              </div>
              {factura.descuento_porcentaje > 0 && (
                <div className="flex justify-between font-bold">
                  <span>Dcto (-{factura.descuento_porcentaje}%)</span>
                  <span>-{formatCop(totalDescuentoCalculado)}</span>
                </div>
              )}
              {ivaCalculado > 0 && (
                <div className="flex justify-between">
                  <span>{ivaLabel}</span>
                  <span>+{formatCop(ivaCalculado)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-black pt-1 border-t border-slate-400">
                <span>TOTAL</span>
                <span>{formatCop(totalFinalCalculado)}</span>
              </div>
            </div>

            <div className="text-center space-y-1 text-[9px]">
              {drogueria?.mensaje_pie_factura && (
                <p className="font-bold">{drogueria.mensaje_pie_factura}</p>
              )}
              <p className="font-black uppercase">¡Gracias por su compra!</p>
              <p className="text-[8px] text-slate-500">
                Documento interno — no válido como factura electrónica ni documento equivalente electrónico.
              </p>
              <p className="text-slate-500">Sistema {drogueria?.nombre || 'TechPharmacy'}</p>
            </div>
          </div>
        ) : (
          <div className="p-10 print:p-4 bg-white text-slate-900 w-full font-sans print:text-[11px]">
            {/* Header */}
            <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6 mb-6 print:pb-2 print:mb-3">
              <div>
                <h1 className="text-5xl print:text-3xl font-black tracking-tighter text-slate-900 mb-2 print:mb-0 leading-none">
                  {drogueria?.nombre || 'TechPharmacy'}
                </h1>
                {(drogueria?.nit || drogueria?.regimen) && (
                  <p className="text-sm print:text-[10px] font-bold text-slate-500">
                    {[drogueria?.nit ? `NIT: ${drogueria.nit}` : null, drogueria?.regimen]
                      .filter(Boolean)
                      .join(' | ')}
                  </p>
                )}
                {drogueria?.direccion && (
                  <p className="text-sm print:text-[10px] font-bold text-slate-500">
                    {drogueria.direccion}
                  </p>
                )}
                {drogueria?.telefono && (
                  <p className="text-sm print:text-[10px] font-bold text-slate-500">
                    Tel: {drogueria.telefono}
                  </p>
                )}
              </div>
              <div className="text-right">
                <h2 className="text-4xl print:text-2xl font-black text-indigo-600 tracking-tighter leading-none">
                  COMPROBANTE INTERNO DE VENTA
                </h2>
                <div className="inline-block bg-slate-900 text-white px-4 py-1.5 print:py-0.5 rounded-lg mt-2 mb-4 print:mt-1 print:mb-2">
                  <span className="font-black text-lg print:text-sm">N° {numeroFormateado}</span>
                </div>
                {drogueria?.resolucion_dian && (
                  <p className="text-[10px] print:text-[8px] font-semibold text-slate-500 max-w-xs ml-auto mb-1">
                    {drogueria.resolucion_dian}
                  </p>
                )}
                <p className="text-sm print:text-[10px] font-black text-slate-900">
                  Fecha:{' '}
                  <span className="font-bold text-slate-600">
                    {formatDate(factura.created_at)}
                  </span>
                </p>
                <p className="text-sm print:text-[10px] font-black text-slate-900">
                  Vendedor:{' '}
                  <span className="font-bold text-slate-600">{factura.vendedor?.full_name}</span>
                </p>
              </div>
            </div>

            {/* Client & Conditions */}
            <div className="grid grid-cols-2 gap-8 mb-8 print:gap-2 print:mb-4">
              <div className="bg-slate-50 p-5 print:p-3 rounded-2xl border border-slate-200">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 print:mb-1">
                  Datos del Cliente
                </h3>
                <p className="text-xl print:text-base font-black text-slate-900 uppercase">
                  {factura.cliente_nombre}
                </p>
                <p className="text-sm print:text-[10px] font-bold text-slate-600 mt-1 print:mt-0">
                  ID: <span className="font-black">{factura.cliente_documento}</span>
                </p>
              </div>
              <div className="bg-slate-50 p-5 print:p-3 rounded-2xl border border-slate-200">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 print:mb-1">
                  Condiciones
                </h3>
                <div className="grid grid-cols-2 gap-4 print:gap-x-4 print:gap-y-1">
                  <div>
                    <p className="text-[10px] print:text-[9px] font-bold text-slate-500 uppercase">
                      Condición
                    </p>
                    <p className="text-sm print:text-[10px] font-black text-slate-900 uppercase">
                      {factura.tipo_venta}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] print:text-[9px] font-bold text-slate-500 uppercase">
                      Método
                    </p>
                    <p className="text-sm print:text-[10px] font-black text-slate-900 uppercase">
                      {factura.metodo_pago}
                    </p>
                    {isMixto && mixtoTexto && (
                      <p className="text-[10px] print:text-[8px] font-bold text-slate-600">
                        {mixtoTexto}
                      </p>
                    )}
                  </div>
                  {isCredito && (
                    <>
                      <div>
                        <p className="text-[10px] print:text-[9px] font-bold text-slate-500 uppercase">
                          Plazo
                        </p>
                        <p className="text-sm print:text-[10px] font-black text-slate-900 uppercase">
                          {factura.condicion_pago_dias} Días
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] print:text-[9px] font-bold text-slate-500 uppercase">
                          Vencimiento
                        </p>
                        <p className="text-sm print:text-[10px] font-black text-slate-900 uppercase">
                          {formatDate(factura.fecha_vencimiento)}
                        </p>
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
                    <th className="px-4 py-3 print:py-2 text-[10px] print:text-[9px] font-black uppercase tracking-widest">
                      Cant
                    </th>
                    <th className="px-4 py-3 print:py-2 text-[10px] print:text-[9px] font-black uppercase tracking-widest">
                      Producto
                    </th>
                    <th className="px-4 py-3 print:py-2 text-[10px] print:text-[9px] font-black uppercase tracking-widest text-right">
                      Base
                    </th>
                    {factura.descuento_porcentaje > 0 && (
                      <th className="px-4 py-3 print:py-2 text-[10px] print:text-[9px] font-black uppercase tracking-widest text-right">
                        Dcto
                      </th>
                    )}
                    <th className="px-4 py-3 print:py-2 text-[10px] print:text-[9px] font-black uppercase tracking-widest text-right">
                      Subtotal
                    </th>
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
                        <p className="font-black text-slate-900 uppercase leading-none">
                          {linea.producto?.nombre}
                        </p>
                        <p className="text-[10px] print:text-[8px] font-bold text-slate-400">
                          Ref: {linea.producto?.codigo || 'N/A'}
                        </p>
                      </td>
                      <td className="px-4 py-4 print:py-2 align-middle text-right font-bold text-slate-600">
                        {formatCop(linea.precioBaseRow)}
                      </td>
                      {factura.descuento_porcentaje > 0 && (
                        <td className="px-4 py-4 print:py-2 align-middle text-right">
                          <p className="font-black text-rose-600">
                            -{formatCop(linea.descuentoRow)}
                          </p>
                        </td>
                      )}
                      <td className="px-4 py-4 print:py-2 align-middle text-right font-black text-indigo-900 text-base print:text-[11px]">
                        {formatCop(linea.subtotalConDescuento)}
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
                  <span>{formatCop(totalSinDescuentoCalculado)}</span>
                </div>

                {factura.descuento_porcentaje > 0 && (
                  <div className="flex justify-between items-center text-sm print:text-[10px] font-black text-rose-600 border-b border-rose-100 pb-2 print:pb-0.5">
                    <span>Descuento Global (-{factura.descuento_porcentaje}%)</span>
                    <span>-{formatCop(totalDescuentoCalculado)}</span>
                  </div>
                )}

                <div className="flex justify-between items-center text-sm print:text-[10px] font-bold text-slate-600">
                  <span>{ivaLabel}</span>
                  <span>+{formatCop(ivaCalculado)}</span>
                </div>

                <div className="flex justify-between items-end border-t-4 border-slate-900 pt-4 mt-2 print:pt-2 print:mt-1">
                  <span className="text-sm print:text-xs font-black uppercase tracking-widest text-slate-900">
                    TOTAL
                  </span>
                  <span className="text-3xl print:text-xl font-black tracking-tighter text-indigo-600">
                    {formatCop(totalFinalCalculado)}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-slate-200 pt-8 print:pt-4 text-center flex flex-col items-center">
              {isCredito && factura.descuento_porcentaje > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 print:p-2.5 text-center w-full max-w-2xl mb-8 print:mb-4">
                  <h4 className="text-amber-800 font-black text-xs print:text-[10px] uppercase mb-1 tracking-widest leading-none">
                    Condición de Pronto Pago
                  </h4>
                  <p className="text-amber-700 text-xs print:text-[10px] font-medium leading-tight">
                    Si paga antes o el mismo{' '}
                    <span className="font-black text-amber-900">
                      {formatDate(factura.fecha_vencimiento)}
                    </span>
                    , aplica su descuento del{' '}
                    <span className="font-black text-amber-900">
                      {factura.descuento_porcentaje}%
                    </span>{' '}
                    y solo paga{' '}
                    <span className="font-black text-indigo-700">
                      {formatCop(totalFinalCalculado)}
                    </span>
                    .<br />
                    De lo contrario, el total será{' '}
                    <span className="font-black text-rose-600">
                      {formatCop(totalSinDescuentoConIva)}
                    </span>
                    .
                  </p>
                </div>
              )}

              {drogueria?.mensaje_pie_factura && (
                <p className="text-xs print:text-[10px] font-bold text-slate-700 mb-2">
                  {drogueria.mensaje_pie_factura}
                </p>
              )}
              <p className="text-[10px] print:text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 print:mb-0.5">
                ¡Gracias por su compra!
              </p>
              <p className="text-xs print:text-[10px] font-medium text-slate-500">
                Documento interno — no válido como factura electrónica ni documento equivalente electrónico.
              </p>
              <p className="text-[9px] print:text-[8px] font-bold text-slate-400 mt-4 print:mt-1">
                Impreso por {drogueria?.nombre || 'TechPharmacy'} POS
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
