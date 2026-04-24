import { createClient } from '@/lib/supabase/server'
import { CronogramaClient } from './cronograma-client'

export const dynamic = 'force-dynamic'

export default async function CronogramaPage() {
  const supabase = await createClient()

  // Obtener todos los turnos con los datos del usuario
  const { data: turnos, error: turnosError } = await supabase
    .from('cronogramas')
    .select(`
      *,
      profiles:usuario_id (
        full_name,
        username
      )
    `)
    .order('fecha', { ascending: true })

  // Obtener lista de usuarios activos para el selector
  const { data: usuarios, error: usuariosError } = await supabase
    .from('profiles')
    .select('id, full_name, username')
    .eq('status', 'activo')
    .order('full_name', { ascending: true })

  if (turnosError || usuariosError) {
    console.error('Error cargando cronograma:', turnosError || usuariosError)
  }

  // Devolvemos solo el cliente sin el div duplicado para evitar error de Hydration
  return <CronogramaClient initialTurnos={turnos || []} usuarios={usuarios || []} />
}
