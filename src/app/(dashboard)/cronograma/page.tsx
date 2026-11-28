import { createClient } from '@/lib/supabase/server'
import { fetchAllPages } from '@/lib/supabase/fetch-all'
import { CronogramaClient } from './cronograma-client'

export const dynamic = 'force-dynamic'

export default async function CronogramaPage() {
  const supabase = await createClient()

  const [turnosRes, { data: usuarios, error: usuariosError }] = await Promise.all([
    fetchAllPages((from, to) =>
      supabase
        .from('cronogramas')
        .select(`
          *,
          profiles:usuario_id (
            full_name,
            username
          )
        `)
        .order('fecha', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to)
    ),
    supabase
      .from('profiles')
      .select('id, full_name, username')
      .eq('status', 'activo')
      .order('full_name', { ascending: true }),
  ])

  if (turnosRes.error || usuariosError) {
    console.error('Error cargando cronograma:', turnosRes.error || usuariosError)
  }

  // Devolvemos solo el cliente sin el div duplicado para evitar error de Hydration
  return <CronogramaClient initialTurnos={turnosRes.data} usuarios={usuarios || []} />
}
