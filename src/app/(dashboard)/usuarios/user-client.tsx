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
  Settings
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
          <DialogContent className="bg-white border-slate-200 text-slate-900 max-w-md rounded-3xl p-8 shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black">Registrar Empleado</DialogTitle>
              <DialogDescription className="text-slate-500 font-medium pt-1">
                Completa los datos para crear una nueva cuenta.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6 pt-6">
              <div className="grid gap-6">
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label className="font-bold text-slate-700 ml-1">Nombre Completo</Label>
                    <Input name="full_name" required className="bg-slate-50 border-slate-200 rounded-xl py-6 focus:ring-emerald-500" placeholder="Ej: Juan Pérez" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-bold text-slate-700 ml-1">Nombre de Usuario</Label>
                    <Input name="username" required className="bg-slate-50 border-slate-200 rounded-xl py-6 focus:ring-emerald-500" placeholder="Ej: jperez" />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label className="font-bold text-slate-700 ml-1">Correo Electrónico</Label>
                    <Input name="email" type="email" required className="bg-slate-50 border-slate-200 rounded-xl py-6 focus:ring-emerald-500" placeholder="correo@ejemplo.com" />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-bold text-slate-700 ml-1">Contraseña</Label>
                    <Input 
                      name="password" 
                      type="password" 
                      required 
                      className="bg-slate-50 border-slate-200 rounded-xl py-6 focus:ring-emerald-500" 
                      placeholder="******"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    {password && (
                      <div className="space-y-1.5 mt-3 px-1">
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-500 ${getStrengthColor(strength)}`} 
                            style={{ width: `${strength}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black">
                          Seguridad: <span className={strength > 50 ? 'text-emerald-600' : 'text-amber-500'}>{strength <= 50 ? 'Baja' : strength <= 75 ? 'Media' : 'Alta'}</span>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold text-slate-700 ml-1">Rol en la Farmacia</Label>
                  <Select name="role" defaultValue="vendedor">
                    <SelectTrigger className="bg-slate-50 border-slate-200 rounded-xl py-6">
                      <SelectValue placeholder="Seleccionar rol" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-200">
                      <SelectItem value="admin" className="focus:bg-emerald-50 py-3">Administrador</SelectItem>
                      <SelectItem value="vendedor" className="focus:bg-emerald-50 py-3">Vendedor / Farmacéutico</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-7 text-lg font-bold shadow-xl shadow-emerald-600/20" disabled={loading}>
                {loading ? 'Creando...' : 'Finalizar Registro'}
              </Button>
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
