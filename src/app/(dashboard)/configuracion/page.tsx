import { getCurrentUserWithProfile } from '@/lib/auth/session'
import ConfigClient from './config-client'

export const dynamic = 'force-dynamic'

export default async function ConfiguracionPage() {
  const session = await getCurrentUserWithProfile()

  return (
    <div className="p-6 lg:p-8 space-y-8 animate-in fade-in duration-700">
      <ConfigClient profile={session?.profile ?? null} userEmail={session?.user?.email || ''} />
    </div>
  )
}
