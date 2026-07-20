/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { KeyRound, Mail, Shield, User, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { changeOwnPassword } from '@/app/actions/auth'

export default function ConfigClient({ profile, userEmail }: { profile: any, userEmail: string }) {
  const [loading, setLoading] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

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
          Gestiona tus credenciales y datos de acceso.
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
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Nombre Completo</p>
              <p className="text-lg font-bold text-slate-900">{profile?.full_name}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Correo de Acceso</p>
              <div className="flex items-center text-slate-900 font-bold text-lg">
                <Mail className="w-4 h-4 mr-2 text-slate-400" />
                {userEmail}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Rol del Sistema</p>
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
                <Label className="text-xs font-black text-slate-500 uppercase tracking-widest">Nueva Contraseña</Label>
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
                <Label className="text-xs font-black text-slate-500 uppercase tracking-widest">Confirmar Contraseña</Label>
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
    </div>
  )
}
