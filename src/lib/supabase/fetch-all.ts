import type { PostgrestError } from '@supabase/supabase-js'

/**
 * Supabase (PostgREST) devuelve como máximo 1.000 filas por consulta.
 * Este helper pide páginas consecutivas para no perder filas en silencio
 * cuando una droguería supera ese tamaño. La consulta debe tener un orden
 * total (incluir una columna única al final del ORDER BY) para que las
 * páginas no se solapen.
 */
export async function fetchAllPages<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  options: { pageSize?: number; maxRows?: number } = {}
): Promise<{ data: T[]; error: PostgrestError | null; truncated: boolean }> {
  const pageSize = options.pageSize ?? 1000
  const maxRows = options.maxRows ?? 20000
  const rows: T[] = []

  for (let from = 0; from < maxRows; from += pageSize) {
    const to = Math.min(from + pageSize, maxRows) - 1
    const { data, error } = await buildPage(from, to)
    if (error) return { data: rows, error, truncated: false }
    const page = data ?? []
    rows.push(...page)
    if (page.length < to - from + 1) return { data: rows, error: null, truncated: false }
  }

  return { data: rows, error: null, truncated: true }
}
