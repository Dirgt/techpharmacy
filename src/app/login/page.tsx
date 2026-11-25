import { headers } from 'next/headers'
import { resolveTenantFromHost } from '@/lib/tenant/resolve'
import { LoginForm } from './login-form'

export const dynamic = 'force-dynamic'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const [params, headersList] = await Promise.all([searchParams, headers()])
  const rawHost = headersList.get('x-forwarded-host') || headersList.get('host')
  const tenant = await resolveTenantFromHost(rawHost)

  let initialError: string | null = null
  if (params.error === 'inactivo') {
    initialError = 'Tu cuenta se encuentra inactiva. Contacta al administrador.'
  } else if (params.error === 'suspendido') {
    initialError = 'El servicio de esta droguería se encuentra suspendido.'
  } else if (params.error === 'dominio_invalido') {
    initialError = tenant
      ? `Tu cuenta no pertenece a ${tenant.nombre}. Inicia sesión desde el dominio de tu droguería.`
      : 'Tu cuenta no pertenece a este dominio de droguería.'
  }

  return <LoginForm initialError={initialError} tenant={tenant} />
}
