import { createClient } from '@/lib/supabase/server'
import { CronogramaClient } from './cronograma-client'

export const dynamic = 'force-dynamic'

export default async function CronogramaPage() {
  const supabase = await createClient()

  const [{ data: turnos, error: turnosError }, { data: usuarios, error: usuariosError }] =
    await Promise.all([
      supabase
        .from('cronogramas')
        .select(`
          *,
          profiles:usuario_id (
            full_name,
            username
          )
        `)
        .order('fecha', { ascending: true }),
      supabase
        .from('profiles')
        .select('id, full_name, username')
        .eq('status', 'activo')
        .order('full_name', { ascending: true }),
    ])

  if (turnosError || usuariosError) {
    console.error('Error cargando cronograma:', turnosError || usuariosError)
  }

  // Devolvemos solo el cliente sin el div duplicado para evitar error de Hydration
  return <CronogramaClient initialTurnos={turnos || []} usuarios={usuarios || []} />
}
