/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select'
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog'
import { 
  UsersIcon, 
  UserPlus,
  Settings,
  User,
  Mail,
  KeyRound,
  ShieldCheck,
  UserCheck
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { createTestUser, updateUser, resetAdminUserPassword } from '@/app/actions/usuarios'
import { UserTable } from './user-table'
import { useRouter } from 'next/navigation'

interface UserClientProps {
  initialUsers: any[]
}

export function UserClient({ initialUsers }: UserClientProps) {
  const [loading, setLoading] = useState(false)
  const [editingUser, setEditingUser] = useState<any>(null)
  const [configUser, setConfigUser] = useState<any>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [newConfigPassword, setNewConfigPassword] = useState('')
  const router = useRouter()

  const calculatePasswordStrength = (pass: string) => {
    let strength = 0
    if (pass.length >= 8) strength += 25
    if (/[A-Z]/.test(pass)) strength += 25
    if (/[0-9]/.test(pass)) strength += 25
    if (/[^A-Za-z0-9]/.test(pass)) strength += 25
    return strength
  }

  const getStrengthColor = (strength: number) => {
    if (strength <= 25) return 'bg-red-500'
    if (strength <= 50) return 'bg-yellow-500'
    if (strength <= 75) return 'bg-blue-500'
    return 'bg-emerald-500'
  }

  const strength = calculatePasswordStrength(password)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    const form = event.currentTarget
    const formData = new FormData(form)
    const result = await createTestUser(formData)
    if (result.success) {
      toast.success('Usuario creado correctamente')
      form.reset()
      setPassword('')
      setIsCreateDialogOpen(false)
      router.refresh()
    } else {
      toast.error(result.error || 'Error al crear el usuario')
    }
    setLoading(false)
  }

  async function handleUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingUser) return
    setLoading(true)
    const form = event.currentTarget
    const formData = new FormData(form)
    const result = await updateUser(editingUser.id, formData)
    if (result.success) {
      toast.success('Usuario actualizado')
      setIsEditDialogOpen(false)
      router.refresh()
    } else {
      toast.error(result.error || 'Error al actualizar')
    }
    setLoading(false)
  }

  async function handleConfigSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!configUser) return
    setLoading(true)
    const result = await resetAdminUserPassword(configUser.id, newConfigPassword)
    if (result.success) {
      toast.success('Contraseña actualizada correctamente para ' + configUser.full_name)
      setIsConfigDialogOpen(false)
      setNewConfigPassword('')
    } else {
      toast.error(result.error || 'Error al actualizar la contraseña')
    }
    setLoading(false)
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-4xl font-black tracking-tight text-slate-900 flex items-center gap-3">
            <div className="bg-emerald-100 p-2.5 rounded-2xl shadow-sm">
              <UsersIcon className="h-8 w-8 text-emerald-600" />
            </div>
            Gestión de Personal
          </h2>
          <p className="text-slate-500 font-medium mt-2">Administra los accesos y perfiles de tu equipo farmacéutico.</p>
        </div>
        
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl px-6 py-6 h-auto text-base font-bold shadow-lg shadow-emerald-600/20 transition-all hover:scale-105 active:scale-95 gap-2">
              <UserPlus className="h-5 w-5" />
              Nuevo Usuario
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white border-slate-100 text-slate-900 sm:max-w-xl md:max-w-2xl rounded-3xl p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader className="border-b border-slate-100 pb-5">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-100 text-emerald-600">
                  <UserPlus className="w-6 h-6" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-black tracking-tight text-slate-900">Registrar Empleado</DialogTitle>
                  <DialogDescription className="text-slate-500 font-medium text-xs pt-1">
                    Gestión de credenciales y asignación de perfil corporativo.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-6 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div className="space-y-2">
                  <Label className="font-bold text-xs uppercase tracking-wider text-slate-600 flex items-center gap-1.5 ml-1">
                    <User className="w-3.5 h-3.5 text-emerald-600" /> Nombre Completo *
                  </Label>
                  <Input name="full_name" required className="bg-slate-50/70 border-slate-200 rounded-xl h-12 text-sm font-semibold focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600" placeholder="Ej. Juan Carlos Pérez" />
                </div>

                <div className="space-y-2">
                  <Label className="font-bold text-xs uppercase tracking-wider text-slate-600 flex items-center gap-1.5 ml-1">
                    <UserCheck className="w-3.5 h-3.5 text-emerald-600" /> Nombre de Usuario *
                  </Label>
                  <Input name="username" required className="bg-slate-50/70 border-slate-200 rounded-xl h-12 text-sm font-semibold focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600" placeholder="Ej. jperez" />
                </div>

                <div className="space-y-2">
                  <Label className="font-bold text-xs uppercase tracking-wider text-slate-600 flex items-center gap-1.5 ml-1">
                    <Mail className="w-3.5 h-3.5 text-emerald-600" /> Correo Electrónico *
                  </Label>
                  <Input name="email" type="email" required className="bg-slate-50/70 border-slate-200 rounded-xl h-12 text-sm font-semibold focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600" placeholder="juan.perez@farmacia.com" />
                </div>

                <div className="space-y-2">
                  <Label className="font-bold text-xs uppercase tracking-wider text-slate-600 flex items-center gap-1.5 ml-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Rol en Sistema *
                  </Label>
                  <Select name="role" defaultValue="vendedor">
                    <SelectTrigger className="bg-slate-50/70 border-slate-200 rounded-xl h-12 text-sm font-semibold focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600">
                      <SelectValue placeholder="Seleccionar rol" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200 shadow-xl rounded-xl">
                      <SelectItem value="admin" className="focus:bg-emerald-50 py-3 font-semibold">Administrador General</SelectItem>
                      <SelectItem value="vendedor" className="focus:bg-emerald-50 py-3 font-semibold">Vendedor / Farmacéutico</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="sm:col-span-2 space-y-2">
                  <Label className="font-bold text-xs uppercase tracking-wider text-slate-600 flex items-center gap-1.5 ml-1">
                    <KeyRound className="w-3.5 h-3.5 text-emerald-600" /> Contraseña de Acceso *
                  </Label>
                  <Input 
                    name="password" 
                    type="password" 
                    required 
                    className="bg-slate-50/70 border-slate-200 rounded-xl h-12 text-sm font-semibold focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600" 
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  {password && (
                    <div className="space-y-1.5 mt-2 px-1">
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-500 ${getStrengthColor(strength)}`} 
                          style={{ width: `${strength}%` }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">
                        Nivel de Seguridad: <span className={strength > 50 ? 'text-emerald-600' : 'text-amber-500'}>{strength <= 50 ? 'Baja' : strength <= 75 ? 'Media' : 'Alta (Recomendada)'}</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <Button type="button" variant="outline" className="rounded-xl h-12 px-6 font-bold text-slate-600 border-slate-200 hover:bg-slate-50" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-12 px-8 font-bold shadow-lg shadow-emerald-600/20 transition-all active:scale-95" disabled={loading}>
                  {loading ? 'Creando Usuario...' : 'Guardar y Crear Cuenta'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-white border-slate-100 shadow-xl shadow-slate-200/50 rounded-[2rem] overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-8">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-black text-slate-900 uppercase tracking-wider">Cuentas Activas</CardTitle>
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-none px-4 py-1.5 rounded-full font-bold">
              {initialUsers.filter(u => u.status === 'activo').length} Activos
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <UserTable 
            initialUsers={initialUsers} 
            onEdit={(user) => {
              setEditingUser(user)
              setIsEditDialogOpen(true)
            }}
            onConfig={(user) => {
              setConfigUser(user)
              setIsConfigDialogOpen(true)
            }}
          />
        </CardContent>
      </Card>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="bg-white border-slate-200 text-slate-900 max-w-md rounded-3xl p-8 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black">Editar Perfil</DialogTitle>
            <DialogDescription className="text-slate-500 font-medium">
              Ajusta los privilegios o el estado del usuario.
            </DialogDescription>
          </DialogHeader>
          {editingUser && (
            <form onSubmit={handleUpdate} className="space-y-6 pt-6">
              <div className="grid gap-6">
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label className="font-bold text-slate-700 ml-1">Nombre</Label>
                    <Input name="full_name" defaultValue={editingUser.full_name} required className="bg-slate-50 border-slate-200 rounded-xl py-6" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-bold text-slate-700 ml-1">Usuario</Label>
                    <Input name="username" defaultValue={editingUser.username} required className="bg-slate-50 border-slate-200 rounded-xl py-6" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="font-bold text-slate-700 ml-1">Rol</Label>
                    <Select name="role" defaultValue={editingUser.role}>
                      <SelectTrigger className="bg-slate-50 border-slate-200 rounded-xl py-6">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-slate-200">
                        <SelectItem value="admin" className="focus:bg-emerald-50 py-3">Admin</SelectItem>
                        <SelectItem value="vendedor" className="focus:bg-emerald-50 py-3">Vendedor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="font-bold text-slate-700 ml-1">Estado</Label>
                    <Select name="status" defaultValue={editingUser.status}>
                      <SelectTrigger className="bg-slate-50 border-slate-200 rounded-xl py-6">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-slate-200">
                        <SelectItem value="activo" className="focus:bg-emerald-50 py-3 text-emerald-600 font-bold">Activo</SelectItem>
                        <SelectItem value="inactivo" className="focus:bg-red-50 py-3 text-red-600 font-bold">Inactivo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <div className="flex gap-4 pt-4">
                <Button type="button" variant="ghost" className="flex-1 rounded-xl py-6 font-bold hover:bg-slate-50" onClick={() => setIsEditDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-6 font-bold shadow-xl shadow-emerald-600/20" disabled={loading}>
                  {loading ? 'Guardando...' : 'Guardar Cambios'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={isConfigDialogOpen} onOpenChange={setIsConfigDialogOpen}>
        <DialogContent className="bg-white border-slate-200 text-slate-900 max-w-md rounded-3xl p-8 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black flex items-center">
              <Settings className="w-6 h-6 mr-2 text-slate-700" />
              Configurar Contraseña
            </DialogTitle>
            <DialogDescription className="text-slate-500 font-medium">
              Cambiar la contraseña del usuario {configUser?.full_name}. Requiere permisos avanzados en el servidor.
            </DialogDescription>
          </DialogHeader>
          {configUser && (
            <form onSubmit={handleConfigSubmit} className="space-y-6 pt-6">
              <div className="space-y-3">
                <Label className="text-xs font-black text-slate-500 uppercase tracking-widest">Nueva Contraseña</Label>
                <Input 
                  type="password" 
                  value={newConfigPassword}
                  onChange={(e) => setNewConfigPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="h-12 rounded-xl bg-slate-50 border-slate-200 font-medium px-4"
                  required
                />
              </div>
              <div className="flex gap-4 pt-4">
                <Button type="button" variant="ghost" className="flex-1 rounded-xl py-6 font-bold hover:bg-slate-50" onClick={() => setIsConfigDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" className="flex-1 bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-6 font-bold" disabled={loading}>
                  {loading ? 'Guardando...' : 'Actualizar'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
