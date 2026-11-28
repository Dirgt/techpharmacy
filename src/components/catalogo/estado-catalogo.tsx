'use client'

import { CloudOff, RefreshCw } from 'lucide-react'
import type { CatalogoHook } from '@/lib/catalogo/use-catalogo'

const horaCorta = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  hour: 'numeric',
  minute: '2-digit',
})

/** Indicador compacto del catálogo local con botón para actualizar a mano. */
export function EstadoCatalogo({ catalogo, className = '' }: { catalogo: CatalogoHook; className?: string }) {
  const { listo, sincronizando, error, ultimaSync, items } = catalogo

  const texto = !listo
    ? sincronizando
      ? 'Descargando catálogo…'
      : error || 'Catálogo sin cargar'
    : sincronizando
      ? 'Actualizando catálogo…'
      : error
        ? error
        : ultimaSync
          ? `Catálogo al día · ${horaCorta.format(ultimaSync)}`
          : 'Catálogo (copia local)'

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[11px] font-bold ${
        error ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-100 bg-white text-slate-500'
      } ${className}`}
      title={listo ? `${items.size.toLocaleString('es-CO')} productos guardados en este equipo` : undefined}
    >
      {error && <CloudOff className="h-3.5 w-3.5 shrink-0" />}
      <span className="truncate max-w-[260px]">{texto}</span>
      <button
        type="button"
        onClick={() => void catalogo.sincronizar()}
        disabled={sincronizando}
        className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
        aria-label="Actualizar catálogo"
        title="Actualizar catálogo"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${sincronizando ? 'animate-spin' : ''}`} />
      </button>
    </div>
  )
}
