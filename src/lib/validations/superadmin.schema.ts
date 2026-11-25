import { z } from 'zod'
import { API_SCOPES } from '../api/api-key-utils.ts'

export const DrogueriaSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre de la droguería es obligatorio'),
  subdominio: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, 'El subdominio es obligatorio')
    .regex(/^[a-z0-9-]+$/, 'El subdominio solo admite letras minúsculas, números y guiones'),
  url_personalizada: z
    .string()
    .trim()
    .url('Debe ser una URL válida (ej. https://midrogueria.com)')
    .nullable()
    .optional()
    .or(z.literal('')),
  nit: z.string().trim().nullable().optional(),
  direccion: z.string().trim().nullable().optional(),
  telefono: z.string().trim().nullable().optional(),
  regimen: z.string().trim().nullable().optional(),
  plan: z.enum(['basico', 'pro', 'enterprise']).default('basico'),
  estado: z.enum(['activo', 'prueba', 'suspendido']).default('activo'),
  max_usuarios: z.coerce
    .number()
    .int('Debe ser un número entero')
    .min(1, 'Mínimo 1 usuario')
    .max(1000, 'Máximo 1000 usuarios')
    .default(5),
  fecha_vencimiento: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)')
    .nullable()
    .optional()
    .or(z.literal('')),
  motivo_suspension: z
    .string()
    .trim()
    .max(300, 'Máximo 300 caracteres')
    .nullable()
    .optional()
    .or(z.literal('')),
})

export type DrogueriaInput = z.infer<typeof DrogueriaSchema>

export const ToggleDrogueriaStatusSchema = z.object({
  drogueria_id: z.string().uuid('Droguería inválida'),
  estado: z.enum(['activo', 'prueba', 'suspendido']),
  motivo_suspension: z
    .string()
    .trim()
    .max(300, 'Máximo 300 caracteres')
    .nullable()
    .optional()
    .or(z.literal('')),
})

export type ToggleDrogueriaStatusInput = z.infer<typeof ToggleDrogueriaStatusSchema>

export const CreateTenantUserSchema = z
  .object({
    email: z.string().trim().email('Correo electrónico inválido'),
    password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
    full_name: z.string().trim().min(2, 'El nombre completo es obligatorio'),
    username: z.string().trim().min(2, 'El usuario es obligatorio'),
    role: z.enum(['superadmin', 'admin', 'vendedor']),
    drogueria_id: z.string().uuid('Droguería inválida').nullable().optional(),
  })
  .refine((data) => data.role === 'superadmin' || Boolean(data.drogueria_id), {
    message: 'Debes asignar una droguería para los roles admin o vendedor',
    path: ['drogueria_id'],
  })

export type CreateTenantUserInput = z.infer<typeof CreateTenantUserSchema>

export const AssignUserSchema = z
  .object({
    user_id: z.string().uuid('Usuario inválido'),
    drogueria_id: z.string().uuid('Droguería inválida').nullable().optional(),
    role: z.enum(['superadmin', 'admin', 'vendedor']),
    status: z.enum(['activo', 'inactivo']),
  })
  .refine((data) => data.role === 'superadmin' || Boolean(data.drogueria_id), {
    message: 'Debes asignar una droguería para los roles admin o vendedor',
    path: ['drogueria_id'],
  })

export type AssignUserInput = z.infer<typeof AssignUserSchema>

export const CreateApiKeySchema = z.object({
  drogueria_id: z.string().uuid('Droguería inválida'),
  nombre: z
    .string()
    .trim()
    .min(2, 'El nombre identificador es obligatorio')
    .max(100, 'Máximo 100 caracteres'),
  scopes: z.array(z.enum(API_SCOPES)).min(1, 'Debes seleccionar al menos un permiso'),
  expires_at: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (YYYY-MM-DD)')
    .nullable()
    .optional()
    .or(z.literal('')),
})

export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>
