/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState } from 'react'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { 
  Pencil, 
  Trash2, 
  Shield, 
  ShieldCheck, 
  Mail,
  Loader2,
  Settings
} from 'lucide-react'
import { toast } from 'sonner'
import { deleteUser } from '@/app/actions/usuarios'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

interface UserTableProps {
  initialUsers: any[]
  onEdit: (user: any) => void
  onConfig: (user: any) => void
}

export function UserTable({ initialUsers, onEdit, onConfig }: UserTableProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const router = useRouter()

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este usuario?')) return
    
    setLoading(id)
    const result = await deleteUser(id)
    
    if (result.success) {
      toast.success('Usuario eliminado')
      router.refresh()
    } else {
      toast.error(result.error || 'Error al eliminar')
    }
    setLoading(null)
  }

  const getAvatarColor = (name: string) => {
    const colors = [
      'bg-emerald-50 text-emerald-600 border-emerald-100',
      'bg-blue-50 text-blue-600 border-blue-100',
      'bg-indigo-50 text-indigo-600 border-indigo-100',
      'bg-purple-50 text-purple-600 border-purple-100',
      'bg-rose-50 text-rose-600 border-rose-100',
      'bg-amber-50 text-amber-600 border-amber-100',
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
  }

  if (initialUsers.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-slate-400 gap-4">
        <div className="bg-slate-50 p-4 rounded-full">
          <Mail className="h-8 w-8" />
        </div>
        <p className="font-bold">No se encontraron usuarios registrados.</p>
      </div>
    )
  }

  return (
    <Table>
      <TableHeader className="bg-slate-50/50">
        <TableRow className="border-slate-100 hover:bg-transparent">
          <TableHead className="text-slate-500 font-black uppercase tracking-widest text-[10px] py-6 px-8 w-[350px]">Empleado</TableHead>
          <TableHead className="text-slate-500 font-black uppercase tracking-widest text-[10px] py-6">Rol</TableHead>
          <TableHead className="text-slate-500 font-black uppercase tracking-widest text-[10px] py-6">Estado</TableHead>
          <TableHead className="text-slate-500 font-black uppercase tracking-widest text-[10px] py-6 text-right px-8">Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {initialUsers.map((user) => (
          <TableRow key={user.id} className="border-slate-50 hover:bg-slate-50/50 transition-colors">
            <TableCell className="px-8 py-5">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "h-12 w-12 rounded-2xl flex items-center justify-center font-black text-base border-2 shadow-sm transition-transform hover:scale-110",
                  getAvatarColor(user.full_name || '')
                )}>
                  {user.full_name?.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col">
                  <span className="font-black text-slate-900 text-base leading-tight">{user.full_name}</span>
                  <span className="text-xs text-slate-400 font-bold flex items-center gap-1.5 mt-1">
                    <Mail className="h-3 w-3" /> {user.username}
                  </span>
                </div>
              </div>
            </TableCell>
            <TableCell className="py-5">
              <div className={cn(
                "inline-flex items-center gap-2 px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest border",
                user.role === 'admin' 
                  ? "bg-purple-50 text-purple-700 border-purple-100" 
                  : "bg-blue-50 text-blue-700 border-blue-100"
              )}>
                {user.role === 'admin' ? <Shield className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
                {user.role}
              </div>
            </TableCell>
            <TableCell className="py-5">
              <div className={cn(
                "inline-flex items-center px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest",
                user.status === 'activo' 
                  ? "bg-emerald-50 text-emerald-600" 
                  : "bg-red-50 text-red-600"
              )}>
                <div className={cn("h-1.5 w-1.5 rounded-full mr-2 shadow-sm", user.status === 'activo' ? "bg-emerald-500 shadow-emerald-500/50" : "bg-red-500 shadow-red-500/50")} />
                {user.status}
              </div>
            </TableCell>
            <TableCell className="text-right px-8 py-5">
              <div className="flex justify-end gap-2">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-11 w-11 rounded-2xl hover:bg-slate-100 text-slate-400 hover:text-slate-900 transition-all active:scale-95"
                  onClick={() => onConfig(user)}
                  title="Configuración"
                >
                  <Settings className="h-5 w-5" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-11 w-11 rounded-2xl hover:bg-slate-100 text-slate-400 hover:text-slate-900 transition-all active:scale-95"
                  onClick={() => onEdit(user)}
                  title="Editar"
                >
                  <Pencil className="h-5 w-5" />
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-11 w-11 rounded-2xl hover:bg-red-50 text-slate-400 hover:text-red-600 transition-all active:scale-95"
                  disabled={loading === user.id}
                  onClick={() => handleDelete(user.id)}
                >
                  {loading === user.id ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Trash2 className="h-5 w-5" />
                  )}
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
