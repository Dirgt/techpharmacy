import { z } from 'zod'

export const UpsertInventarioSchema = z.object({
  id: z.string().optional(),
  producto_id: z.string().optional(),
  codigo: z.string().min(1, 'El código es requerido'),
  nombre: z.string().min(1, 'El nombre es requerido'),
  principio_activo: z.string().optional(),
  laboratorio_id: z.string().optional(),
  fecha_vencimiento: z.string().optional().nullable(),
  
  cajas: z.number().min(0).default(0),
  blisters: z.number().min(0).default(0),
  unidades: z.number().min(0).default(0),
  
  precio_caja: z.number().min(0).default(0),
  precio_blister: z.number().min(0).default(0),
  precio_unidad: z.number().min(0).default(0),
  
  porcentaje_ganancia: z.number().min(0).default(0),
  margen_blister: z.number().min(0).default(0),
  margen_unidad: z.number().min(0).default(0),
  
  lote: z.string().optional().nullable(),
  registro_invima: z.string().optional().nullable(),
  seccion: z.string().optional().nullable(),
  ubicacion: z.string().optional().nullable(),
  stock_minimo: z.number().min(0).default(2)
})

export type UpsertInventarioInput = z.infer<typeof UpsertInventarioSchema>
