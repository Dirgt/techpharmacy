'use client'

import { useState } from 'react'
import { login } from '@/app/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, ShieldCheck, Building2, AlertTriangle } from 'lucide-react'
import type { PublicTenantInfo } from '@/lib/tenant/resolve'
import { isTenantSuspended } from '@/lib/tenant/domain'

export function LoginForm({
  initialError,
  tenant,
}: {
  initialError: string | null
  tenant: PublicTenantInfo | null
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(initialError)
  const tenantSuspension = tenant ? isTenantSuspended(tenant) : { suspended: false, reason: null }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError(null)

    const formData = new FormData(event.currentTarget)
    const result = await login(formData)

    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-12 sm:px-6 lg:px-8">
      {/* Background decoration */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        <div className="absolute -top-[10%] -left-[10%] h-[40%] w-[40%] rounded-full bg-emerald-500/10 blur-[120px]" />
        <div className="absolute -bottom-[10%] -right-[10%] h-[40%] w-[40%] rounded-full bg-blue-500/10 blur-[120px]" />
      </div>

      <Card className="z-10 w-full max-w-md border-slate-800 bg-slate-900/50 backdrop-blur-xl">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-emerald-500/20 p-3">
              {tenant ? (
                <Building2 className="h-8 w-8 text-emerald-500" />
              ) : (
                <ShieldCheck className="h-8 w-8 text-emerald-500" />
              )}
            </div>
          </div>
          {tenant && (
            <div className="inline-flex mx-auto items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-bold uppercase tracking-wider text-emerald-400 mb-1">
              Portal de Droguería • TechPharmacy
            </div>
          )}
          <CardTitle className="text-3xl font-bold tracking-tight text-white">
            {tenant ? tenant.nombre : 'TechPharmacy'}
          </CardTitle>
          <CardDescription className="text-slate-400">
            Ingresa tus credenciales para acceder al sistema
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {tenantSuspension.suspended && (
              <div className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-300 border border-amber-500/20 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
                <span>
                  {tenantSuspension.reason ||
                    'El acceso operativo de esta droguería se encuentra suspendido.'}
                </span>
              </div>
            )}
            {error && (
              <div className="rounded-md bg-red-500/10 p-3 text-sm text-red-400 border border-red-500/20">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-300">Correo Electrónico</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="nombre@ejemplo.com"
                required
                className="bg-slate-950 border-slate-800 text-white placeholder:text-slate-600 focus-visible:ring-emerald-500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300">Contraseña</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                className="bg-slate-950 border-slate-800 text-white focus-visible:ring-emerald-500"
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-6 transition-all duration-200"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Iniciando sesión...
                </>
              ) : (
                'Iniciar Sesión'
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
