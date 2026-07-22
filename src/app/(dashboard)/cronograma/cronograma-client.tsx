/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Calendar as CalendarIcon,
  Clock,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Edit3,
  UserCheck,
  History,
  X,
  ArrowLeft,
  Printer,
  FilterX,
  AlertTriangle,
  Download,
  Copy,
  CheckCircle2,
  Users,
  BarChart3
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog'
import { createTurno, deleteTurno, updateTurno, clonePreviousMonth } from '@/app/actions/cronograma'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface CronogramaClientProps {
  initialTurnos: any[]
  usuarios: any[]
}

const SHIFT_TIMES: Record<string, string> = {
  'Apertura': '06:00 - 14:00',
  'Cierre': '14:00 - 22:00',
  'Turno Largo': '08:00 - 20:00'
}

const getDaysInMonth = (date: Date) => {
  const year = date.getFullYear()
  const month = date.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  const days = []
  const startOffset = (firstDay.getDay() + 6) % 7

  for (let i = 0; i < startOffset; i++) {
    days.push(null)
  }

  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d))
  }
  return days
}

const isSameDay = (d1: Date, d2: Date) => {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
}

const formatMonth = (date: Date) => {
  return new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' }).format(date)
}

const getDayName = (dateStr: string) => {
  const date = new Date(dateStr + 'T00:00:00')
  return new Intl.DateTimeFormat('es', { weekday: 'long' }).format(date)
}

