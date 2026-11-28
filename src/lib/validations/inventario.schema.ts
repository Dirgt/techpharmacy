import './zod-es.ts'
import { z } from 'zod'

const OptionalUuid = z.union([z.string().uuid(), z.literal('')]).optional()
const OptionalText = (max: number) => z.string().trim().max(max).optional().nullable()
const NonNegativeInteger = z.number().int().min(0)
const Margin = z.number().finite().min(0).max(99.99)

export const UpsertInventarioSchema = z.object({
  id: OptionalUuid,
  producto_id: OptionalUuid,
  codigo: z.string().trim().min(1, 'El código es requerido').max(80),
  nombre: z.string().trim().min(1, 'El nombre es requerido').max(180),
  principio_activo: OptionalText(180),
  laboratorio_id: OptionalUuid,
  fecha_vencimiento: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')])
    .optional()
    .nullable(),

  cajas: NonNegativeInteger.default(0),
  blisters: NonNegativeInteger.default(0),
  unidades: NonNegativeInteger.default(0),

  blisters_por_caja: z.number().int().min(1).default(1),
  unidades_por_blister: z.number().int().min(1).default(1),

  precio_caja: z.number().finite().min(0).max(999_999_999_999).default(0),
  precio_blister: z.number().finite().min(0).max(999_999_999_999).default(0),
  precio_unidad: z.number().finite().min(0).max(999_999_999_999).default(0),

  porcentaje_ganancia: Margin.default(0),
  margen_blister: Margin.default(0),
  margen_unidad: Margin.default(0),
  iva_porcentaje: z.union([z.literal(0), z.literal(5), z.literal(19)]).default(0),

  lote: OptionalText(100),
  registro_invima: OptionalText(120),
  seccion: OptionalText(100),
  ubicacion: OptionalText(180),
  stock_minimo: NonNegativeInteger.default(2),
  requiere_formula: z.boolean().optional().default(false),
})

export type UpsertInventarioInput = z.infer<typeof UpsertInventarioSchema>
