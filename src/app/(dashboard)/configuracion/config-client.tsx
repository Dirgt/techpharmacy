/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { KeyRound, Mail, Shield, User, Loader2, Building2 } from 'lucide-react'
import { toast } from 'sonner'
import { changeOwnPassword, updateOwnDrogueriaFiscal } from '@/app/actions/auth'

export default function ConfigClient({ profile, userEmail }: { profile: any; userEmail: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const drogueria = profile?.drogueria
  const isTenantAdmin = profile?.role === 'admin' && Boolean(drogueria)

  const [savingFiscal, setSavingFiscal] = useState(false)
  const [fiscalForm, setFiscalForm] = useState({
    nit: drogueria?.nit || '',
    regimen: drogueria?.regimen || '',
    telefono: drogueria?.telefono || '',
    direccion: drogueria?.direccion || '',
    mensaje_pie_factura: drogueria?.mensaje_pie_factura || '',
  })

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password.length < 6) {
      return toast.error('La contraseña debe tener al menos 6 caracteres')
    }
    if (password !== confirmPassword) {
      return toast.error('Las contraseñas no coinciden')
    }

    setLoading(true)
    const result = await changeOwnPassword(password)
    setLoading(false)

    if (result.success) {
      toast.success('Contraseña actualizada correctamente')
      setPassword('')
      setConfirmPassword('')
    } else {
      toast.error(result.error || 'Hubo un error al actualizar la contraseña')
    }
  }

  const handleSaveFiscal = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingFiscal(true)
    const result = await updateOwnDrogueriaFiscal(fiscalForm)
    setSavingFiscal(false)

    if (result.success) {
      toast.success('Datos fiscales y pie de tirilla actualizados')
      router.refresh()
    } else {
      toast.error(result.error || 'No se pudieron actualizar los datos de la droguería')
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
          <div className="bg-slate-900 p-2.5 rounded-2xl">
            <User className="h-6 w-6 text-white" />
          </div>
          Mi Perfil y Configuración
        </h1>
        <p className="text-slate-500 font-bold mt-2">
          Gestiona tus credenciales y los datos fiscales de tu droguería.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Información del Perfil */}
        <Card className="border-none shadow-xl shadow-slate-200/50 rounded-[2rem] overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8">
            <CardTitle className="text-lg font-black text-slate-900 flex items-center">
              <Shield className="w-5 h-5 mr-2 text-indigo-500" />
              Datos de la Cuenta
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            <div className="space-y-1">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                Nombre Completo
              </p>
              <p className="text-lg font-bold text-slate-900">{profile?.full_name}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                Correo de Acceso
              </p>
              <div className="flex items-center text-slate-900 font-bold text-lg">
                <Mail className="w-4 h-4 mr-2 text-slate-400" />
                {userEmail}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">
                Rol del Sistema
              </p>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl text-xs font-black uppercase tracking-widest border bg-purple-50 text-purple-700 border-purple-100 mt-1">
                {profile?.role}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cambio de Contraseña */}
        <Card className="border-none shadow-xl shadow-slate-200/50 rounded-[2rem] overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8">
            <CardTitle className="text-lg font-black text-slate-900 flex items-center">
              <KeyRound className="w-5 h-5 mr-2 text-emerald-500" />
              Cambiar Contraseña
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8">
            <form onSubmit={handlePasswordChange} className="space-y-6">
              <div className="space-y-3">
                <Label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                  Nueva Contraseña
                </Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="h-12 rounded-xl bg-slate-50 border-slate-200 font-medium px-4"
                  required
                />
              </div>
              <div className="space-y-3">
                <Label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                  Confirmar Contraseña
                </Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repite la nueva contraseña"
                  className="h-12 rounded-xl bg-slate-50 border-slate-200 font-medium px-4"
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl font-black tracking-wide bg-slate-900 hover:bg-slate-800 text-white"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Actualizar Contraseña'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Datos Fiscales y Tirilla de la Sede (Solo Admin) */}
      {isTenantAdmin && (
        <Card className="border-none shadow-xl shadow-slate-200/50 rounded-[2rem] overflow-hidden">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8">
            <CardTitle className="text-lg font-black text-slate-900 flex items-center">
              <Building2 className="w-5 h-5 mr-2 text-indigo-600" />
              Datos Fiscales y Recibo de {drogueria.nombre}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8">
            <form onSubmit={handleSaveFiscal} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                    NIT / RUT
                  </Label>
                  <Input
                    value={fiscalForm.nit}
                    onChange={(e) => setFiscalForm({ ...fiscalForm, nit: e.target.value })}
                    placeholder="900.123.456-7"
                    className="h-11 rounded-xl bg-slate-50 border-slate-200 font-medium px-4"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                    Régimen Tributario
                  </Label>
                  <Input
                    value={fiscalForm.regimen}
                    onChange={(e) => setFiscalForm({ ...fiscalForm, regimen: e.target.value })}
                    placeholder="Régimen Simple / Responsable de IVA"
                    className="h-11 rounded-xl bg-slate-50 border-slate-200 font-medium px-4"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                    Teléfono / WhatsApp Sede
                  </Label>
                  <Input
                    value={fiscalForm.telefono}
                    onChange={(e) => setFiscalForm({ ...fiscalForm, telefono: e.target.value })}
                    placeholder="(601) 555-0123 / 3001234567"
                    className="h-11 rounded-xl bg-slate-50 border-slate-200 font-medium px-4"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                    Dirección Física
                  </Label>
                  <Input
                    value={fiscalForm.direccion}
                    onChange={(e) => setFiscalForm({ ...fiscalForm, direccion: e.target.value })}
                    placeholder="Calle 123 # 45-67"
                    className="h-11 rounded-xl bg-slate-50 border-slate-200 font-medium px-4"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                  Mensaje al Pie de Tirilla / Factura
                </Label>
                <Input
                  value={fiscalForm.mensaje_pie_factura}
                  onChange={(e) =>
                    setFiscalForm({ ...fiscalForm, mensaje_pie_factura: e.target.value })
                  }
                  placeholder="Ej. Revise su cambio y medicamentos antes de retirarse. No se aceptan devoluciones después de 24h."
                  className="h-11 rounded-xl bg-slate-50 border-slate-200 font-medium px-4"
                />
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={savingFiscal}
                  className="h-11 px-6 rounded-xl font-black bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {savingFiscal ? 'Guardando...' : 'Guardar Datos de Sede'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
