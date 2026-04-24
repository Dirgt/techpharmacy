import { getInventario, getLaboratorios } from '@/app/actions/inventario'
import InventarioClient from './inventario-client'

export const metadata = {
  title: 'Inventario | TechPharmacy',
  description: 'Gestión moderna de stock y productos',
}

export default async function InventarioPage() {
  // Fetch inicial de datos en el servidor
  const [inventario, laboratorios] = await Promise.all([
    getInventario(),
    getLaboratorios()
  ])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">INVENTARIO</h1>
        <p className="text-slate-500 font-medium">Control total de stock, costos y vencimientos.</p>
      </div>

      <InventarioClient 
        initialData={inventario} 
        laboratorios={laboratorios} 
      />
    </div>
  )
}
