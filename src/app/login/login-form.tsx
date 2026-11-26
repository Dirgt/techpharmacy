'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { login } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Loader2,
  ShieldCheck,
  Building2,
  AlertTriangle,
  HeartPulse,
  Pill,
  Sparkles,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ReceiptText,
} from 'lucide-react'
import type { PublicTenantInfo } from '@/lib/tenant/resolve'
import { isTenantSuspended } from '@/lib/tenant/domain'

export function LoginForm({
  initialError,
  tenant,
}: {
  initialError: string | null
  tenant: PublicTenantInfo | null
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const [showPassword, setShowPassword] = useState(false)
  const tenantSuspension = tenant ? isTenantSuspended(tenant) : { suspended: false, reason: null }

  useEffect(() => {
    router.prefetch('/dashboard')
    router.prefetch('/droguerias')
  }, [router])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    const formData = new FormData(event.currentTarget)
    const result = await login(formData)

    if (result?.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    if (result?.redirectTo) {
      router.replace(result.redirectTo)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-emerald-50 via-teal-50/80 to-sky-100 px-4 py-6 sm:px-6 lg:px-8">
      {/* Decorative lively pharmacy glow */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-emerald-300/35 blur-3xl" />
        <div className="absolute top-1/4 -right-24 h-80 w-80 rounded-full bg-sky-300/35 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-amber-200/35 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-4xl overflow-hidden rounded-3xl bg-white/95 shadow-2xl shadow-emerald-900/10 ring-1 ring-emerald-600/15 backdrop-blur-xl lg:grid lg:grid-cols-12">
        {/* Left vibrant pharmacy panel */}
        <div className="relative hidden lg:flex lg:col-span-5 flex-col justify-between overflow-hidden bg-gradient-to-br from-emerald-500 via-teal-500 to-sky-500 p-7 text-white">
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-amber-300/20 blur-2xl" />

          <div className="relative space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white backdrop-blur-sm">
              {tenant ? (
                <Building2 className="h-3.5 w-3.5" />
              ) : (
                <HeartPulse className="h-3.5 w-3.5" />
              )}
              <span>
                {tenant ? 'Portal Exclusivo de Droguería' : 'Bienestar & Gestión Farmacéutica'}
              </span>
            </div>

            <div className="space-y-2">
              <h2 className="text-3xl font-black tracking-tight leading-tight">
                {tenant ? tenant.nombre : 'TechPharmacy'}
              </h2>
              <p className="text-sm text-emerald-50/95 leading-relaxed">
                Tu droguería ágil, luminosa y organizada para cuidar la salud de tus clientes cada día.
              </p>
            </div>
          </div>

          <div className="relative my-6 space-y-2.5">
            <div className="flex items-center gap-3 rounded-2xl border border-white/25 bg-white/15 p-3 backdrop-blur-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-300 text-amber-950 shadow-sm">
                <ReceiptText className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black tracking-tight">Mostrador Ágil POS</p>
                <p className="text-[11px] text-emerald-50/90 truncate">
                  Facturación rápida, tirilla y WhatsApp
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-white/25 bg-white/15 p-3 backdrop-blur-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-200 text-emerald-950 shadow-sm">
                <Pill className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black tracking-tight">Inventario & Vencimientos</p>
                <p className="text-[11px] text-emerald-50/90 truncate">
                  Control por cajas, blísters, unidades y lotes
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-white/25 bg-white/15 p-3 backdrop-blur-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-200 text-sky-950 shadow-sm">
                <HeartPulse className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black tracking-tight">Atención Segura</p>
                <p className="text-[11px] text-emerald-50/90 truncate">
                  Alertas de fórmula médica y equivalentes
                </p>
              </div>
            </div>
          </div>

          <div className="relative flex items-center gap-2 text-xs font-medium text-emerald-50/90">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-100" />
            <span>Plataforma segura en la nube • TechPharmacy</span>
          </div>
        </div>

        {/* Right cheerful light login form */}
        <div className="flex flex-col justify-center bg-white p-6 sm:p-8 lg:col-span-7 lg:p-9">
          {/* Mobile branding header */}
          <div className="mb-5 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25">
              {tenant ? <Building2 className="h-5 w-5" /> : <HeartPulse className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-black tracking-tight text-slate-900">
                {tenant ? tenant.nombre : 'TechPharmacy'}
              </p>
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
                {tenant ? 'Portal de Droguería' : 'Sistema Farmacéutico POS'}
              </p>
            </div>
          </div>

          <div className="space-y-2 mb-6">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700">
              <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
              <span>¡Bienvenido de nuevo!</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
              Ingresa a {tenant ? tenant.nombre : 'TechPharmacy'}
            </h1>
            <p className="text-sm text-slate-500">
              Escribe tu correo y contraseña para comenzar tu jornada en el mostrador.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {tenantSuspension.suspended && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  {tenantSuspension.reason ||
                    'El acceso operativo de esta droguería se encuentra suspendido.'}
                </span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-3.5 text-sm font-medium text-rose-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Correo Electrónico
              </Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="nombre@tudrogueria.com"
                  required
                  className="h-11 rounded-xl border-slate-200 bg-slate-50/80 pl-10 text-slate-900 placeholder:text-slate-400 transition-colors focus:bg-white focus-visible:ring-emerald-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Contraseña
              </Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                  className="h-11 rounded-xl border-slate-200 bg-slate-50/80 pl-10 pr-11 text-slate-900 placeholder:text-slate-400 transition-colors focus:bg-white focus-visible:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                className="h-12 w-full rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 font-black text-white shadow-lg shadow-emerald-500/30 transition-all duration-200 hover:from-emerald-600 hover:via-teal-600 hover:to-emerald-700"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Iniciando sesión...
                  </>
                ) : (
                  <>
                    <span>Iniciar Sesión</span>
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </form>

          <div className="mt-6 flex items-center justify-center gap-2 border-t border-slate-100 pt-4 text-xs text-slate-400">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <span>Acceso seguro y protegido para tu equipo farmacéutico</span>
          </div>
        </div>
      </div>
    </div>
  )
}
