import { z } from 'zod'

// Mensajes de validación en español para todo el servidor (configuración global de Zod).
z.config(z.locales.es())

export {}
