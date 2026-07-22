'use client'

import { useState } from 'react'
import { Database } from '@/lib/supabase/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Plus, Search, Building2, Phone, Mail, FileText, Calendar } from 'lucide-react'
import { createProveedor } from '@/app/actions/tesoreria'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

type Proveedor = Database['public']['Tables']['proveedores']['Row']

export default function ProveedoresClient({ initialData }: { initialData: Proveedor[] }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    nombre: '',
    documento_nit: '',
    telefono: '',
    email: '',
    dias_credito: '0'
  })

  const filteredData = initialData.filter(p => 
    p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.documento_nit?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    const result = await createProveedor({
      nombre: formData.nombre,
      documento_nit: formData.documento_nit || null,
      telefono: formData.telefono || null,
      email: formData.email || null,
      dias_credito: parseInt(formData.dias_credito) || 0
    })

    if (result.success) {
      toast.success('Proveedor registrado correctamente')
      setIsModalOpen(false)
      setFormData({ nombre: '', documento_nit: '', telefono: '', email: '', dias_credito: '0' })
    } else {
      toast.error(result.error || 'Error al guardar el proveedor')
    }
    setIsSubmitting(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Proveedores</h1>
          <p className="text-slate-500 mt-1">Gestión de laboratorios y distribuidores</p>
        </div>
        
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200">
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Proveedor
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Registrar Proveedor</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Nombre / Razón Social *</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input 
                    required 
                    placeholder="Ej. Distribuidora del Valle" 
                    className="pl-9"
                    value={formData.nombre}
                    onChange={e => setFormData({...formData, nombre: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>NIT / Documento</Label>
                <div className="relative">
                  <FileText className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input 
                    placeholder="900.123.456-7" 
                    className="pl-9"
                    value={formData.documento_nit}
                    onChange={e => setFormData({...formData, documento_nit: e.target.value})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Teléfono</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input 
                      placeholder="300..." 
                      className="pl-9"
                      value={formData.telefono}
                      onChange={e => setFormData({...formData, telefono: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Días de Crédito</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input 
                      type="number"
                      min="0"
                      className="pl-9"
                      value={formData.dias_credito}
                      onChange={e => setFormData({...formData, dias_credito: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input 
                    type="email"
                    placeholder="ventas@proveedor.com" 
                    className="pl-9"
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={isSubmitting} className="bg-indigo-600 hover:bg-indigo-700">
                  {isSubmitting ? 'Guardando...' : 'Guardar Proveedor'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="sticky top-0 z-50 bg-white/90 backdrop-blur-3xl p-4 lg:p-6 rounded-[2rem] lg:rounded-[3rem] border border-slate-100 shadow-xl flex flex-col xl:flex-row gap-4 lg:gap-6 items-center mb-6 mt-4">
        <div className="relative flex-1 group w-full">
          <Search className="absolute left-6 lg:left-8 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 w-5 h-5 lg:w-6 lg:h-6 transition-colors" />
          <input 
            type="text" 
            placeholder="Buscar por nombre o NIT..." 
            className="w-full pl-14 lg:pl-20 pr-6 lg:pr-10 py-4 lg:py-6 bg-slate-50 border-none rounded-[2rem] lg:rounded-[2.5rem] text-base lg:text-lg font-bold focus:bg-white focus:ring-[10px] lg:focus:ring-[15px] focus:ring-indigo-600/5 transition-all outline-none shadow-inner"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {searchTerm !== '' && (
        <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 px-6 py-3 rounded-2xl animate-in fade-in duration-200 mb-6">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
            <p className="text-xs font-bold text-indigo-900">
              Filtro activo de búsqueda: <span className="uppercase font-black text-indigo-700">{searchTerm}</span> ({filteredData.length} resultados)
            </p>
          </div>
          <button 
            onClick={() => setSearchTerm('')}
            className="text-xs font-black text-indigo-600 hover:text-indigo-800 bg-white px-3 py-1.5 rounded-xl border border-indigo-200 shadow-sm transition-all active:scale-95"
          >
            Quitar Filtro ✕
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold">Proveedor</th>
                <th className="px-6 py-4 font-semibold">NIT</th>
                <th className="px-6 py-4 font-semibold">Contacto</th>
                <th className="px-6 py-4 font-semibold">Crédito (Días)</th>
                <th className="px-6 py-4 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredData.length > 0 ? (
                filteredData.map((proveedor) => (
                  <tr key={proveedor.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">{proveedor.nombre}</div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      {proveedor.documento_nit || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-900">{proveedor.telefono || '-'}</div>
                      <div className="text-xs text-slate-500">{proveedor.email || '-'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                        {proveedor.dias_credito} días
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="sm" className="text-slate-400 hover:text-indigo-600">
                        Editar
                      </Button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                    No se encontraron proveedores
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
