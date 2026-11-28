'use client'

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatCurrency } from '@/lib/utils'

export interface ConfirmacionPendiente {
  titulo: string
  descripcion?: string
  /** Si se indica, se muestra en grande para que el cajero lo verifique. */
  monto?: number
  textoConfirmar?: string
  peligro?: boolean
  onConfirmar: () => void | Promise<void>
}

/**
 * Confirmación con el estilo de la app (reemplaza window.confirm). Enter confirma
 * y Esc cancela, igual que la ventana del navegador.
 */
export function ConfirmarDialogo({
  confirmacion,
  cargando = false,
  onCerrar,
}: {
  confirmacion: ConfirmacionPendiente | null
  cargando?: boolean
  onCerrar: () => void
}) {
  return (
    <Dialog open={Boolean(confirmacion)} onOpenChange={(abierto) => { if (!abierto && !cargando) onCerrar() }}>
      <DialogContent className="sm:max-w-md">
        {confirmacion && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!cargando) void confirmacion.onConfirmar()
            }}
          >
            <DialogHeader>
              <DialogTitle className="text-xl font-black text-slate-900">{confirmacion.titulo}</DialogTitle>
              {confirmacion.descripcion && (
                <DialogDescription className="text-sm text-slate-600">{confirmacion.descripcion}</DialogDescription>
              )}
            </DialogHeader>

            {typeof confirmacion.monto === 'number' && (
              <p className="my-5 text-center text-4xl font-black tracking-tight text-slate-900">
                {formatCurrency(confirmacion.monto)}
              </p>
            )}

            <DialogFooter className="mt-4 gap-2 sm:gap-2">
              <button
                type="button"
                onClick={onCerrar}
                disabled={cargando}
                className="flex-1 rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                autoFocus
                disabled={cargando}
                className={`flex-1 rounded-xl px-4 py-3 text-sm font-black text-white disabled:opacity-50 ${
                  confirmacion.peligro ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                {cargando ? 'Procesando…' : confirmacion.textoConfirmar || 'Confirmar'}
              </button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
