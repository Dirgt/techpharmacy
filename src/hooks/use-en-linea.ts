'use client'

import { useSyncExternalStore } from 'react'

function suscribir(aviso: () => void) {
  window.addEventListener('online', aviso)
  window.addEventListener('offline', aviso)
  return () => {
    window.removeEventListener('online', aviso)
    window.removeEventListener('offline', aviso)
  }
}

/** true si el navegador tiene conexión de red (en el servidor se asume que sí). */
export function useEnLinea(): boolean {
  return useSyncExternalStore(
    suscribir,
    () => navigator.onLine,
    () => true
  )
}
