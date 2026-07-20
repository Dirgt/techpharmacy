import { createClient } from '@/lib/supabase/server'
import ConfigClient from './config-client'

export const dynamic = 'force-dynamic'

export default async function ConfiguracionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  let profile = null
  if (user) {
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    profile = data
  }

  return (
    <div className="p-6 lg:p-8 space-y-8 animate-in fade-in duration-700">
      <ConfigClient profile={profile} userEmail={user?.email || ''} />
    </div>
  )
}
