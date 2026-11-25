export interface LoteStockInput {
  id?: string
  lote?: string | null
  fecha_vencimiento?: string | null
  cajas?: number | null
  blisters?: number | null
  unidades?: number | null
  costo_caja?: number | null
  created_at?: string | null
}

export interface NormalizedLoteStock {
  id?: string
  lote: string
  fecha_vencimiento: string | null
  cajas: number
  blisters: number
  unidades: number
  costo_caja: number | null
  created_at: string | null
  vencido: boolean
}

export interface SellableStockSummary {
  cajas: number
  blisters: number
  unidades: number
  cajas_fisicas: number
  blisters_fisicos: number
  unidades_fisicas: number
  tiene_stock_vencido: boolean
  todo_vencido: boolean
  lotes_ordenados: NormalizedLoteStock[]
}

export function getTodayLocalIsoDate(now: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(now)
}

export function isLotExpired(
  fechaVencimiento: string | null | undefined,
  todayIsoDate: string = getTodayLocalIsoDate()
): boolean {
  if (!fechaVencimiento) return false
  const normalized = fechaVencimiento.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return false
  return normalized < todayIsoDate
}

export function hasAnyUnits(l: { cajas?: number | null; blisters?: number | null; unidades?: number | null }): boolean {
  return (Number(l.cajas) || 0) > 0 || (Number(l.blisters) || 0) > 0 || (Number(l.unidades) || 0) > 0
}

export function computeSellableStockFromLots(
  lotes: LoteStockInput[] | null | undefined,
  fallbackItem?: {
    lote?: string | null
    fecha_vencimiento?: string | null
    cajas?: number | null
    blisters?: number | null
    unidades?: number | null
    precio_caja?: number | null
  } | null,
  todayIsoDate: string = getTodayLocalIsoDate()
): SellableStockSummary {
  const sourceLotes: LoteStockInput[] =
    lotes && lotes.length > 0
      ? lotes
      : fallbackItem
        ? [
            {
              lote: fallbackItem.lote || 'SIN-LOTE',
              fecha_vencimiento: fallbackItem.fecha_vencimiento || null,
              cajas: fallbackItem.cajas || 0,
              blisters: fallbackItem.blisters || 0,
              unidades: fallbackItem.unidades || 0,
              costo_caja: fallbackItem.precio_caja ?? null,
            },
          ]
        : []

  const normalized: NormalizedLoteStock[] = sourceLotes
    .filter((l) => hasAnyUnits(l))
    .map((l) => {
      const fv = l.fecha_vencimiento ? l.fecha_vencimiento.slice(0, 10) : null
      return {
        id: l.id,
        lote: (l.lote || '').trim() || 'SIN-LOTE',
        fecha_vencimiento: fv,
        cajas: Math.max(0, Math.floor(Number(l.cajas) || 0)),
        blisters: Math.max(0, Math.floor(Number(l.blisters) || 0)),
        unidades: Math.max(0, Math.floor(Number(l.unidades) || 0)),
        costo_caja: l.costo_caja !== undefined && l.costo_caja !== null ? Number(l.costo_caja) : null,
        created_at: l.created_at || null,
        vencido: isLotExpired(fv, todayIsoDate),
      }
    })
    .sort((a, b) => {
      if (a.vencido !== b.vencido) return a.vencido ? 1 : -1
      const fa = a.fecha_vencimiento || '9999-12-31'
      const fb = b.fecha_vencimiento || '9999-12-31'
      if (fa !== fb) return fa.localeCompare(fb)
      return (a.created_at || '').localeCompare(b.created_at || '')
    })

  let cajas = 0
  let blisters = 0
  let unidades = 0
  let cajas_fisicas = 0
  let blisters_fisicos = 0
  let unidades_fisicas = 0
  let tiene_stock_vencido = false

  for (const l of normalized) {
    cajas_fisicas += l.cajas
    blisters_fisicos += l.blisters
    unidades_fisicas += l.unidades
    if (l.vencido) {
      tiene_stock_vencido = true
    } else {
      cajas += l.cajas
      blisters += l.blisters
      unidades += l.unidades
    }
  }

  const todo_vencido =
    tiene_stock_vencido && cajas === 0 && blisters === 0 && unidades === 0

  return {
    cajas,
    blisters,
    unidades,
    cajas_fisicas,
    blisters_fisicos,
    unidades_fisicas,
    tiene_stock_vencido,
    todo_vencido,
    lotes_ordenados: normalized,
  }
}

export function canFulfillWithUnpacking(
  avail: { cajas: number; blisters: number; unidades: number },
  req: { cajas: number; blisters: number; unidades: number },
  blistersPorCaja: number,
  unidadesPorBlister: number
): boolean {
  const bpc = Math.max(1, Math.floor(blistersPorCaja || 1))
  const upb = Math.max(1, Math.floor(unidadesPorBlister || 1))

  const ac = Math.max(0, Math.floor(avail.cajas || 0))
  const ab = Math.max(0, Math.floor(avail.blisters || 0))
  const au = Math.max(0, Math.floor(avail.unidades || 0))

  const rc = Math.max(0, Math.floor(req.cajas || 0))
  const rb = Math.max(0, Math.floor(req.blisters || 0))
  const ru = Math.max(0, Math.floor(req.unidades || 0))

  if (rc > ac) return false

  const blistersDisponiblesParaBlisters = (ac - rc) * bpc + ab
  if (rb > blistersDisponiblesParaBlisters) return false

  const blistersRestantes = blistersDisponiblesParaBlisters - rb
  const unidadesDisponiblesTotales = blistersRestantes * upb + au
  return ru <= unidadesDisponiblesTotales
}

