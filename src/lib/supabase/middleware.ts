import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/lib/supabase/database.types'
import { isTenantSuspended } from '@/lib/tenant/domain'
import { resolveTenantWithSupabase } from '@/lib/tenant/resolve'

const ADMIN_ROUTES = ['/usuarios', '/reportes', '/compras', '/proveedores']
const SUPERADMIN_ROUTES = ['/droguerias']
const TENANT_OPERATIONAL_ROUTES = [
  '/dashboard',
  '/inventario',
  '/facturas',
  '/compras',
  '/proveedores',
  '/reportes',
  '/usuarios',
  '/cronograma',
]

interface CachedMiddlewareProfile {
  role: string | null
  status: string | null
  drogueriaId: string | null
  drogueriaEstado: string | null
  drogueriaFechaVencimiento: string | null
  drogueriaMotivoSuspension: string | null
  expiresAt: number
}

const PROFILE_CACHE_TTL_MS = 30_000
const profileCache = new Map<string, CachedMiddlewareProfile>()

export function invalidateMiddlewareProfileCache(userId?: string) {
  if (userId) {
    profileCache.delete(userId)
    return
  }
  profileCache.clear()
}

export async function updateSession(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/v1')) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const pathname = request.nextUrl.pathname
  const isApiRoute = pathname.startsWith('/api')
  const isLoginRoute = pathname.startsWith('/login')
  const isSuspendedRoute = pathname.startsWith('/suspendido')

  // Verificar claims locales del JWT (sin round-trip remoto en cada clic)
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims as { sub?: string } | undefined
  const userId = claims?.sub

  if (!userId && isApiRoute) {
    return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 })
  }

  if (!userId && !isLoginRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (userId) {
    const cached = profileCache.get(userId)
    let profile: Omit<CachedMiddlewareProfile, 'expiresAt'> | null = null

    if (cached && cached.expiresAt > Date.now()) {
      profile = {
        role: cached.role,
        status: cached.status,
        drogueriaId: cached.drogueriaId,
        drogueriaEstado: cached.drogueriaEstado,
        drogueriaFechaVencimiento: cached.drogueriaFechaVencimiento,
        drogueriaMotivoSuspension: cached.drogueriaMotivoSuspension,
      }
    } else {
      const { data: freshProfile } = await supabase
        .from('profiles')
        .select(
          'role, status, drogueria_id, drogueria:drogueria_id ( estado, fecha_vencimiento, motivo_suspension )'
        )
        .eq('id', userId)
        .single()

      if (freshProfile) {
        const drogueriaRaw = Array.isArray(freshProfile.drogueria)
          ? freshProfile.drogueria[0]
          : freshProfile.drogueria

        const resolved: Omit<CachedMiddlewareProfile, 'expiresAt'> = {
          role: freshProfile.role,
          status: freshProfile.status,
          drogueriaId: freshProfile.drogueria_id,
          drogueriaEstado: drogueriaRaw?.estado ?? null,
          drogueriaFechaVencimiento: drogueriaRaw?.fecha_vencimiento ?? null,
          drogueriaMotivoSuspension: drogueriaRaw?.motivo_suspension ?? null,
        }

        if (freshProfile.status === 'activo') {
          profileCache.set(userId, {
            ...resolved,
            expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
          })
        } else {
          profileCache.delete(userId)
        }
        profile = resolved
      } else {
        profileCache.delete(userId)
      }
    }

    if (!profile || profile.status !== 'activo') {
      profileCache.delete(userId)
      if (isApiRoute) {
        return NextResponse.json({ success: false, error: 'Cuenta inactiva' }, { status: 403 })
      }
      await supabase.auth.signOut()
      if (!isLoginRoute) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        url.searchParams.set('error', 'inactivo')
        const redirectRes = NextResponse.redirect(url)
        supabaseResponse.cookies.getAll().forEach((cookie) => {
          redirectRes.cookies.set(cookie)
        })
        return redirectRes
      }
      return supabaseResponse
    }

    if (profile.role === 'superadmin') {
      if (isLoginRoute || isSuspendedRoute || pathname === '/') {
        const url = request.nextUrl.clone()
        url.pathname = profile.drogueriaId ? '/dashboard' : '/droguerias'
        return NextResponse.redirect(url)
      }
      if (
        !profile.drogueriaId &&
        TENANT_OPERATIONAL_ROUTES.some((route) => pathname.startsWith(route))
      ) {
        const url = request.nextUrl.clone()
        url.pathname = '/droguerias'
        return NextResponse.redirect(url)
      }
      return supabaseResponse
    }

    // Aislamiento de dominio para usuarios operativos (admin / vendedor)
    const rawHost = request.headers.get('x-forwarded-host') || request.headers.get('host')
    const hostTenant = await resolveTenantWithSupabase(supabase, rawHost)

    if (hostTenant && hostTenant.id !== profile.drogueriaId) {
      profileCache.delete(userId)
      if (isApiRoute) {
        return NextResponse.json(
          { success: false, error: 'Acceso denegado para este dominio de droguería' },
          { status: 403 }
        )
      }
      await supabase.auth.signOut()
      if (!isLoginRoute) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        url.searchParams.set('error', 'dominio_invalido')
        const redirectRes = NextResponse.redirect(url)
        supabaseResponse.cookies.getAll().forEach((cookie) => {
          redirectRes.cookies.set(cookie)
        })
        return redirectRes
      }
      return supabaseResponse
    }

    // Control de suspensión / vencimiento de plan
    const suspension = isTenantSuspended({
      estado: profile.drogueriaEstado,
      fecha_vencimiento: profile.drogueriaFechaVencimiento,
      motivo_suspension: profile.drogueriaMotivoSuspension,
    })

    if (suspension.suspended) {
      if (isApiRoute) {
        return NextResponse.json(
          {
            success: false,
            error: suspension.reason || 'Servicio suspendido por administración.',
          },
          { status: 403 }
        )
      }
      if (!isSuspendedRoute && !isLoginRoute) {
        const url = request.nextUrl.clone()
        url.pathname = '/suspendido'
        return NextResponse.redirect(url)
      }
      return supabaseResponse
    }

    if (isSuspendedRoute) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }

    if (isLoginRoute || pathname === '/') {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }

    if (SUPERADMIN_ROUTES.some((route) => pathname.startsWith(route))) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }

    if (
      ADMIN_ROUTES.some((route) => pathname.startsWith(route)) &&
      profile.role !== 'admin'
    ) {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
