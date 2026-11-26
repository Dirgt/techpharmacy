'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Building2,
  Globe,
  Copy,
  ExternalLink,
  Plus,
  Pencil,
  UserPlus,
  Users,
  ShieldCheck,
  Shield,
  User,
  Activity,
  Package,
  ReceiptText,
  TrendingUp,
  Search,
  ArrowRightLeft,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Crown,
  KeyRound,
  Terminal,
  LogIn,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'
import {
  buildDrogueriaUrl,
  isTenantSuspended,
  PLAN_CONFIG,
  TenantPlan,
  TenantStatus,
} from '@/lib/tenant/domain'
import {
  API_SCOPE_LABELS,
  API_SCOPES,
  ApiScope,
} from '@/lib/api/api-key-utils'
import {
  assignUserDrogueriaAndRole,
  createApiKeyForDrogueria,
  createDrogueria,
  createUserForDrogueria,
  DrogueriaOverview,
  PlatformOverviewData,
  PlatformUserOverview,
  resetPlatformUserPassword,
  revokeApiKey,
  switchSuperAdminWorkspace,
  toggleDrogueriaStatus,
  updateDrogueria,
} from '@/app/actions/superadmin'

type SuperAdminTab = 'droguerias' | 'usuarios' | 'apikeys'

export function DrogueriasClient({
  initialData,
  initialTab = 'droguerias',
}: {
  initialData: PlatformOverviewData
  initialTab?: SuperAdminTab
}) {
  const router = useRouter()
  const data = initialData
  const [activeTab, setActiveTab] = useState<SuperAdminTab>(initialTab)
  const [prevInitialTab, setPrevInitialTab] = useState<SuperAdminTab>(initialTab)

  if (initialTab !== prevInitialTab) {
    setPrevInitialTab(initialTab)
    setActiveTab(initialTab)
  }

  useEffect(() => {
    const handleTabChange = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail
      if (detail === 'droguerias' || detail === 'usuarios' || detail === 'apikeys') {
        setActiveTab(detail)
      }
    }
    window.addEventListener('droguerias-tab-change', handleTabChange)
    return () => window.removeEventListener('droguerias-tab-change', handleTabChange)
  }, [])

  const switchTab = (tab: SuperAdminTab) => {
    setActiveTab(tab)
    const targetUrl =
      tab === 'usuarios'
        ? '/droguerias?tab=usuarios'
        : tab === 'apikeys'
          ? '/droguerias?tab=apikeys'
          : '/droguerias'
    window.history.replaceState(null, '', targetUrl)
    window.dispatchEvent(new CustomEvent('droguerias-tab-change', { detail: tab }))
  }
  const [searchDrogueria, setSearchDrogueria] = useState('')
  const [searchUsuario, setSearchUsuario] = useState('')
  const [filterDrogueriaId, setFilterDrogueriaId] = useState<string>('all')

  // Modal Droguería (crear / editar)
  const [isDrogueriaOpen, setIsDrogueriaOpen] = useState(false)
  const [editingDrogueria, setEditingDrogueria] = useState<DrogueriaOverview | null>(null)
  const [savingDrogueria, setSavingDrogueria] = useState(false)
  const [drogueriaForm, setDrogueriaForm] = useState({
    nombre: '',
    subdominio: '',
    url_personalizada: '',
    nit: '',
    regimen: '',
    telefono: '',
    direccion: '',
    plan: 'basico' as TenantPlan,
    estado: 'activo' as TenantStatus,
    max_usuarios: 5,
    fecha_vencimiento: '',
    motivo_suspension: '',
  })

  // Modal / acción rápida Suspender Droguería
  const [suspendingDrogueria, setSuspendingDrogueria] = useState<DrogueriaOverview | null>(null)
  const [suspensionReason, setSuspensionReason] = useState('')
  const [togglingStatusId, setTogglingStatusId] = useState<string | null>(null)

  // Modal API Key (crear / revelar)
  const [isNewApiKeyOpen, setIsNewApiKeyOpen] = useState(false)
  const [savingApiKey, setSavingApiKey] = useState(false)
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null)
  const [apiKeyForm, setApiKeyForm] = useState({
    drogueria_id: '',
    nombre: '',
    scopes: ['read:productos', 'read:inventario', 'read:facturas', 'read:clientes'] as ApiScope[],
    expires_at: '',
  })
  const [revealedKeyModal, setRevealedKeyModal] = useState<{
    rawKey: string
    nombre: string
    drogueriaNombre: string
  } | null>(null)

  // Modal Crear Usuario en Droguería
  const [isNewUserOpen, setIsNewUserOpen] = useState(false)
  const [savingNewUser, setSavingNewUser] = useState(false)
  const [newUserForm, setNewUserForm] = useState({
    drogueria_id: '',
    full_name: '',
    username: '',
    email: '',
    password: '',
    role: 'admin' as 'superadmin' | 'admin' | 'vendedor',
  })

  // Modal Reasignar / Editar Usuario
  const [editingUser, setEditingUser] = useState<PlatformUserOverview | null>(null)
  const [savingAssign, setSavingAssign] = useState(false)
  const [assignForm, setAssignForm] = useState({
    drogueria_id: '',
    role: 'vendedor' as 'superadmin' | 'admin' | 'vendedor',
    status: 'activo' as 'activo' | 'inactivo',
  })
  const [newResetPassword, setNewResetPassword] = useState('')
  const [savingResetPassword, setSavingResetPassword] = useState(false)
  const [enteringDrogueriaId, setEnteringDrogueriaId] = useState<string | null>(null)

  const usersByDrogueria = useMemo(() => {
    const roleWeight: Record<string, number> = {
      superadmin: 0,
      admin: 1,
      vendedor: 2,
    }
    const map = new Map<string, PlatformUserOverview[]>()

    for (const u of data.usuarios) {
      if (!u.drogueria_id) continue
      const list = map.get(u.drogueria_id) || []
      list.push(u)
      map.set(u.drogueria_id, list)
    }

    for (const [key, list] of map.entries()) {
      list.sort((a, b) => {
        const rwA = roleWeight[a.role || ''] ?? 3
        const rwB = roleWeight[b.role || ''] ?? 3
        if (rwA !== rwB) return rwA - rwB

        const stA = a.status === 'activo' ? 0 : 1
        const stB = b.status === 'activo' ? 0 : 1
        if (stA !== stB) return stA - stB

        return (a.full_name || a.username).localeCompare(b.full_name || b.username)
      })
      map.set(key, list)
    }

    return map
  }, [data.usuarios])

  const filteredDroguerias = useMemo(() => {
    const q = searchDrogueria.trim().toLowerCase()
    if (!q) return data.droguerias
    return data.droguerias.filter((d) => {
      const tenantUsers = usersByDrogueria.get(d.id) || []
      return (
        d.nombre.toLowerCase().includes(q) ||
        d.subdominio.toLowerCase().includes(q) ||
        (d.url_personalizada || '').toLowerCase().includes(q) ||
        (d.nit || '').toLowerCase().includes(q) ||
        tenantUsers.some(
          (u) =>
            (u.full_name || '').toLowerCase().includes(q) ||
            u.username.toLowerCase().includes(q) ||
            (u.email || '').toLowerCase().includes(q)
        )
      )
    })
  }, [data.droguerias, searchDrogueria, usersByDrogueria])

  const filteredUsuarios = useMemo(() => {
    const q = searchUsuario.trim().toLowerCase()
    return data.usuarios.filter((u) => {
      if (filterDrogueriaId !== 'all' && u.drogueria_id !== filterDrogueriaId) return false
      if (!q) return true
      return (
        (u.full_name || '').toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        u.drogueria_nombre.toLowerCase().includes(q)
      )
    })
  }, [data.usuarios, filterDrogueriaId, searchUsuario])

  const openCreateDrogueria = () => {
    setEditingDrogueria(null)
    setDrogueriaForm({
      nombre: '',
      subdominio: '',
      url_personalizada: '',
      nit: '',
      regimen: '',
      telefono: '',
      direccion: '',
      plan: 'basico',
      estado: 'activo',
      max_usuarios: PLAN_CONFIG.basico.defaultMaxUsers,
      fecha_vencimiento: '',
      motivo_suspension: '',
    })
    setIsDrogueriaOpen(true)
  }

  const openEditDrogueria = (d: DrogueriaOverview) => {
    setEditingDrogueria(d)
    setDrogueriaForm({
      nombre: d.nombre,
      subdominio: d.subdominio,
      url_personalizada: d.url_personalizada || '',
      nit: d.nit || '',
      regimen: d.regimen || '',
      telefono: d.telefono || '',
      direccion: d.direccion || '',
      plan: (d.plan as TenantPlan) || 'basico',
      estado: (d.estado as TenantStatus) || 'activo',
      max_usuarios: d.max_usuarios ?? 5,
      fecha_vencimiento: d.fecha_vencimiento || '',
      motivo_suspension: d.motivo_suspension || '',
    })
    setIsDrogueriaOpen(true)
  }

  const handleSaveDrogueria = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingDrogueria(true)
    const payload = {
      nombre: drogueriaForm.nombre,
      subdominio: drogueriaForm.subdominio,
      url_personalizada: drogueriaForm.url_personalizada || null,
      nit: drogueriaForm.nit || null,
      regimen: drogueriaForm.regimen || null,
      telefono: drogueriaForm.telefono || null,
      direccion: drogueriaForm.direccion || null,
      plan: drogueriaForm.plan,
      estado: drogueriaForm.estado,
      max_usuarios: Number(drogueriaForm.max_usuarios) || 5,
      fecha_vencimiento: drogueriaForm.fecha_vencimiento || null,
      motivo_suspension:
        drogueriaForm.estado === 'suspendido' ? drogueriaForm.motivo_suspension || null : null,
    }

    const res = editingDrogueria
      ? await updateDrogueria(editingDrogueria.id, payload)
      : await createDrogueria(payload)

    if (res.success) {
      toast.success(editingDrogueria ? 'Droguería actualizada' : 'Droguería creada')
      setIsDrogueriaOpen(false)
      router.refresh()
    } else {
      toast.error(res.error || 'Error al guardar la droguería')
    }
    setSavingDrogueria(false)
  }

  const handleConfirmSuspend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!suspendingDrogueria) return
    setTogglingStatusId(suspendingDrogueria.id)
    const res = await toggleDrogueriaStatus({
      drogueria_id: suspendingDrogueria.id,
      estado: 'suspendido',
      motivo_suspension: suspensionReason || null,
    })
    if (res.success) {
      toast.success(`Servicio suspendido para ${suspendingDrogueria.nombre}`)
      setSuspendingDrogueria(null)
      setSuspensionReason('')
      router.refresh()
    } else {
      toast.error(res.error || 'No se pudo suspender la droguería')
    }
    setTogglingStatusId(null)
  }

  const handleActivateDrogueria = async (d: DrogueriaOverview) => {
    setTogglingStatusId(d.id)
    const res = await toggleDrogueriaStatus({
      drogueria_id: d.id,
      estado: 'activo',
      motivo_suspension: null,
    })
    if (res.success) {
      toast.success(`${d.nombre} reactivada correctamente`)
      router.refresh()
    } else {
      toast.error(res.error || 'No se pudo activar la droguería')
    }
    setTogglingStatusId(null)
  }

  const openCreateUser = (drogueriaId?: string) => {
    setNewUserForm({
      drogueria_id: drogueriaId || data.droguerias[0]?.id || '',
      full_name: '',
      username: '',
      email: '',
      password: '',
      role: 'admin',
    })
    setIsNewUserOpen(true)
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingNewUser(true)
    const res = await createUserForDrogueria(newUserForm)
    if (res.success) {
      toast.success('Usuario creado y asignado correctamente')
      setIsNewUserOpen(false)
      router.refresh()
    } else {
      toast.error(res.error || 'Error al crear el usuario')
    }
    setSavingNewUser(false)
  }

  const openAssignModal = (u: PlatformUserOverview) => {
    setEditingUser(u)
    setNewResetPassword('')
    setAssignForm({
      drogueria_id: u.drogueria_id || data.droguerias[0]?.id || '',
      role: (u.role as 'superadmin' | 'admin' | 'vendedor') || 'vendedor',
      status: (u.status as 'activo' | 'inactivo') || 'activo',
    })
  }

  const handleEnterDrogueria = async (d: DrogueriaOverview) => {
    setEnteringDrogueriaId(d.id)
    const res = await switchSuperAdminWorkspace(d.id)
    if (res.success) {
      toast.success(`Entrando a ${d.nombre} en Modo Soporte`)
      router.push('/dashboard')
      router.refresh()
    } else {
      toast.error(res.error || 'No se pudo entrar a la droguería')
      setEnteringDrogueriaId(null)
    }
  }

  const handleResetUserPassword = async () => {
    if (!editingUser) return
    if (!newResetPassword || newResetPassword.length < 6) {
      toast.error('La nueva contraseña debe tener al menos 6 caracteres')
      return
    }
    setSavingResetPassword(true)
    const res = await resetPlatformUserPassword({
      user_id: editingUser.id,
      password: newResetPassword,
    })
    if (res.success) {
      toast.success(
        `Contraseña actualizada para ${editingUser.full_name || editingUser.username}`
      )
      setNewResetPassword('')
    } else {
      toast.error(res.error || 'No se pudo actualizar la contraseña')
    }
    setSavingResetPassword(false)
  }

  const handleAssignUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return
    setSavingAssign(true)
    const res = await assignUserDrogueriaAndRole({
      user_id: editingUser.id,
      drogueria_id: assignForm.role === 'superadmin' ? null : assignForm.drogueria_id,
      role: assignForm.role,
      status: assignForm.status,
    })
    if (res.success) {
      toast.success('Usuario actualizado y reasignado')
      setEditingUser(null)
      router.refresh()
    } else {
      toast.error(res.error || 'Error al reasignar usuario')
    }
    setSavingAssign(false)
  }

  const copyUrl = async (url: string, label = 'URL copiada al portapapeles') => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success(label)
    } catch {
      toast.error('No se pudo copiar al portapapeles')
    }
  }

  const openCreateApiKey = () => {
    setApiKeyForm({
      drogueria_id: data.droguerias[0]?.id || '',
      nombre: '',
      scopes: ['read:productos', 'read:inventario', 'read:facturas', 'read:clientes'],
      expires_at: '',
    })
    setIsNewApiKeyOpen(true)
  }

  const toggleScope = (scope: ApiScope) => {
    setApiKeyForm((prev) => {
      const exists = prev.scopes.includes(scope)
      return {
        ...prev,
        scopes: exists ? prev.scopes.filter((s) => s !== scope) : [...prev.scopes, scope],
      }
    })
  }

  const handleCreateApiKey = async (e: React.FormEvent) => {
    e.preventDefault()
    setSavingApiKey(true)
    const res = await createApiKeyForDrogueria({
      drogueria_id: apiKeyForm.drogueria_id,
      nombre: apiKeyForm.nombre,
      scopes: apiKeyForm.scopes,
      expires_at: apiKeyForm.expires_at || null,
    })

    if (res.success && res.rawKey) {
      const drogueriaNombre =
        data.droguerias.find((d) => d.id === apiKeyForm.drogueria_id)?.nombre || 'Droguería'
      setIsNewApiKeyOpen(false)
      setRevealedKeyModal({
        rawKey: res.rawKey,
        nombre: apiKeyForm.nombre,
        drogueriaNombre,
      })
      toast.success('API Key generada correctamente')
      router.refresh()
    } else {
      toast.error(res.error || 'No se pudo generar la API Key')
    }
    setSavingApiKey(false)
  }

  const handleRevokeApiKey = async (id: string) => {
    setRevokingKeyId(id)
    const res = await revokeApiKey(id)
    if (res.success) {
      toast.success('API Key revocada')
      router.refresh()
    } else {
      toast.error(res.error || 'No se pudo revocar la API Key')
    }
    setRevokingKeyId(null)
  }

  const { resumenGlobal } = data

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-3">
            <div className="bg-indigo-600 p-2.5 rounded-2xl shadow-lg shadow-indigo-600/20">
              <Building2 className="h-7 w-7 text-white" />
            </div>
            Consola de Plataforma & Droguerías
          </h1>
          <p className="text-slate-500 font-medium mt-1">
            Administra sedes, URLs, administradores y el uso global de TechPharmacy. Haz clic en{' '}
            <strong className="text-emerald-700">&ldquo;Entrar al POS&rdquo;</strong> en cualquier
            sede para abrir su mostrador con tu cuenta SuperAdmin.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => openCreateUser()}
            className="rounded-xl font-bold border-slate-200"
          >
            <UserPlus className="h-4 w-4 mr-2 text-indigo-600" />
            Nuevo Usuario / Admin
          </Button>
          <Button
            onClick={openCreateDrogueria}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/20"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nueva Droguería
          </Button>
        </div>
      </div>

      {/* KPIs Globales */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          {
            label: 'Droguerías',
            val: resumenGlobal.totalDroguerias,
            sub: 'Sedes activas',
            icon: Building2,
            color: 'text-indigo-600',
            bg: 'bg-indigo-50',
          },
          {
            label: 'Usuarios Activos',
            val: `${resumenGlobal.usuariosActivos}/${resumenGlobal.totalUsuarios}`,
            sub: 'Cuentas habilitadas',
            icon: Users,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
          },
          {
            label: 'Productos',
            val: resumenGlobal.totalProductos,
            sub: 'Catálogo total',
            icon: Package,
            color: 'text-blue-600',
            bg: 'bg-blue-50',
          },
          {
            label: 'Facturas Emitidas',
            val: resumenGlobal.totalFacturas,
            sub: 'Uso transaccional',
            icon: ReceiptText,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
          },
          {
            label: 'Volumen Facturado',
            val: formatCurrency(resumenGlobal.volumenTotal),
            sub: 'Total plataforma',
            icon: TrendingUp,
            color: 'text-purple-600',
            bg: 'bg-purple-50',
          },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                {kpi.label}
              </span>
              <div className={`${kpi.bg} ${kpi.color} p-2 rounded-xl`}>
                <kpi.icon className="h-4 w-4" />
              </div>
            </div>
            <p className="text-2xl font-black text-slate-900 tracking-tight truncate">{kpi.val}</p>
            <span className="text-[11px] font-bold text-slate-400">{kpi.sub}</span>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        <button
          onClick={() => switchTab('droguerias')}
          className={`px-4 py-2.5 text-sm font-black rounded-t-xl border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'droguerias'
            ? 'border-indigo-600 text-indigo-700 bg-white'
            : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
        >
          <Building2 className="h-4 w-4" />
          Droguerías, URLs y Uso ({data.droguerias.length})
        </button>
        <button
          onClick={() => switchTab('usuarios')}
          className={`px-4 py-2.5 text-sm font-black rounded-t-xl border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'usuarios'
            ? 'border-indigo-600 text-indigo-700 bg-white'
            : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
        >
          <Users className="h-4 w-4" />
          Usuarios de la Plataforma ({data.usuarios.length})
        </button>
        <button
          onClick={() => switchTab('apikeys')}
          className={`px-4 py-2.5 text-sm font-black rounded-t-xl border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'apikeys'
            ? 'border-indigo-600 text-indigo-700 bg-white'
            : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
        >
          <KeyRound className="h-4 w-4" />
          API Keys & Integraciones ({data.apiKeys.length})
        </button>
      </div>

      {activeTab === 'droguerias' ? (
        <div className="space-y-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={searchDrogueria}
              onChange={(e) => setSearchDrogueria(e.target.value)}
              placeholder="Buscar droguería, URL, NIT o usuario..."
              className="pl-10 bg-white rounded-xl"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {filteredDroguerias.map((d) => {
              const url = buildDrogueriaUrl(d.subdominio, d.url_personalizada)
              const suspension = isTenantSuspended(d)
              const planLabel = PLAN_CONFIG[(d.plan as TenantPlan) || 'basico']?.label || d.plan
              const isQuotaFull = d.usuariosActivos >= d.max_usuarios
              return (
                <div
                  key={d.id}
                  className={`bg-white rounded-3xl border shadow-sm p-6 flex flex-col gap-5 ${
                    suspension.suspended ? 'border-rose-200 bg-rose-50/10' : 'border-slate-100'
                  }`}
                >
                  {/* Header card */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-xl font-black text-slate-900 truncate">{d.nombre}</h2>
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                            d.plan === 'enterprise'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : d.plan === 'pro'
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          <Crown className="h-3 w-3" /> {planLabel}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                            suspension.suspended
                              ? 'bg-rose-50 text-rose-700 border-rose-200'
                              : d.estado === 'prueba'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {suspension.expired
                            ? 'Vencido'
                            : d.estado === 'suspendido'
                              ? 'Suspendido'
                              : d.estado === 'prueba'
                                ? 'Prueba'
                                : 'Activo'}
                        </span>
                        {d.cajasAbiertas > 0 && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Activity className="h-3 w-3" /> Caja Abierta
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-bold text-slate-400 mt-0.5">
                        Subdominio: <span className="text-slate-600">{d.subdominio}</span>
                        {d.nit ? ` • NIT: ${d.nit}` : ''}
                        {d.fecha_vencimiento ? ` • Vence: ${d.fecha_vencimiento}` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      <Button
                        size="sm"
                        disabled={enteringDrogueriaId === d.id}
                        onClick={() => handleEnterDrogueria(d)}
                        title="Entrar al mostrador y panel de esta droguería con tu cuenta SuperAdmin"
                        className="rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                      >
                        <LogIn className="h-3.5 w-3.5 mr-1.5" />
                        {enteringDrogueriaId === d.id ? 'Entrando...' : 'Entrar al POS'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openCreateUser(d.id)}
                        className="rounded-xl text-xs font-bold"
                      >
                        <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                        + Usuario
                      </Button>
                      {d.estado === 'suspendido' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={togglingStatusId === d.id}
                          onClick={() => handleActivateDrogueria(d)}
                          title="Reactivar servicio"
                          className="rounded-xl text-xs font-bold text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Activar
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={togglingStatusId === d.id}
                          onClick={() => {
                            setSuspendingDrogueria(d)
                            setSuspensionReason(d.motivo_suspension || '')
                          }}
                          title="Suspender servicio"
                          className="rounded-xl text-xs font-bold text-rose-700 border-rose-200 hover:bg-rose-50"
                        >
                          <Ban className="h-3.5 w-3.5 mr-1" />
                          Suspender
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditDrogueria(d)}
                        title="Editar droguería"
                        className="rounded-xl"
                      >
                        <Pencil className="h-4 w-4 text-slate-600" />
                      </Button>
                    </div>
                  </div>

                  {suspension.suspended && suspension.reason && (
                    <div className="flex items-center gap-2 rounded-2xl bg-rose-50 border border-rose-200 px-4 py-2.5 text-xs font-semibold text-rose-700">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>{suspension.reason}</span>
                    </div>
                  )}

                  {/* URL Box */}
                  <div className="flex items-center justify-between gap-3 bg-slate-50 border border-slate-200/70 rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Globe className="h-4 w-4 text-indigo-600 shrink-0" />
                      <span className="text-xs font-bold text-slate-700 truncate">{url}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => copyUrl(url)}
                        className="p-1.5 rounded-lg hover:bg-white text-slate-500 hover:text-indigo-600 transition-colors"
                        title="Copiar URL"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 rounded-lg hover:bg-white text-slate-500 hover:text-indigo-600 transition-colors"
                        title="Abrir URL"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>

                  {/* Usuarios de la Droguería */}
                  {(() => {
                    const tenantUsers = usersByDrogueria.get(d.id) || []
                    const adminsCount = tenantUsers.filter(
                      (u) => u.role === 'admin' || u.role === 'superadmin'
                    ).length
                    const visibleUsers = tenantUsers.slice(0, 5)
                    const remainingUsers = tenantUsers.length - visibleUsers.length

                    const roleConfig: Record<
                      string,
                      {
                        label: string
                        container: string
                        pill: string
                        Icon: typeof Shield
                      }
                    > = {
                      superadmin: {
                        label: 'SUPERADMIN',
                        container:
                          'bg-indigo-50/80 border-indigo-200 hover:bg-indigo-100/80',
                        pill: 'bg-indigo-100 text-indigo-700',
                        Icon: ShieldCheck,
                      },
                      admin: {
                        label: 'ADMIN',
                        container:
                          'bg-purple-50/70 border-purple-200/80 hover:bg-purple-100/70',
                        pill: 'bg-purple-100 text-purple-700',
                        Icon: Shield,
                      },
                      vendedor: {
                        label: 'VENDEDOR',
                        container: 'bg-slate-50 border-slate-200 hover:bg-slate-100',
                        pill: 'bg-slate-200/70 text-slate-700',
                        Icon: User,
                      },
                    }

                    return (
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                            Usuarios de la Droguería ({tenantUsers.length})
                          </p>
                          {adminsCount === 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-200">
                              <AlertTriangle className="h-3 w-3" /> Sin admin
                            </span>
                          )}
                        </div>

                        {tenantUsers.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {visibleUsers.map((u) => {
                              const cfg = roleConfig[u.role || ''] || roleConfig.vendedor
                              const RoleIcon = cfg.Icon
                              const isInactive = u.status !== 'activo'

                              return (
                                <button
                                  key={u.id}
                                  type="button"
                                  onClick={() => openAssignModal(u)}
                                  title="Clic para cambiar rol, droguería o estado"
                                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition-colors cursor-pointer ${cfg.container
                                    } ${isInactive ? 'opacity-60' : ''}`}
                                >
                                  <RoleIcon className="h-3.5 w-3.5 shrink-0 text-slate-700" />
                                  <span className="font-bold text-slate-800">
                                    {u.full_name || u.username}
                                  </span>
                                  {u.email && (
                                    <span className="text-slate-500 text-[11px]">
                                      ({u.email})
                                    </span>
                                  )}
                                  <span
                                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-black tracking-wide ${cfg.pill}`}
                                  >
                                    {cfg.label}
                                  </span>
                                  {isInactive && (
                                    <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black tracking-wide bg-red-100 text-red-700">
                                      INACTIVO
                                    </span>
                                  )}
                                </button>
                              )
                            })}

                            {remainingUsers > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setFilterDrogueriaId(d.id)
                                  switchTab('usuarios')
                                }}
                                className="inline-flex items-center px-3 py-1.5 rounded-xl border border-dashed border-slate-300 bg-white hover:bg-slate-50 text-xs font-black text-indigo-600 transition-colors cursor-pointer"
                              >
                                +{remainingUsers} más
                              </button>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl">
                            Sin usuarios asignados
                          </p>
                        )}
                      </div>
                    )
                  })()}

                  {/* Métricas de uso */}
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 pt-2 border-t border-slate-100">
                    <div
                      className={`rounded-xl p-2.5 text-center ${
                        isQuotaFull ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50/70'
                      }`}
                      title={`Usuarios activos ${d.usuariosActivos} de un cupo máximo de ${d.max_usuarios} (${d.usuariosTotal} registrados en total)`}
                    >
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Cupo Usuarios</p>
                      <p
                        className={`text-sm font-black ${
                          isQuotaFull ? 'text-amber-700' : 'text-slate-900'
                        }`}
                      >
                        {d.usuariosActivos}/{d.max_usuarios}
                      </p>
                    </div>
                    <div className="bg-slate-50/70 rounded-xl p-2.5 text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Productos</p>
                      <p className="text-sm font-black text-slate-900">{d.productosCount}</p>
                    </div>
                    <div className="bg-slate-50/70 rounded-xl p-2.5 text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Facturas</p>
                      <p className="text-sm font-black text-slate-900">{d.facturasCount}</p>
                    </div>
                    <div className="bg-slate-50/70 rounded-xl p-2.5 text-center">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Compras</p>
                      <p className="text-sm font-black text-slate-900">{d.comprasCount}</p>
                    </div>
                    <div className="bg-emerald-50/70 rounded-xl p-2.5 text-center col-span-2 sm:col-span-1">
                      <p className="text-[10px] font-bold text-emerald-700 uppercase">Ventas</p>
                      <p className="text-sm font-black text-emerald-700 truncate">
                        {formatCurrency(d.volumenFacturado)}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-[11px] font-semibold text-slate-400">
                    <span>
                      {d.direccion || d.telefono
                        ? [d.direccion, d.telefono].filter(Boolean).join(' • ')
                        : 'Sin dirección/teléfono fiscal registrado'}
                    </span>
                    <span>
                      Última actividad:{' '}
                      {d.ultimaActividad
                        ? new Date(d.ultimaActividad).toLocaleDateString()
                        : 'N/A'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : activeTab === 'usuarios' ? (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={searchUsuario}
                onChange={(e) => setSearchUsuario(e.target.value)}
                placeholder="Buscar usuario por nombre, correo o droguería..."
                className="pl-10 bg-white rounded-xl"
              />
            </div>

            <Select value={filterDrogueriaId} onValueChange={setFilterDrogueriaId}>
              <SelectTrigger className="w-full sm:w-64 bg-white rounded-xl">
                <SelectValue placeholder="Filtrar por droguería" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las droguerías</SelectItem>
                {data.droguerias.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-black text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Usuario</th>
                    <th className="px-6 py-4">Droguería</th>
                    <th className="px-6 py-4">Rol</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4">Último Acceso</th>
                    <th className="px-6 py-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsuarios.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900">{u.full_name || u.username}</p>
                        <p className="text-xs text-slate-400">
                          {u.email || `@${u.username}`} • @{u.username}
                        </p>
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-700">{u.drogueria_nombre}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${u.role === 'superadmin'
                            ? 'bg-indigo-100 text-indigo-700'
                            : u.role === 'admin'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-blue-100 text-blue-700'
                            }`}
                        >
                          {u.role === 'superadmin' ? (
                            <ShieldCheck className="h-3 w-3" />
                          ) : u.role === 'admin' ? (
                            <Shield className="h-3 w-3" />
                          ) : (
                            <User className="h-3 w-3" />
                          )}
                          {u.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${u.status === 'activo'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-rose-100 text-rose-700'
                            }`}
                        >
                          {u.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500 font-medium">
                        {u.last_sign_in_at
                          ? new Date(u.last_sign_in_at).toLocaleString()
                          : 'Nunca'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openAssignModal(u)}
                          className="rounded-xl text-xs font-bold"
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5 mr-1.5" />
                          Reasignar
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {filteredUsuarios.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-bold">
                        No se encontraron usuarios.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
            <div className="space-y-1">
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Terminal className="h-4 w-4 text-indigo-600" />
                API REST Pública v1 (120 req/min por llave)
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Conecta ERPs, contabilidad o ecommerce usando{' '}
                <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                  Authorization: Bearer tp_live_...
                </code>{' '}
                o consulta la especificación{' '}
                <a
                  href="/api/v1/openapi"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 font-bold underline hover:text-indigo-700"
                >
                  OpenAPI 3.1 JSON
                </a>
                .
              </p>
            </div>
            <Button
              onClick={openCreateApiKey}
              className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shrink-0"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nueva API Key
            </Button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-100 text-[11px] font-black text-slate-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Integración / Prefijo</th>
                    <th className="px-6 py-4">Droguería</th>
                    <th className="px-6 py-4">Permisos (Scopes)</th>
                    <th className="px-6 py-4">Último Uso</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.apiKeys.map((k) => (
                    <tr key={k.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900">{k.nombre}</p>
                        <p className="text-xs font-mono text-slate-500">{k.key_prefix}••••••••</p>
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-700">{k.drogueria_nombre}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {k.scopes.map((sc) => (
                            <span
                              key={sc}
                              className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold"
                            >
                              {sc}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-500 font-medium">
                        {k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'Sin uso'}
                        {k.expires_at && (
                          <span className="block text-[10px] text-slate-400">
                            Expira: {k.expires_at.slice(0, 10)}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                            k.estado === 'activa'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {k.estado}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {k.estado === 'activa' ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={revokingKeyId === k.id}
                            onClick={() => handleRevokeApiKey(k.id)}
                            className="rounded-xl text-xs font-bold text-rose-700 border-rose-200 hover:bg-rose-50"
                          >
                            <Ban className="h-3.5 w-3.5 mr-1.5" />
                            {revokingKeyId === k.id ? 'Revocando...' : 'Revocar'}
                          </Button>
                        ) : (
                          <span className="text-xs text-slate-400 font-semibold">Revocada</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {data.apiKeys.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-bold">
                        No hay API Keys generadas todavía. Crea una para integrar sistemas externos.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Dialog Crear / Editar Droguería */}
      <Dialog open={isDrogueriaOpen} onOpenChange={setIsDrogueriaOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingDrogueria ? 'Editar Droguería' : 'Registrar Nueva Droguería'}
            </DialogTitle>
            <DialogDescription>
              Configura la sede, su URL de acceso y los datos fiscales para facturación.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveDrogueria} className="space-y-4 mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nombre *</Label>
                <Input
                  required
                  value={drogueriaForm.nombre}
                  onChange={(e) => setDrogueriaForm({ ...drogueriaForm, nombre: e.target.value })}
                  placeholder="Ej. Droguería Salud Total"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Subdominio *</Label>
                <Input
                  required
                  value={drogueriaForm.subdominio}
                  onChange={(e) =>
                    setDrogueriaForm({
                      ...drogueriaForm,
                      subdominio: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                    })
                  }
                  placeholder="ej. saludtotal"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>URL Personalizada (opcional)</Label>
              <Input
                type="url"
                value={drogueriaForm.url_personalizada}
                onChange={(e) =>
                  setDrogueriaForm({ ...drogueriaForm, url_personalizada: e.target.value })
                }
                placeholder="https://saludtotal.techpharmacy.app"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>NIT</Label>
                <Input
                  value={drogueriaForm.nit}
                  onChange={(e) => setDrogueriaForm({ ...drogueriaForm, nit: e.target.value })}
                  placeholder="900.123.456-7"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Régimen</Label>
                <Input
                  value={drogueriaForm.regimen}
                  onChange={(e) => setDrogueriaForm({ ...drogueriaForm, regimen: e.target.value })}
                  placeholder="Régimen Común / Simple"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <Input
                  value={drogueriaForm.telefono}
                  onChange={(e) => setDrogueriaForm({ ...drogueriaForm, telefono: e.target.value })}
                  placeholder="(601) 555-0123"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Dirección</Label>
                <Input
                  value={drogueriaForm.direccion}
                  onChange={(e) => setDrogueriaForm({ ...drogueriaForm, direccion: e.target.value })}
                  placeholder="Calle 123 # 45-67"
                />
              </div>
            </div>

            {/* Plan y Suscripción SaaS */}
            <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-4 space-y-3">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                Plan y Suscripción SaaS
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Plan</Label>
                  <Select
                    value={drogueriaForm.plan}
                    onValueChange={(v) => {
                      const nextPlan = v as TenantPlan
                      setDrogueriaForm({
                        ...drogueriaForm,
                        plan: nextPlan,
                        max_usuarios: editingDrogueria
                          ? drogueriaForm.max_usuarios
                          : PLAN_CONFIG[nextPlan].defaultMaxUsers,
                      })
                    }}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basico">Básico (5 usr)</SelectItem>
                      <SelectItem value="pro">Pro (15 usr)</SelectItem>
                      <SelectItem value="enterprise">Enterprise (100 usr)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Estado</Label>
                  <Select
                    value={drogueriaForm.estado}
                    onValueChange={(v) =>
                      setDrogueriaForm({ ...drogueriaForm, estado: v as TenantStatus })
                    }
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="activo">Activo</SelectItem>
                      <SelectItem value="prueba">Prueba</SelectItem>
                      <SelectItem value="suspendido">Suspendido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Máx. Usuarios</Label>
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    required
                    className="bg-white"
                    value={drogueriaForm.max_usuarios}
                    onChange={(e) =>
                      setDrogueriaForm({
                        ...drogueriaForm,
                        max_usuarios: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Vencimiento del Plan (opcional)</Label>
                  <Input
                    type="date"
                    className="bg-white"
                    value={drogueriaForm.fecha_vencimiento}
                    onChange={(e) =>
                      setDrogueriaForm({ ...drogueriaForm, fecha_vencimiento: e.target.value })
                    }
                  />
                </div>

                {drogueriaForm.estado === 'suspendido' && (
                  <div className="space-y-1.5">
                    <Label>Motivo de Suspensión</Label>
                    <Input
                      className="bg-white"
                      value={drogueriaForm.motivo_suspension}
                      onChange={(e) =>
                        setDrogueriaForm({ ...drogueriaForm, motivo_suspension: e.target.value })
                      }
                      placeholder="Ej. Factura pendiente de pago"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsDrogueriaOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={savingDrogueria}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {savingDrogueria ? 'Guardando...' : 'Guardar Droguería'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Crear Usuario en Droguería */}
      <Dialog open={isNewUserOpen} onOpenChange={setIsNewUserOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo Usuario / Administrador</DialogTitle>
            <DialogDescription>
              Crea una cuenta activa asignada directamente a una droguería.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-4 mt-2">
            {newUserForm.role === 'superadmin' ? (
              <div className="rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-2.5 text-xs font-bold text-indigo-700">
                Acceso global de plataforma: no requiere droguería asignada.
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Droguería *</Label>
                <Select
                  value={newUserForm.drogueria_id}
                  onValueChange={(v) => setNewUserForm({ ...newUserForm, drogueria_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una droguería" />
                  </SelectTrigger>
                  <SelectContent>
                    {data.droguerias.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nombre Completo *</Label>
                <Input
                  required
                  value={newUserForm.full_name}
                  onChange={(e) => setNewUserForm({ ...newUserForm, full_name: e.target.value })}
                  placeholder="Ana Gómez"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Username *</Label>
                <Input
                  required
                  value={newUserForm.username}
                  onChange={(e) => setNewUserForm({ ...newUserForm, username: e.target.value })}
                  placeholder="agomez"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Correo Electrónico *</Label>
              <Input
                type="email"
                required
                value={newUserForm.email}
                onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                placeholder="ana@drogueria.com"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Contraseña *</Label>
                <Input
                  type="password"
                  required
                  minLength={6}
                  value={newUserForm.password}
                  onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                  placeholder="Mín. 6 caracteres"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Rol *</Label>
                <Select
                  value={newUserForm.role}
                  onValueChange={(v) =>
                    setNewUserForm({
                      ...newUserForm,
                      role: v as 'superadmin' | 'admin' | 'vendedor',
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin (Sede)</SelectItem>
                    <SelectItem value="vendedor">Vendedor</SelectItem>
                    <SelectItem value="superadmin">Superadmin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setIsNewUserOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={savingNewUser}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {savingNewUser ? 'Creando...' : 'Crear Usuario'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Reasignar Usuario */}
      <Dialog open={!!editingUser} onOpenChange={(open) => { if (!open) setEditingUser(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reasignar Usuario</DialogTitle>
            <DialogDescription>
              Cambia la droguería asignada, rol o estado de {editingUser?.full_name || editingUser?.username}.
            </DialogDescription>
          </DialogHeader>
          {editingUser && (
            <form onSubmit={handleAssignUser} className="space-y-4 mt-2">
              {assignForm.role === 'superadmin' ? (
                <div className="rounded-xl bg-indigo-50 border border-indigo-200 px-3 py-2.5 text-xs font-bold text-indigo-700">
                  Rol Superadmin: cuenta global desvinculada de droguerías operativas.
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Droguería Asignada</Label>
                  <Select
                    value={assignForm.drogueria_id}
                    onValueChange={(v) => setAssignForm({ ...assignForm, drogueria_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {data.droguerias.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Rol</Label>
                  <Select
                    value={assignForm.role}
                    onValueChange={(v) =>
                      setAssignForm({
                        ...assignForm,
                        role: v as 'superadmin' | 'admin' | 'vendedor',
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="vendedor">Vendedor</SelectItem>
                      <SelectItem value="superadmin">Superadmin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Estado</Label>
                  <Select
                    value={assignForm.status}
                    onValueChange={(v) =>
                      setAssignForm({ ...assignForm, status: v as 'activo' | 'inactivo' })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="activo">Activo</SelectItem>
                      <SelectItem value="inactivo">Inactivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-2.5">
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 text-indigo-600" />
                  Restablecer Contraseña Directamente
                </p>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    value={newResetPassword}
                    onChange={(e) => setNewResetPassword(e.target.value)}
                    placeholder="Escribe nueva clave (mín. 6 caracteres)"
                    className="bg-white text-xs h-9"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={savingResetPassword || newResetPassword.trim().length < 6}
                    onClick={handleResetUserPassword}
                    className="shrink-0 h-9 text-xs font-bold border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                  >
                    {savingResetPassword ? 'Cambiando...' : 'Cambiar Clave'}
                  </Button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={savingAssign}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {savingAssign ? 'Guardando...' : 'Aplicar Cambios'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Suspender Droguería */}
      <Dialog
        open={!!suspendingDrogueria}
        onOpenChange={(open) => {
          if (!open) setSuspendingDrogueria(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Suspender Servicio</DialogTitle>
            <DialogDescription>
              Al suspender <strong>{suspendingDrogueria?.nombre}</strong>, sus administradores y
              vendedores verán una pantalla de bloqueo temporal sin perder sus datos.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleConfirmSuspend} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Motivo de suspensión (opcional)</Label>
              <Input
                value={suspensionReason}
                onChange={(e) => setSuspensionReason(e.target.value)}
                placeholder="Ej. Mensualidad pendiente de pago"
                maxLength={300}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSuspendingDrogueria(null)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={!!togglingStatusId}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                {togglingStatusId ? 'Suspendiendo...' : 'Confirmar Suspensión'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Crear API Key */}
      <Dialog open={isNewApiKeyOpen} onOpenChange={setIsNewApiKeyOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Generar Nueva API Key</DialogTitle>
            <DialogDescription>
              Emite una llave de acceso REST aislada por droguería con permisos específicos.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateApiKey} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Droguería *</Label>
              <Select
                value={apiKeyForm.drogueria_id}
                onValueChange={(v) => setApiKeyForm({ ...apiKeyForm, drogueria_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una droguería" />
                </SelectTrigger>
                <SelectContent>
                  {data.droguerias.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Nombre de la Integración *</Label>
              <Input
                required
                value={apiKeyForm.nombre}
                onChange={(e) => setApiKeyForm({ ...apiKeyForm, nombre: e.target.value })}
                placeholder="Ej. ERP Contable / Tienda Web"
              />
            </div>

            <div className="space-y-2">
              <Label>Permisos (Scopes) *</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {API_SCOPES.map((scope) => {
                  const checked = apiKeyForm.scopes.includes(scope)
                  return (
                    <label
                      key={scope}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold cursor-pointer transition-colors ${
                        checked
                          ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleScope(scope)}
                        className="accent-indigo-600"
                      />
                      <span>{API_SCOPE_LABELS[scope]}</span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Fecha de Expiración (opcional)</Label>
              <Input
                type="date"
                value={apiKeyForm.expires_at}
                onChange={(e) => setApiKeyForm({ ...apiKeyForm, expires_at: e.target.value })}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsNewApiKeyOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={savingApiKey || apiKeyForm.scopes.length === 0}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {savingApiKey ? 'Generando...' : 'Generar API Key'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Revelación Única de API Key */}
      <Dialog
        open={!!revealedKeyModal}
        onOpenChange={(open) => {
          if (!open) setRevealedKeyModal(null)
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Guarda tu API Key ahora</DialogTitle>
            <DialogDescription>
              Por seguridad, esta llave secreta para{' '}
              <strong>{revealedKeyModal?.drogueriaNombre}</strong> solo se muestra una única vez.
            </DialogDescription>
          </DialogHeader>
          {revealedKeyModal && (
            <div className="space-y-4 mt-2">
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs font-semibold text-amber-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Cópiala y guárdala en un gestor seguro. Solo almacenamos su hash SHA-256.
                </span>
              </div>

              <div className="space-y-1.5">
                <Label>API Key ({revealedKeyModal.nombre})</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={revealedKeyModal.rawKey}
                    className="font-mono text-xs bg-slate-50"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => copyUrl(revealedKeyModal.rawKey, 'API Key copiada')}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Ejemplo rápido de uso (cURL)</Label>
                <div className="relative rounded-xl bg-slate-950 p-3 text-[11px] font-mono text-slate-200 overflow-x-auto">
                  <code>
                    {`curl -H "Authorization: Bearer ${revealedKeyModal.rawKey}" "${
                      typeof window !== 'undefined' ? window.location.origin : 'https://farmaliados.vercel.app'
                    }/api/v1/productos"`}
                  </code>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    copyUrl(
                      `curl -H "Authorization: Bearer ${revealedKeyModal.rawKey}" "${window.location.origin}/api/v1/productos"`,
                      'Comando cURL copiado'
                    )
                  }
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  Copiar cURL
                </Button>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => setRevealedKeyModal(null)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  Entendido, ya la guardé
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