export function simulateUnpackingAndDeduct(
  avail: { cajas: number; blisters: number; unidades: number },
  req: { cajas: number; blisters: number; unidades: number },
  blistersPorCaja: number,
  unidadesPorBlister: number
): {
  ok: boolean
  cajas: number
  blisters: number
  unidades: number
  cajasDestapadas: number
  blistersDestapados: number
} {
  const bpc = Math.max(1, Math.floor(blistersPorCaja || 1))
  const upb = Math.max(1, Math.floor(unidadesPorBlister || 1))

  let cajas = Math.max(0, Math.floor(avail.cajas || 0))
  let blisters = Math.max(0, Math.floor(avail.blisters || 0))
  let unidades = Math.max(0, Math.floor(avail.unidades || 0))

  const rc = Math.max(0, Math.floor(req.cajas || 0))
  const rb = Math.max(0, Math.floor(req.blisters || 0))
  const ru = Math.max(0, Math.floor(req.unidades || 0))

  if (!canFulfillWithUnpacking({ cajas, blisters, unidades }, { cajas: rc, blisters: rb, unidades: ru }, bpc, upb)) {
    return { ok: false, cajas, blisters, unidades, cajasDestapadas: 0, blistersDestapados: 0 }
  }

  let cajasDestapadas = 0
  let blistersDestapados = 0

  // 1. Descontar cajas cerradas
  cajas -= rc

  // 2. Descontar blisters (destapando cajas si hacen falta)
  if (blisters < rb) {
    const faltanBlisters = rb - blisters
    const abrirCajas = Math.ceil(faltanBlisters / bpc)
    cajas -= abrirCajas
    blisters += abrirCajas * bpc
    cajasDestapadas += abrirCajas
  }
  blisters -= rb

  // 3. Descontar unidades (destapando blisters y/o cajas si hacen falta)
  if (unidades < ru) {
    const faltanUnidades = ru - unidades
    const blistersNecesarios = Math.ceil(faltanUnidades / upb)
    if (blisters < blistersNecesarios) {
      const faltanBlisters = blistersNecesarios - blisters
      const abrirCajas = Math.ceil(faltanBlisters / bpc)
      cajas -= abrirCajas
      blisters += abrirCajas * bpc
      cajasDestapadas += abrirCajas
    }
    blisters -= blistersNecesarios
    unidades += blistersNecesarios * upb
    blistersDestapados += blistersNecesarios
  }
  unidades -= ru

  return {
    ok: true,
    cajas,
    blisters,
    unidades,
    cajasDestapadas,
    blistersDestapados,
  }
}

export interface PackConsolidationSuggestion {
  suggested: {
    cajas: number
    blisters: number
    unidades: number
  }
  currentBasePrice: number
  newBasePrice: number
  savings: number
  summaryText: string
}

export function suggestPackConsolidation(
  req: { cajas: number; blisters: number; unidades: number },
  avail: { cajas: number; blisters: number; unidades: number },
  blistersPorCaja: number,
  unidadesPorBlister: number,
  prices: { pvpCaja: number; pvpBlister: number; pvpUnidad: number }
): PackConsolidationSuggestion | null {
  const bpc = Math.max(1, Math.floor(blistersPorCaja || 1))
  const upb = Math.max(1, Math.floor(unidadesPorBlister || 1))

  const rc = Math.max(0, Math.floor(req.cajas || 0))
  const rb = Math.max(0, Math.floor(req.blisters || 0))
  const ru = Math.max(0, Math.floor(req.unidades || 0))

  let nc = rc
  let nb = rb
  let nu = ru

  if (upb > 1 && nu >= upb) {
    const extraBlisters = Math.floor(nu / upb)
    nb += extraBlisters
    nu = nu % upb
  }

  if (bpc > 1 && nb >= bpc) {
    const extraCajas = Math.floor(nb / bpc)
    nc += extraCajas
    nb = nb % bpc
  }

  if (nc === rc && nb === rb && nu === ru) {
    return null
  }

  const nextReq = { cajas: nc, blisters: nb, unidades: nu }
  if (!canFulfillWithUnpacking(avail, nextReq, bpc, upb)) {
    return null
  }

  const currentBasePrice =
    rc * (prices.pvpCaja || 0) + rb * (prices.pvpBlister || 0) + ru * (prices.pvpUnidad || 0)
  const newBasePrice =
    nc * (prices.pvpCaja || 0) + nb * (prices.pvpBlister || 0) + nu * (prices.pvpUnidad || 0)

  if (newBasePrice <= 0 || newBasePrice > currentBasePrice) {
    return null
  }

  const parts: string[] = []
  if (nc > 0) parts.push(`${nc} ${nc === 1 ? 'Caja' : 'Cajas'}`)
  if (nb > 0) parts.push(`${nb} ${nb === 1 ? 'Blíster' : 'Blísters'}`)
  if (nu > 0) parts.push(`${nu} ${nu === 1 ? 'Unidad' : 'Unidades'}`)

  const fromParts: string[] = []
  if (rc > 0) fromParts.push(`${rc}C`)
  if (rb > 0) fromParts.push(`${rb}B`)
  if (ru > 0) fromParts.push(`${ru}U`)

  return {
    suggested: nextReq,
    currentBasePrice,
    newBasePrice,
    savings: Math.max(0, Math.round(currentBasePrice - newBasePrice)),
    summaryText: `${fromParts.join(' + ')} equivale a ${parts.join(' + ')}`,
  }
}
