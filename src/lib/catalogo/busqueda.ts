/**
 * Búsqueda del POS en el catálogo local: sin tildes, sin mayúsculas y por
 * palabras ("acet 500 genfar" encuentra "ACETAMINOFÉN 500 MG · GENFAR").
 * Funciones puras: las usa el navegador y las pruebas de node:test.
 */

/** Minúsculas, sin tildes ni diéresis y con espacios simples. */
export function normalizarTexto(valor: string | null | undefined): string {
  return (valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Clave de búsqueda precalculada por producto (los campos se separan para no mezclarse). */
export function claveBusqueda(campos: ReadonlyArray<string | null | undefined>): string {
  return campos.map(normalizarTexto).join('\u0001')
}

/** Solo dígitos y 6 o más: es un código de barras escaneado o digitado. */
export function esCodigoDeBarras(termino: string): boolean {
  return /^\d{6,}$/.test(termino.trim())
}

/**
 * Productos que contienen todas las palabras del término, en este orden:
 * código exacto, nombre que empieza por la primera palabra y el resto
 * (cada grupo conserva el orden del catálogo, que es alfabético).
 */
export function buscarEnCatalogo<T extends { busqueda: string; codigo: string; nombre_producto: string }>(
  filas: readonly T[],
  termino: string,
  limite = 10
): T[] {
  const normal = normalizarTexto(termino)
  if (!normal) return []
  const palabras = normal.split(' ')

  const exactos: T[] = []
  const porNombre: T[] = []
  const otros: T[] = []
  for (const fila of filas) {
    if (!palabras.every((p) => fila.busqueda.includes(p))) continue
    if (normalizarTexto(fila.codigo) === normal) exactos.push(fila)
    else if (normalizarTexto(fila.nombre_producto).startsWith(palabras[0])) porNombre.push(fila)
    else otros.push(fila)
  }
  return [...exactos, ...porNombre, ...otros].slice(0, limite)
}
