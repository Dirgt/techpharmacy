'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Receipt, AlertCircle } from 'lucide-react'
import { registrarGasto } from '@/app/actions/tesoreria'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Database } from '@/lib/supabase/database.types'

export function GastoModal({ cajaAbierta }: { cajaAbierta: Database['public']['Tables']['caja_sesiones']['Row'] | null }) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')
  const [tipo, setTipo] = useState('operativo')
  const [comprobante, setComprobante] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!cajaAbierta || cajaAbierta.estado !== 'abierta') {
      return toast.error('La caja no está abierta.')
    }
    
    setIsSubmitting(true)

    const result = await registrarGasto({
      caja_sesion_id: cajaAbierta.id,
      concepto,
      monto: parseFloat(monto),
      tipo: tipo as any,
      comprobante: comprobante || undefined
    })

    if (result.success) {
      toast.success('Gasto registrado exitosamente')
      setIsModalOpen(false)
      // Reset
      setConcepto('')
      setMonto('')
      setTipo('operativo')
      setComprobante('')
    } else {
      toast.error(result.error || 'Error al registrar el gasto')
    }
    
    setIsSubmitting(false)
  }

  return (
    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 hover:bg-amber-100 font-bold transition-all ml-2">
          <Receipt className="w-4 h-4 mr-2" />
          Registrar Gasto
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center text-amber-700">
            <Receipt className="w-5 h-5 mr-2" />
            Registrar Gasto / Egreso de Caja
          </DialogTitle>
        </DialogHeader>
        
        {!cajaAbierta ? (
          <div className="mt-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-rose-600 mt-0.5" />
            <div>
              <h4 className="font-bold text-rose-900">Caja Cerrada</h4>
              <p className="text-sm mt-1">
                Debes abrir la caja para registrar gastos en efectivo.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Concepto / Motivo *</Label>
              <Input 
                required 
                placeholder="Ej. Pago de internet, papelería..." 
                value={concepto}
                onChange={e => setConcepto(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Monto en Efectivo *</Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 font-black">$</span>
                <Input 
                  required 
                  type="number"
                  min="0"
                  step="0.01"
                  className="pl-9"
                  placeholder="0.00"
                  value={monto}
                  onChange={e => setMonto(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tipo de Gasto</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operativo">Gasto Operativo</SelectItem>
                  <SelectItem value="caja_chica">Caja Chica</SelectItem>
                  <SelectItem value="nomina">Nómina / Adelanto</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Comprobante / N° de Recibo (Opcional)</Label>
              <Input 
                placeholder="Ej. REC-00123" 
                value={comprobante}
                onChange={e => setComprobante(e.target.value)}
              />
            </div>

            <div className="pt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-amber-600 hover:bg-amber-700 text-white">
                {isSubmitting ? 'Guardando...' : 'Registrar Gasto'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
