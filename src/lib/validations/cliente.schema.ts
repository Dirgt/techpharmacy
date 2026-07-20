import { z } from 'zod'

export const CrearClienteSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido'),
  documento: z.string().optional().nullable(),
  tipo_doc: z.string().optional().nullable(),
  tipo_cliente: z.string().optional().nullable(),
  telefono: z.string().optional().nullable(),
  email: z.string().email('Debe ser un email válido').optional().nullable().or(z.literal('')),
  direccion: z.string().optional().nullable(),
  ciudad: z.string().optional().nullable()
})

export type CrearClienteInput = z.infer<typeof CrearClienteSchema>
