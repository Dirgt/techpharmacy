import { getLaboratorios } from '@/app/actions/inventario'
import { getCurrentUserWithProfile } from '@/lib/auth/session'
import { InventarioLoader } from './inventario-loader'

export const metadata = {
  title: 'Inventario | TechPharmacy',
  description: 'Gestión moderna de stock y productos',
}

export default async function InventarioPage() {
  // El inventario llega del catálogo local del navegador (IndexedDB + cambios
  // incrementales); el servidor solo envía los laboratorios.
  const [laboratorios, session] = await Promise.all([getLaboratorios(), getCurrentUserWithProfile()])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">INVENTARIO</h1>
        <p className="text-slate-500 font-medium">Control total de stock, costos y vencimientos.</p>
      </div>

      <InventarioLoader
        drogueriaId={session?.profile?.drogueria_id ?? null}
        laboratorios={laboratorios}
      />
    </div>
  )
}
