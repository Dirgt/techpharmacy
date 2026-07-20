import { z } from 'zod'

export const ProveedorSchema = z.object({
  id: z.string().uuid().optional(),
  nombre: z.string().min(2, 'El nombre es obligatorio'),
  documento_nit: z.string().nullable().optional(),
  telefono: z.string().nullable().optional(),
  email: z.string().email('Email inválido').nullable().optional().or(z.literal('')),
  dias_credito: z.number().int().min(0).default(0)
})

export type ProveedorInput = z.infer<typeof ProveedorSchema>

export const GastoSchema = z.object({
  caja_sesion_id: z.string().uuid('ID de sesión de caja inválido'),
  concepto: z.string().min(3, 'El concepto debe ser descriptivo'),
  monto: z.number().min(0.01, 'El monto debe ser mayor a cero'),
  tipo: z.enum(['caja_chica', 'operativo', 'nomina']).default('operativo'),
  comprobante: z.string().nullable().optional()
})

export type GastoInput = z.infer<typeof GastoSchema>

export const CompraDetalleSchema = z.object({
  producto_id: z.string().uuid(),
  cantidad: z.number().int().min(1, 'La cantidad debe ser al menos 1'),
  costo_unitario: z.number().min(0, 'El costo no puede ser negativo')
})

export const CompraSchema = z.object({
  proveedor_id: z.string().uuid('Proveedor obligatorio'),
  numero_factura: z.string().min(1, 'Número de factura obligatorio'),
  total: z.number().min(0),
  estado_pago: z.enum(['pagado', 'pendiente', 'credito']),
  metodo_pago: z.enum(['efectivo', 'transferencia', 'tarjeta']).nullable().optional(),
  caja_sesion_id: z.string().uuid().nullable().optional(),
  detalles: z.array(CompraDetalleSchema).min(1, 'La compra debe tener al menos un producto')
})

export type CompraInput = z.infer<typeof CompraSchema>