export function CronogramaClient({ initialTurnos, usuarios }: CronogramaClientProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [userFilter, setUserFilter] = useState<string | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedTurno, setSelectedTurno] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const days = getDaysInMonth(currentMonth)

  // Motor de filtrado avanzado
  const filteredTurnos = useMemo(() => {
    return initialTurnos.filter(t => {
      const matchesType = activeFilter ? t.turno === activeFilter : true
      const matchesUser = userFilter ? t.usuario_id === userFilter : true
      return matchesType && matchesUser
    })
  }, [initialTurnos, activeFilter, userFilter])

  // Turnos del mes actual (para la planilla de impresión y vista)
  const monthTurnos = useMemo(() => {
    return filteredTurnos
      .filter(t => {
        const d = new Date(t.fecha + 'T00:00:00')
        return d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear()
      })
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
  }, [filteredTurnos, currentMonth])

  // Estadísticas (siempre sobre el mes completo para veracidad)
  const stats = useMemo(() => {
    const totals: Record<string, { name: string, hours: number, count: number }> = {}
    initialTurnos
      .filter(t => {
        const d = new Date(t.fecha + 'T00:00:00')
        return d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear()
      })
      .forEach(t => {
        const uid = t.usuario_id
        if (!totals[uid]) totals[uid] = { name: t.profiles.full_name, hours: 0, count: 0 }
        const hours = t.turno === 'Turno Largo' ? 12 : 8
        totals[uid].hours += hours
        totals[uid].count += 1
      })
    return Object.values(totals).sort((a, b) => b.hours - a.hours)
  }, [initialTurnos, currentMonth])

  const getTurnoStyles = (turno: string) => {
    switch (turno) {
      case 'Apertura': return 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100 shadow-sm'
      case 'Cierre': return 'bg-sky-50 text-sky-700 border-sky-100 hover:bg-sky-100 shadow-sm'
      case 'Turno Largo': return 'bg-violet-50 text-violet-700 border-violet-100 hover:bg-violet-100 shadow-sm'
      default: return 'bg-slate-50 text-slate-700 border-slate-100'
    }
  }

  // Exportar a CSV
  const handleExportCSV = () => {
    const headers = ['Fecha', 'Dia', 'Empleado', 'Turno', 'Horas']
    const rows = monthTurnos.map(t => [
      t.fecha,
      getDayName(t.fecha),
      t.profiles.full_name,
      t.turno,
      t.turno === 'Turno Largo' ? '12' : '8'
    ])

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n")
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    link.setAttribute("download", `cronograma_${formatMonth(currentMonth).replace(' ', '_')}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success('Excel/CSV exportado con éxito')
  }

  // Clonar mes
  const handleCloneMonth = async () => {
    if (!confirm('Esto copiará todos los turnos del mes pasado al mes actual. ¿Continuar?')) return
    setLoading(true)
    const result = await clonePreviousMonth(currentMonth.toISOString().split('T')[0])
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success(`${result.count} turnos clonados correctamente`)
      router.refresh()
    }
    setLoading(false)
  }

  const handleDayClick = (day: Date) => {
    const formattedDate = day.toISOString().split('T')[0]
    setSelectedDate(formattedDate)
    setIsCreateDialogOpen(true)
  }

  const handleTurnoClick = (turno: any, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedTurno(turno)
    setIsEditing(false)
    setIsDetailDialogOpen(true)
  }

  const handleCreateTurno = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const result = await createTurno(formData)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Turno asignado correctamente')
      setIsCreateDialogOpen(false)
      setSelectedDate('')
      router.refresh()
    }
    setLoading(false)
  }

  const handleUpdateTurno = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selectedTurno) return
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    const result = await updateTurno(selectedTurno.id, formData)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Turno actualizado')
      setIsDetailDialogOpen(false)
      setIsEditing(false)
      router.refresh()
    }
    setLoading(false)
  }

  const handleDeleteTurno = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este turno?')) return
    const result = await deleteTurno(id)
    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success('Turno eliminado')
      setIsDetailDialogOpen(false)
      router.refresh()
    }
  }

  const handlePrint = () => window.print()
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))

  return (
    <div className="flex flex-col gap-10">
      {/* VERSIÓN PARA IMPRIMIR (PLANILLA OFICIAL) */}
      <div className="print-only">
        <div className="print-header">
          <h1 className="text-3xl font-black uppercase tracking-widest text-slate-900">TechPharmacy</h1>
          <p className="text-xl font-bold text-slate-600 mt-2">
            Control de Personal - {formatMonth(currentMonth)}
          </p>
          {activeFilter && <p className="text-sm font-bold text-emerald-600 uppercase">Filtro de Horario: {activeFilter}</p>}
          <div className="mt-4 border-t-2 border-black w-24 mx-auto" />
        </div>

        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Día</th>
              <th>Empleado</th>
              <th>Turno</th>
              <th>Horario</th>
              <th>Firma</th>
            </tr>
          </thead>
          <tbody>
            {monthTurnos.map((t) => (
              <tr key={t.id}>
                <td className="font-bold">{new Date(t.fecha + 'T00:00:00').toLocaleDateString()}</td>
                <td className="capitalize">{getDayName(t.fecha)}</td>
                <td className="font-black uppercase">{t.profiles.full_name}</td>
                <td className="text-xs">{t.turno}</td>
                <td className="font-bold">{SHIFT_TIMES[t.turno]}</td>
                <td className="w-24 border-l-0"></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-20 flex justify-between px-10">
          <div className="text-center">
            <div className="border-t border-black w-48 mb-2" />
            <p className="text-xs font-bold uppercase">Administración</p>
          </div>
          <div className="text-center">
            <div className="border-t border-black w-48 mb-2" />
            <p className="text-xs font-bold uppercase">Regente Farmacéutico</p>
          </div>
        </div>
      </div>

      {/* VERSIÓN PARA PANTALLA */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 no-print">
        <div>
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-emerald-600 p-3 rounded-[1.25rem] shadow-xl shadow-emerald-600/20">
              <CalendarDays className="h-9 w-9 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-black text-slate-900 tracking-tight leading-none">Cronograma Central</h1>
              <p className="text-slate-400 font-bold mt-2 uppercase tracking-widest text-xs">Gestión Operativa de Personal</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={handleCloneMonth}
            variant="outline"
            disabled={loading}
            className="rounded-2xl py-6 px-6 font-bold border-slate-200 hover:bg-slate-50 transition-all gap-2"
          >
            <Copy className="h-5 w-5 text-slate-500" /> Clonar Mes Anterior
          </Button>
          <Button
            onClick={handleExportCSV}
            variant="outline"
            className="rounded-2xl py-6 px-6 font-bold border-slate-200 hover:bg-slate-50 transition-all gap-2"
          >
            <Download className="h-5 w-5 text-slate-500" /> Exportar CSV
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-600/20 px-8 py-7 rounded-2xl text-lg font-black transition-all hover:scale-105 active:scale-95 gap-3">
                <Plus className="h-6 w-6" /> Nuevo Turno
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white border-none shadow-2xl rounded-[2.5rem] p-10 max-w-md outline-none">
              <DialogHeader>
                <DialogTitle className="text-3xl font-black text-slate-900">Programar Turno</DialogTitle>
                <DialogDescription className="text-slate-500 font-bold">Asignación de responsabilidad horaria.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateTurno} className="space-y-8 pt-6">
                <div className="space-y-3">
                  <Label className="text-slate-800 font-black ml-1 text-sm uppercase tracking-wider">Empleado Responsable</Label>
                  <Select name="usuario_id" required>
                    <SelectTrigger className="bg-slate-50 border-none rounded-2xl py-7 px-6 shadow-inner">
                      <SelectValue placeholder="Seleccionar empleado" />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-slate-100 rounded-2xl p-2">
                      {usuarios.map(u => (
                        <SelectItem key={u.id} value={u.id} className="rounded-xl py-3 px-4 focus:bg-emerald-50 focus:text-emerald-700 font-bold">{u.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-8">
                  <div className="space-y-3">
                    <Label className="text-slate-800 font-black ml-1 text-sm uppercase tracking-wider">Fecha de Turno</Label>
                    <Input type="date" name="fecha" key={selectedDate} defaultValue={selectedDate} required className="bg-slate-50 border-none rounded-2xl py-7 px-6 shadow-inner" />
                  </div>
                  <div className="space-y-3">
                    <Label className="text-slate-800 font-black ml-1 text-sm uppercase tracking-wider">Horario de Operación</Label>
                    <Select name="turno" required>
                      <SelectTrigger className="bg-slate-50 border-none rounded-2xl py-7 px-6 shadow-inner">
                        <SelectValue placeholder="Tipo de turno" />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-slate-100 rounded-2xl p-2">
                        <SelectItem value="Apertura" className="rounded-xl py-3 px-4 focus:bg-emerald-50 font-bold">🌅 Apertura ({SHIFT_TIMES['Apertura']})</SelectItem>
                        <SelectItem value="Cierre" className="rounded-xl py-3 px-4 focus:bg-sky-50 font-bold">🌙 Cierre ({SHIFT_TIMES['Cierre']})</SelectItem>
                        <SelectItem value="Turno Largo" className="rounded-xl py-3 px-4 focus:bg-violet-50 font-bold">⌛ Turno Largo ({SHIFT_TIMES['Turno Largo']})</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl py-8 text-xl font-black shadow-2xl shadow-emerald-600/30" disabled={loading}>
                  {loading ? 'Validando...' : 'Confirmar Asignación'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-10 no-print">
        <div className="xl:col-span-3">
          <Card className="bg-white border-none shadow-2xl shadow-slate-200/60 rounded-[3rem] overflow-hidden">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-10 space-y-8">
              <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                <div className="flex items-center gap-8">
                  <Button variant="ghost" size="icon" className="h-14 w-14 rounded-2xl bg-white shadow-md border border-slate-50 hover:scale-110 transition-transform" onClick={prevMonth}>
                    <ChevronLeft className="h-7 w-7 text-slate-700" />
                  </Button>
                  <h2 className="text-4xl font-black text-slate-900 min-w-[300px] text-center capitalize tracking-tight">
                    {formatMonth(currentMonth)}
                  </h2>
                  <Button variant="ghost" size="icon" className="h-14 w-14 rounded-2xl bg-white shadow-md border border-slate-50 hover:scale-110 transition-transform" onClick={nextMonth}>
                    <ChevronRight className="h-7 w-7 text-slate-700" />
                  </Button>
                </div>

                <div className="flex items-center gap-4">
                  <div className="bg-white p-2 rounded-2xl border border-slate-200 flex items-center gap-2 shadow-sm">
                    <Users className="h-5 w-5 text-slate-400 ml-2" />
                    <Select value={userFilter || 'all'} onValueChange={(v) => setUserFilter(v === 'all' ? null : v)}>
                      <SelectTrigger className="border-none bg-transparent w-[180px] focus:ring-0 font-bold">
                        <SelectValue placeholder="Filtrar Empleado" />
                      </SelectTrigger>
                      <SelectContent className="bg-white rounded-2xl p-1">
                        <SelectItem value="all" className="font-bold">Todos los Empleados</SelectItem>
                        {usuarios.map(u => (
                          <SelectItem key={u.id} value={u.id} className="font-bold">{u.full_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 flex-wrap justify-center">
                {['Apertura', 'Cierre', 'Turno Largo'].map(type => (
                  <Button
                    key={type}
                    onClick={() => setActiveFilter(activeFilter === type ? null : type)}
                    variant="ghost"
                    className={cn(
                      "flex items-center gap-3 px-8 py-8 rounded-[1.5rem] border-2 transition-all hover:scale-105",
                      type === 'Apertura' ? "bg-emerald-50 text-emerald-700" :
                        type === 'Cierre' ? "bg-sky-50 text-sky-700" : "bg-violet-50 text-violet-700",
                      activeFilter === type ? "border-indigo-500 ring-[8px] ring-indigo-500/5 bg-white shadow-xl scale-105 opacity-100" : "border-transparent opacity-60 bg-white hover:bg-slate-50"
                    )}
                  >
                    <div className={cn("h-3 w-3 rounded-full shadow-sm",
                      type === 'Apertura' ? 'bg-emerald-500' :
                        type === 'Cierre' ? 'bg-sky-500' : 'bg-violet-500'
                    )} />
                    <span className="text-xs font-black uppercase tracking-[0.2em]">{type === 'Turno Largo' ? 'Largo' : type}</span>
                  </Button>
                ))}
              </div>

              {(activeFilter || userFilter) && (
                <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 px-6 py-3 mx-6 mt-6 mb-2 rounded-2xl animate-in fade-in duration-200">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
                    <p className="text-xs font-bold text-indigo-900">
                      Filtro activo: <span className="uppercase font-black text-indigo-700">{activeFilter || 'Usuario Seleccionado'}</span> ({filteredTurnos.length} resultados)
                    </p>
                  </div>
                  <button
                    onClick={() => { setActiveFilter(null); setUserFilter(null); }}
                    className="text-xs font-black text-indigo-600 hover:text-indigo-800 bg-white px-3 py-1.5 rounded-xl border border-indigo-200 shadow-sm transition-all active:scale-95"
                  >
                    Quitar Filtro ✕
                  </button>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid grid-cols-7 bg-slate-50/30 border-b border-slate-100">
                {['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'].map(d => (
                  <div key={d} className="py-6 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 auto-rows-[200px]">
                {days.map((day, i) => {
                  if (!day) return <div key={`empty-${i}`} className="bg-slate-50/10 border-r border-b border-slate-50" />

                  const dayTurnos = filteredTurnos.filter(t => isSameDay(new Date(t.fecha + 'T00:00:00'), day))
                  const isToday = isSameDay(day, new Date())

                  // Analizador de Cobertura Crítica
                  const hasApertura = dayTurnos.some(t => t.turno === 'Apertura' || t.turno === 'Turno Largo')
                  const hasCierre = dayTurnos.some(t => t.turno === 'Cierre' || t.turno === 'Turno Largo')
                  const isCritical = !hasApertura || !hasCierre

                  return (
                    <div
                      key={day.toString()}
                      onClick={() => handleDayClick(day)}
                      className={cn(
                        "p-6 border-r border-b border-slate-50 transition-all hover:bg-emerald-50/20 hover:z-10 hover:shadow-inner cursor-pointer relative group",
                        isToday ? 'bg-emerald-50/5' : ''
                      )}
                    >
                      <div className="flex justify-between items-center mb-4">
                        <span className={cn(
                          "text-2xl font-black transition-colors",
                          isToday ? "text-emerald-600" : "text-slate-100 group-hover:text-slate-300"
                        )}>
                          {day.getDate()}
                        </span>
                        {isCritical && !activeFilter && (
                          <div className="group/alert relative">
                            <AlertTriangle className="h-5 w-5 text-amber-500 fill-amber-100 animate-pulse" />
                            <div className="absolute bottom-full right-0 mb-2 w-48 bg-slate-900 text-white text-[10px] p-3 rounded-xl opacity-0 group-hover/alert:opacity-100 transition-opacity z-50 font-bold shadow-2xl">
                              ⚠️ Falta cobertura en {!hasApertura ? 'APERTURA' : 'CIERRE'}.
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="space-y-3 mt-2">
                        {dayTurnos.map(turno => (
                          <div
                            key={turno.id}
                            onClick={(e) => handleTurnoClick(turno, e)}
                            className={cn(
                              "group/item relative flex flex-col p-4 rounded-[1.5rem] border-2 transition-all hover:scale-105 hover:shadow-xl hover:z-20 cursor-pointer",
                              getTurnoStyles(turno.turno)
                            )}
                          >
                            <span className="text-[10px] font-black uppercase truncate tracking-tight">{turno.profiles.full_name}</span>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-[9px] font-black opacity-60 uppercase">{turno.turno}</span>
                              <CheckCircle2 className="h-3 w-3 opacity-0 group-hover/item:opacity-100 transition-opacity" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-10">
          {/* Tarjeta de Resumen Hoy */}
          <Card className="bg-white border-none shadow-2xl shadow-slate-200/60 rounded-[2.5rem] overflow-hidden p-10">
            <h3 className="text-xl font-black text-slate-900 uppercase tracking-[0.2em] flex items-center gap-4 mb-10">
              <div className="h-10 w-10 rounded-2xl bg-emerald-100 flex items-center justify-center">
                <Clock className="h-5 w-5 text-emerald-600" />
              </div>
              Operación Hoy
            </h3>
            <div className="space-y-5">
              {initialTurnos
                .filter(t => isSameDay(new Date(t.fecha + 'T00:00:00'), new Date()))
                .map(t => (
                  <div
                    key={t.id}
                    onClick={(e) => handleTurnoClick(t, e)}
                    className="group flex items-center gap-5 p-5 rounded-[2rem] bg-slate-50 hover:bg-white hover:shadow-xl transition-all border border-transparent hover:border-slate-100 cursor-pointer"
                  >
                    <div className={cn(
                      "h-14 w-14 rounded-2xl flex items-center justify-center font-black border-2 transition-transform group-hover:scale-110",
                      getTurnoStyles(t.turno)
                    )}>
                      {t.profiles.full_name.charAt(0)}
                    </div>
                    <div className="flex flex-col">
                      <p className="font-black text-slate-900 text-base">{t.profiles.full_name}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{t.turno}</p>
                    </div>
                  </div>
                ))}
              {initialTurnos.filter(t => isSameDay(new Date(t.fecha + 'T00:00:00'), new Date())).length === 0 && (
                <p className="text-sm font-bold text-slate-400 text-center italic py-4">No hay turnos hoy.</p>
              )}
            </div>
          </Card>

          {/* Tarjeta de Métricas y Acciones */}
          <Card className="bg-emerald-600 text-white shadow-[0_30px_60px_rgba(5,150,105,0.3)] rounded-[3rem] overflow-hidden p-10 relative group">
            <div className="absolute -top-10 -right-10 p-8 opacity-10 group-hover:rotate-45 transition-transform duration-700">
              <BarChart3 className="h-48 w-48" />
            </div>
            <h3 className="text-xl font-black uppercase tracking-[0.2em] mb-10 flex items-center gap-3 relative z-10">
              Métricas Mes
            </h3>

            <div className="space-y-6 mb-12 relative z-10">
              {stats.length > 0 ? stats.map(s => (
                <div key={s.name} className="flex flex-col gap-3 p-5 rounded-[1.75rem] bg-white/10 backdrop-blur-md border border-white/10 hover:bg-white/20 transition-all">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-black truncate max-w-[120px] uppercase tracking-wider">{s.name}</span>
                    <span className="text-2xl font-black">{s.hours}h</span>
                  </div>
                  <div className="w-full bg-emerald-900/40 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-white h-full rounded-full transition-all duration-1000"
                      style={{ width: `${Math.min((s.hours / 160) * 100, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest">{s.count} turnos</p>
                    {s.hours >= 160 && <CheckCircle2 className="h-4 w-4 text-emerald-300" />}
                  </div>
                </div>
              )) : (
                <p className="text-sm font-bold opacity-60 italic text-center py-4">Sin datos de actividad.</p>
              )}
            </div>

            <div className="space-y-4 relative z-10">
              <Button
                onClick={handlePrint}
                className="w-full bg-white text-emerald-700 hover:bg-emerald-50 rounded-2xl font-black py-7 text-lg shadow-xl shadow-black/5 transition-transform active:scale-95 gap-3"
              >
                <Printer className="h-6 w-6" /> Planilla PDF
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="bg-white border-none shadow-2xl rounded-[3rem] p-0 max-w-2xl overflow-hidden outline-none no-print">
          {selectedTurno && (
            <div className="flex flex-col">
              <div className={cn("p-12 text-white relative overflow-hidden transition-colors duration-500",
                selectedTurno.turno === 'Apertura' ? 'bg-emerald-600' :
                  selectedTurno.turno === 'Cierre' ? 'bg-sky-600' : 'bg-violet-600'
              )}>
                <div className="absolute top-0 right-0 p-12 opacity-10">
                  <CalendarDays className="h-48 w-48 rotate-12" />
                </div>
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-8">
                    <DialogTitle className="text-[10px] font-black uppercase tracking-[0.4em] opacity-80">
                      Asignación Técnica
                    </DialogTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsDetailDialogOpen(false)}
                      className="h-10 w-10 rounded-full hover:bg-white/20 text-white"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-8">
                    <div className="h-24 w-24 rounded-[2rem] bg-white/20 backdrop-blur-xl flex items-center justify-center font-black text-4xl border border-white/30 shadow-2xl">
                      {selectedTurno.profiles.full_name.charAt(0)}
                    </div>
                    <div>
                      <h2 className="text-5xl font-black tracking-tighter">{selectedTurno.profiles.full_name}</h2>
                      <p className="text-white/80 font-bold uppercase tracking-[0.2em] text-xs mt-3 flex items-center gap-2 bg-black/10 w-fit px-4 py-1.5 rounded-full">
                        <UserCheck className="h-4 w-4" /> {selectedTurno.profiles.role}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-12 bg-white space-y-12">
                <DialogDescription className="hidden">
                  Detalles operativos del turno de {selectedTurno.profiles.full_name}.
                </DialogDescription>

                {!isEditing ? (
                  <>
                    <div className="grid grid-cols-2 gap-12">
                      <div className="space-y-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Horario Definido</p>
                        <div className="flex items-center gap-4">
                          <div className="bg-slate-50 p-4 rounded-2xl shadow-inner">
                            <Clock className="h-7 w-7 text-slate-600" />
                          </div>
                          <span className="text-2xl font-black text-slate-900">{selectedTurno.turno}</span>
                        </div>
                        <p className="text-sm font-bold text-slate-400 ml-16">{SHIFT_TIMES[selectedTurno.turno]}</p>
                      </div>
                      <div className="space-y-4">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha Programada</p>
                        <div className="flex items-center gap-4">
                          <div className="bg-slate-50 p-4 rounded-2xl shadow-inner">
                            <CalendarIcon className="h-7 w-7 text-slate-600" />
                          </div>
                          <span className="text-2xl font-black text-slate-900">{selectedTurno.fecha}</span>
                        </div>
                        <p className="text-sm font-bold text-slate-400 ml-16 capitalize">{getDayName(selectedTurno.fecha)}</p>
                      </div>
                    </div>

                    <div className="p-8 rounded-[2.5rem] bg-slate-50 border border-slate-100 flex items-center gap-8 shadow-inner">
                      <div className="h-16 w-16 rounded-3xl bg-white flex items-center justify-center shadow-sm">
                        <History className="h-8 w-8 text-slate-300" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Trazabilidad de Auditoría</p>
                        <p className="text-slate-600 font-bold text-sm mt-1 leading-relaxed">
                          Registro consolidado el {new Date(selectedTurno.created_at).toLocaleDateString()} a las {new Date(selectedTurno.created_at).toLocaleTimeString()}.
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-4 pt-4">
                      <Button
                        variant="ghost"
                        className="flex-1 rounded-[1.75rem] py-8 font-black text-red-500 hover:bg-red-50 hover:text-red-600 transition-all text-base"
                        onClick={() => handleDeleteTurno(selectedTurno.id)}
                      >
                        <Trash2 className="h-6 w-6 mr-3" /> Eliminar Registro
                      </Button>
                      <Button
                        onClick={() => setIsEditing(true)}
                        className={cn("flex-1 rounded-[1.75rem] py-8 font-black text-white shadow-2xl transition-all hover:scale-105 active:scale-95 text-base",
                          selectedTurno.turno === 'Apertura' ? 'bg-emerald-600 shadow-emerald-600/30' :
                            selectedTurno.turno === 'Cierre' ? 'bg-sky-600 shadow-sky-600/30' : 'bg-violet-600 shadow-violet-600/30'
                        )}
                      >
                        <Edit3 className="h-6 w-6 mr-3" /> Modificar Horario
                      </Button>
                    </div>
                  </>
                ) : (
                  <form onSubmit={handleUpdateTurno} className="space-y-10 animate-in fade-in slide-in-from-bottom-6">
                    <div className="flex items-center gap-6 mb-4">
                      <Button type="button" variant="ghost" onClick={() => setIsEditing(false)} className="rounded-2xl h-14 w-14 p-0 hover:bg-slate-50">
                        <ArrowLeft className="h-8 w-8 text-slate-600" />
                      </Button>
                      <h3 className="text-3xl font-black text-slate-900 tracking-tight">Editar Asignación</h3>
                    </div>

                    <div className="grid grid-cols-1 gap-10">
                      <div className="space-y-4">
                        <Label className="text-slate-800 font-black ml-2 text-xs uppercase tracking-[0.2em]">Responsable</Label>
                        <Select name="usuario_id" defaultValue={selectedTurno.usuario_id} required>
                          <SelectTrigger className="bg-slate-50 border-none rounded-[1.75rem] py-8 px-8 shadow-inner font-bold text-lg">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white border-slate-100 rounded-2xl p-2">
                            {usuarios.map(u => (
                              <SelectItem key={u.id} value={u.id} className="font-bold py-4">{u.full_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-4">
                        <Label className="text-slate-800 font-black ml-2 text-xs uppercase tracking-[0.2em]">Nueva Fecha</Label>
                        <Input type="date" name="fecha" defaultValue={selectedTurno.fecha} required className="bg-slate-50 border-none rounded-[1.75rem] py-8 px-8 shadow-inner font-bold text-lg focus:ring-2 focus:ring-emerald-500" />
                      </div>
                      <div className="space-y-4">
                        <Label className="text-slate-800 font-black ml-2 text-xs uppercase tracking-[0.2em]">Horario</Label>
                        <Select name="turno" defaultValue={selectedTurno.turno} required>
                          <SelectTrigger className="bg-slate-50 border-none rounded-[1.75rem] py-8 px-8 shadow-inner font-bold text-lg">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white border-slate-100 rounded-2xl p-2">
                            <SelectItem value="Apertura" className="rounded-xl py-4 font-bold">🌅 Apertura</SelectItem>
                            <SelectItem value="Cierre" className="rounded-xl py-4 font-bold">🌙 Cierre</SelectItem>
                            <SelectItem value="Turno Largo" className="rounded-xl py-4 font-bold">⌛ Turno Largo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex gap-6 pt-6">
                      <Button type="button" variant="ghost" className="flex-1 rounded-[1.75rem] py-8 font-black text-slate-400 hover:bg-slate-50 text-base" onClick={() => setIsEditing(false)}>
                        Cancelar
                      </Button>
                      <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[1.75rem] py-8 font-black shadow-2xl shadow-emerald-600/30 text-base" disabled={loading}>
                        {loading ? 'Validando...' : 'Aplicar Cambios'}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
