type DbErrorLike = { code?: string | null; message?: string | null } | null | undefined

/**
 * Devuelve un mensaje apto para el usuario a partir de un error de Supabase.
 * Solo se muestran tal cual los mensajes de negocio lanzados con RAISE EXCEPTION
 * (código P0001), que están escritos en español para el usuario final. El resto
 * de errores (restricciones, permisos, red) se reemplazan por un texto genérico
 * para no exponer detalles internos de la base de datos.
 */
export function mensajeErrorBD(error: DbErrorLike, fallback: string): string {
  if (!error) return fallback
  if (error.code === 'P0001' && error.message) return error.message
  if (error.code === '23505') return 'Ya existe un registro con esos mismos datos.'
  if (error.code === '42501') return 'No tienes permisos para realizar esta operación.'
  return fallback
}

/** Primer mensaje legible de una validación Zod. */
export function primerErrorZod(
  issues: ReadonlyArray<{ message: string }> | undefined,
  fallback = 'Los datos enviados no son válidos.'
): string {
  return issues?.[0]?.message || fallback
}
