'use server'

import { createClient } from '@/lib/supabase/server'
import { requireActiveUser } from '@/lib/auth/session'

// La venta, la cartera, los abonos y la anulación van directo del navegador a
// Supabase (src/lib/pos/ventas-navegador.ts): las RPC validan todo en la base y
// así no se consume una función de Vercel ni se re-renderiza el POS por venta.

export async function getFacturas() {
  const auth = await requireActiveUser()
  if (!auth.ok) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('facturas')
    .select(`
      *,
      profiles:vendedor_id (full_name)
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('Error consultando facturas:', error)
    return []
  }
  return data
}

export async function getVendedores() {
  const auth = await requireActiveUser()
  if (!auth.ok) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('role', ['vendedor', 'admin'])
    .eq('status', 'activo')
    .order('full_name', { ascending: true })

  if (error) {
    console.error('Error consultando vendedores:', error)
    return []
  }
  return data
}
