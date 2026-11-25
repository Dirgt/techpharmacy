import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/auth/session'
import { UserClient } from './user-client'

export const dynamic = 'force-dynamic'

export default async function UsuariosPage() {
  const auth = await requireAdmin()
  if (!auth.ok) redirect('/dashboard')

  const supabase = await createClient()
  
  const { data: usuarios } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="p-6 lg:p-8 space-y-8 animate-in fade-in duration-700">
      <UserClient initialUsers={usuarios || []} />
    </div>
  )
}
