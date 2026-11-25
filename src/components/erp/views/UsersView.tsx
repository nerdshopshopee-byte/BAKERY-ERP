'use client'

// BAKERY ERP - Configurações > Usuários e Permissões (contas, perfis de acesso e auditoria)
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Ban,
  CheckCircle2,
  Clock,
  Copy,
  KeyRound,
  LogOut,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  ScrollText,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from 'lucide-react'

import { apiDelete, apiGet, apiPatch, apiPost, apiSend } from '@/lib/api'
import { PERMISSION_MODULES } from '@/lib/auth/permissions'
import { dthr } from '@/lib/format'
import type { Operator } from '@/lib/store'
import PermissionMatrix, { RolePermissionMatrix, type PermState } from '@/components/erp/permission-matrix'
import type { ViewProps } from '@/components/erp/view-props'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// ============ Tipos de API ============

type UserStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED'

type UserRow = {
  id: string
  name: string
  email: string
  phone: string | null
  status: UserStatus
  mustChangePassword: boolean
  lastLoginAt: string | null
  createdAt: string
  role: { id: string; name: string; description: string | null; isAbsolute: boolean }
  overridesCount: number
  temporaryCount?: number
  activeSessions: number
  branches: { id: string; name: string }[]
}

type RoleRow = {
  id: string
  name: string
  description: string | null
  isSystem: boolean
  isAbsolute: boolean
  permissionKeys: string[]
  usersCount: number
}

type BranchRow = { id: string; name: string; address: string | null }

type OverrideRow = {
  permissionKey: string
  granted: boolean
  origin: 'INDIVIDUAL' | 'TEMPORARY'
  grantedBy: string | null
  expiresAt: string | null
}

type UserPermissionsResponse = {
  role: { id: string; name: string; isAbsolute: boolean }
  rolePermissions: string[]
  overrides: OverrideRow[]
  effective: string[]
}

type AuditLogRow = {
  id: string
  actor: string
  userEmail: string | null
  action: string
  result: 'SUCCESS' | 'FAILURE'
  detail: string | null
  ip: string | null
  createdAt: string
}

type UserForm = {
  id?: string
  name: string
  email: string
  phone: string
  roleId: string
  status: UserStatus
  password: string
  mustChangePassword: boolean
  branchIds: string[]
}

type ConfirmKind = 'INACTIVATE' | 'BLOCK' | 'REVOKE'

const STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Ativo',
  INACTIVE: 'Inativo',
  BLOCKED: 'Bloqueado',
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  LOGIN_OK: 'Login efetuado',
  LOGIN_FAILED: 'Falha de login',
  LOGOUT: 'Logout',
  PERMISSIONS_UPDATED: 'Permissões alteradas',
  USER_CREATED: 'Usuário criado',
  USER_UPDATED: 'Usuário atualizado',
  USER_BLOCKED: 'Usuário bloqueado',
  PASSWORD_ADMIN_RESET: 'Senha redefinida',
  SESSIONS_REVOKED: 'Sessões encerradas',
  ROLE_CREATED: 'Perfil criado',
  ROLE_UPDATED: 'Perfil atualizado',
  ROLE_DELETED: 'Perfil excluído',
  API_DENIED: 'Acesso negado na API',
}

// Debounce simples para campos de busca (300ms)
function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

// ============ View ============

export default function UsersView({ operator }: ViewProps) {
  const canUsers = operator.isAbsolute || operator.permissions.includes('settings.users')
  const canRoles = operator.isAbsolute || operator.permissions.includes('settings.roles')
  const canAudit = operator.isAbsolute || operator.permissions.includes('settings.audit')

  const [activeTab, setActiveTab] = useState(() => (canUsers ? 'users' : canRoles ? 'roles' : 'audit'))

  if (!canUsers && !canRoles && !canAudit) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Users className="text-primary size-5" />
            Usuários e permissões
          </h2>
          <p className="text-muted-foreground text-sm">
            Contas de acesso, perfis e trilha de auditoria · operador {operator.name}
          </p>
        </div>
        <Card className="rounded-xl border bg-card p-4">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="bg-destructive/10 flex size-12 items-center justify-center rounded-full">
              <ShieldAlert className="size-6 text-destructive" />
            </div>
            <div className="space-y-1">
              <p className="font-semibold">Acesso restrito</p>
              <p className="text-muted-foreground mx-auto max-w-md text-sm">
                Seu perfil não possui permissões para gerenciar usuários, perfis de acesso ou consultar a auditoria.
                Solicite as permissões necessárias a um administrador.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Users className="text-primary size-5" />
            Usuários e permissões
          </h2>
          <p className="text-muted-foreground text-sm">
            Contas de acesso, perfis e trilha de auditoria · operador {operator.name}
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-4">
        <TabsList>
          {canUsers && (
            <TabsTrigger value="users">
              <Users className="size-4" />
              Usuários
            </TabsTrigger>
          )}
          {canRoles && (
            <TabsTrigger value="roles">
              <ShieldCheck className="size-4" />
              Perfis
            </TabsTrigger>
          )}
          {canAudit && (
            <TabsTrigger value="audit">
              <ScrollText className="size-4" />
              Auditoria
            </TabsTrigger>
          )}
        </TabsList>
        {canUsers && (
          <TabsContent value="users" className="space-y-4">
            <UsersTab operator={operator} />
          </TabsContent>
        )}
        {canRoles && (
          <TabsContent value="roles" className="space-y-4">
            <RolesTab operator={operator} />
          </TabsContent>
        )}
        {canAudit && (
          <TabsContent value="audit" className="space-y-4">
            <AuditTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

// ============ Aba Usuários ============

function UsersTab({ operator }: { operator: Operator }) {
  const canPermissions = operator.isAbsolute || operator.permissions.includes('settings.permissions')

  const [users, setUsers] = useState<UserRow[]>([])
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [branches, setBranches] = useState<BranchRow[]>([])
  const [listLoading, setListLoading] = useState(true)

  const [search, setSearch] = useState('')
  const debSearch = useDebounced(search)
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [roleFilter, setRoleFilter] = useState('ALL')

  // Formulário criar/editar
  const [formOpen, setFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<UserForm>({
    id: undefined,
    name: '',
    email: '',
    phone: '',
    roleId: '',
    status: 'ACTIVE',
    password: '',
    mustChangePassword: true,
    branchIds: [],
  })

  // Senha inicial (criação)
  const [created, setCreated] = useState<{ name: string; password: string } | null>(null)

  // Redefinir senha
  const [pwTarget, setPwTarget] = useState<UserRow | null>(null)
  const [pwValue, setPwValue] = useState('')
  const [pwMustChange, setPwMustChange] = useState(true)
  const [pwSaving, setPwSaving] = useState(false)

  // Dialog de permissões
  const [permsOpen, setPermsOpen] = useState(false)
  const [permsTarget, setPermsTarget] = useState<UserRow | null>(null)
  const [permsLoading, setPermsLoading] = useState(false)
  const [permsRole, setPermsRole] = useState<UserPermissionsResponse['role'] | null>(null)
  const [rolePermissions, setRolePermissions] = useState<string[]>([])
  const [matrixState, setMatrixState] = useState<Record<string, PermState>>({})
  const [copyFrom, setCopyFrom] = useState('')
  const [permsSaving, setPermsSaving] = useState(false)
  const [confirmPermsOpen, setConfirmPermsOpen] = useState(false)

  // Confirmações (inativar / bloquear / encerrar sessões)
  const [confirm, setConfirm] = useState<{ kind: ConfirmKind; user: UserRow } | null>(null)
  const [busyAction, setBusyAction] = useState(false)

  const loadRefs = useCallback(async () => {
    try {
      const [rolesRes, branchesRes] = await Promise.all([
        apiGet<{ roles: RoleRow[] }>('/api/roles'),
        apiGet<{ branches: BranchRow[] }>('/api/branches'),
      ])
      setRoles(rolesRes.roles)
      setBranches(branchesRes.branches)
    } catch (err) {
      toast.error('Erro ao carregar perfis e unidades', {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }, [])

  const loadUsers = useCallback(async () => {
    setListLoading(true)
    try {
      const params = new URLSearchParams()
      if (debSearch.trim()) params.set('search', debSearch.trim())
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      if (roleFilter !== 'ALL') params.set('roleId', roleFilter)
      const res = await apiGet<{ users: UserRow[] }>(`/api/users?${params.toString()}`)
      setUsers(res.users)
    } catch (err) {
      toast.error('Erro ao carregar usuários', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setListLoading(false)
    }
  }, [debSearch, statusFilter, roleFilter])

  useEffect(() => {
    void loadRefs()
  }, [loadRefs])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  // ---------- Formulário criar/editar ----------

  function openForm(user?: UserRow) {
    if (user) {
      setForm({
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone ?? '',
        roleId: user.role.id,
        status: user.status,
        password: '',
        mustChangePassword: user.mustChangePassword,
        branchIds: user.branches.map((b) => b.id),
      })
    } else {
      setForm({
        id: undefined,
        name: '',
        email: '',
        phone: '',
        roleId: roles[0]?.id ?? '',
        status: 'ACTIVE',
        password: '',
        mustChangePassword: true,
        branchIds: [],
      })
    }
    setFormOpen(true)
  }

  function toggleBranch(id: string, checked: boolean) {
    setForm((f) => ({
      ...f,
      branchIds: checked ? [...f.branchIds, id] : f.branchIds.filter((b) => b !== id),
    }))
  }

  async function submitForm() {
    if (!form.name.trim()) {
      toast.error('Informe o nome completo do usuário')
      return
    }
    if (!form.email.trim() || !form.email.includes('@')) {
      toast.error('Informe um e-mail válido')
      return
    }
    if (!form.roleId) {
      toast.error('Selecione o perfil de acesso')
      return
    }
    setSaving(true)
    try {
      if (form.id) {
        await apiPatch(`/api/users/${form.id}`, {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          roleId: form.roleId,
          status: form.status,
          branchIds: form.branchIds,
        })
        toast.success('Usuário atualizado', { description: form.name.trim() })
        setFormOpen(false)
        await loadUsers()
      } else {
        const res = await apiPost<{ user: { id: string; name: string; email: string }; initialPassword: string }>(
          '/api/users',
          {
            name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim() || undefined,
            roleId: form.roleId,
            status: form.status,
            password: form.password.trim() || undefined,
            mustChangePassword: form.mustChangePassword,
            branchIds: form.branchIds,
          }
        )
        setFormOpen(false)
        setCreated({ name: res.user.name, password: res.initialPassword })
        toast.success('Usuário criado', { description: res.user.name })
        await loadUsers()
      }
    } catch (err) {
      toast.error('Erro ao salvar usuário', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  // ---------- Redefinir senha ----------

  function openPassword(user: UserRow) {
    setPwTarget(user)
    setPwValue('')
    setPwMustChange(true)
  }

  async function submitPassword() {
    if (!pwTarget) return
    if (pwValue.trim().length < 6) {
      toast.error('A nova senha deve ter pelo menos 6 caracteres')
      return
    }
    setPwSaving(true)
    try {
      await apiPost(`/api/users/${pwTarget.id}/password`, {
        newPassword: pwValue,
        mustChangePassword: pwMustChange,
      })
      toast.success('Senha redefinida', {
        description: `As sessões ativas de ${pwTarget.name} foram encerradas.`,
      })
      setPwTarget(null)
      await loadUsers()
    } catch (err) {
      toast.error('Erro ao redefinir senha', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setPwSaving(false)
    }
  }

  // ---------- Situação e sessões ----------

  async function patchUserStatus(user: UserRow, status: UserStatus, successMsg: string) {
    await apiPatch(`/api/users/${user.id}`, {
      name: user.name,
      email: user.email,
      phone: user.phone ?? '',
      roleId: user.role.id,
      status,
      branchIds: user.branches.map((b) => b.id),
    })
    toast.success(successMsg, { description: user.name })
  }

  async function runConfirm() {
    if (!confirm) return
    const { kind, user } = confirm
    setBusyAction(true)
    try {
      if (kind === 'REVOKE') {
        const res = await apiPost<{ ok: boolean; revoked: number }>(`/api/users/${user.id}/revoke-sessions`)
        toast.success('Sessões encerradas', {
          description: `${res.revoked} sessão(ões) de ${user.name} foram encerradas.`,
        })
      } else if (kind === 'BLOCK') {
        await patchUserStatus(user, 'BLOCKED', 'Usuário bloqueado')
      } else {
        await patchUserStatus(user, 'INACTIVE', 'Usuário inativado')
      }
      setConfirm(null)
      await loadUsers()
    } catch (err) {
      toast.error('Erro na operação', { description: err instanceof Error ? err.message : undefined })
      setConfirm(null)
    } finally {
      setBusyAction(false)
    }
  }

  async function reactivateUser(user: UserRow) {
    setBusyAction(true)
    try {
      await patchUserStatus(user, 'ACTIVE', 'Usuário reativado')
      await loadUsers()
    } catch (err) {
      toast.error('Erro ao atualizar situação', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setBusyAction(false)
    }
  }

  // ---------- Permissões ----------

  async function openPerms(user: UserRow) {
    if (!canPermissions) return
    setPermsTarget(user)
    setPermsOpen(true)
    setPermsLoading(true)
    setCopyFrom('')
    setConfirmPermsOpen(false)
    try {
      const res = await apiGet<UserPermissionsResponse>(`/api/users/${user.id}/permissions`)
      setPermsRole(res.role)
      setRolePermissions(res.rolePermissions)
      const map: Record<string, PermState> = {}
      for (const o of res.overrides) {
        map[o.permissionKey] = { action: o.granted ? 'allow' : 'deny', expiresAt: o.expiresAt }
      }
      setMatrixState(map)
    } catch (err) {
      toast.error('Erro ao carregar permissões', { description: err instanceof Error ? err.message : undefined })
      setPermsOpen(false)
      setPermsTarget(null)
    } finally {
      setPermsLoading(false)
    }
  }

  function buildOverrides() {
    const overrides: { permissionKey: string; granted: boolean; expiresAt: string | null }[] = []
    for (const [permissionKey, st] of Object.entries(matrixState)) {
      if (!st || st.action === 'inherit') continue
      overrides.push({
        permissionKey,
        granted: st.action === 'allow',
        expiresAt: st.action === 'allow' ? st.expiresAt ?? null : null,
      })
    }
    return overrides
  }

  async function savePerms() {
    if (!permsTarget) return
    setPermsSaving(true)
    try {
      await apiSend<{ ok: boolean; effective: string[] }>(`/api/users/${permsTarget.id}/permissions`, 'PUT', {
        overrides: buildOverrides(),
      })
      toast.success('Permissões atualizadas', { description: permsTarget.name })
      setConfirmPermsOpen(false)
      setPermsOpen(false)
      setPermsTarget(null)
      if (permsTarget.id === operator.id) {
        window.dispatchEvent(new CustomEvent('bakery:session-refresh'))
      }
      await loadUsers()
    } catch (err) {
      toast.error('Erro ao salvar permissões', { description: err instanceof Error ? err.message : undefined })
      setConfirmPermsOpen(false)
    } finally {
      setPermsSaving(false)
    }
  }

  function applyRoleDefaults() {
    const map: Record<string, PermState> = {}
    for (const mod of PERMISSION_MODULES) {
      for (const p of mod.permissions) {
        map[p.key] = { action: 'inherit' }
      }
    }
    setMatrixState(map)
    setCopyFrom('')
  }

  async function handleCopyFrom(id: string) {
    setCopyFrom(id)
    if (!id) return
    try {
      const res = await apiGet<UserPermissionsResponse>(`/api/users/${id}/permissions`)
      const map: Record<string, PermState> = {}
      for (const mod of PERMISSION_MODULES) {
        for (const p of mod.permissions) {
          map[p.key] = { action: res.effective.includes(p.key) ? 'allow' : 'deny', expiresAt: null }
        }
      }
      setMatrixState(map)
      const src = users.find((u) => u.id === id)
      toast.success('Permissões copiadas', {
        description: `Estado de permissões de ${src?.name ?? 'outro usuário'} aplicado localmente. Salve para confirmar.`,
      })
    } catch (err) {
      toast.error('Erro ao copiar permissões', { description: err instanceof Error ? err.message : undefined })
      setCopyFrom('')
    }
  }

  // ---------- Render ----------

  const confirmContent = useMemo(() => {
    switch (confirm?.kind) {
      case 'INACTIVATE':
        return {
          title: `Inativar usuário ${confirm.user.name}?`,
          description: 'O usuário deixará de ter acesso ao sistema até ser reativado.',
          action: 'Inativar',
        }
      case 'BLOCK':
        return {
          title: `Bloquear usuário ${confirm.user.name}?`,
          description: 'O acesso será negado imediatamente e apenas um administrador poderá desbloquear.',
          action: 'Bloquear',
        }
      case 'REVOKE':
        return {
          title: `Encerrar sessões de ${confirm.user.name}?`,
          description: 'Todos os dispositivos conectados serão desconectados e será necessário entrar novamente.',
          action: 'Encerrar',
        }
      default:
        return null
    }
  }, [confirm])

  function copyInitialPassword() {
    if (!created) return
    navigator.clipboard
      .writeText(created.password)
      .then(() => toast.success('Senha copiada para a área de transferência'))
      .catch(() => toast.error('Não foi possível copiar a senha'))
  }

  const otherUsers = permsTarget ? users.filter((u) => u.id !== permsTarget.id) : users

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou e-mail"
            className="w-full pl-8 sm:w-64"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os status</SelectItem>
            <SelectItem value="ACTIVE">Ativo</SelectItem>
            <SelectItem value="INACTIVE">Inativo</SelectItem>
            <SelectItem value="BLOCKED">Bloqueado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os perfis</SelectItem>
            {roles.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={() => openForm()} className="ml-auto">
          <UserPlus className="size-4" />
          Novo usuário
        </Button>
      </div>

      {/* Tabela */}
      <Card className="rounded-xl border bg-card p-4">
        <CardContent className="px-0">
          {listLoading && users.length === 0 ? (
            <div className="space-y-2 px-2 py-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full" />
              ))}
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card">
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Perfil</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="hidden md:table-cell">Unidades</TableHead>
                    <TableHead className="hidden md:table-cell">Personalizações</TableHead>
                    <TableHead className="hidden lg:table-cell">Último acesso</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-muted-foreground py-8 text-center">
                        Nenhum usuário encontrado
                      </TableCell>
                    </TableRow>
                  )}
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{u.name}</p>
                          <p className="text-muted-foreground truncate text-xs">{u.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant="outline">{u.role.name}</Badge>
                          {u.role.isAbsolute && (
                            <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-400">Absoluto</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            u.status === 'ACTIVE' ? 'default' : u.status === 'INACTIVE' ? 'secondary' : 'destructive'
                          }
                        >
                          {STATUS_LABELS[u.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden max-w-44 truncate md:table-cell">
                        {u.branches.length > 0 ? u.branches.map((b) => b.name).join(', ') : '-'}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {u.overridesCount > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="text-[10px]">
                              {u.overridesCount}
                            </Badge>
                            {(u.temporaryCount ?? 0) > 0 && (
                              <Badge
                                variant="outline"
                                className="border-amber-500/40 bg-amber-500/10 gap-1 text-amber-400 text-[10px]"
                              >
                                <Clock className="size-3" />
                                temporárias
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap tabular-nums lg:table-cell">
                        {dthr(u.lastLoginAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="size-8" title="Ações do usuário">
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-60">
                              <DropdownMenuItem onClick={() => openForm(u)}>
                                <Pencil className="size-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem disabled={!canPermissions} onClick={() => void openPerms(u)}>
                                <ShieldCheck className="size-4" />
                                Permissões
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openPassword(u)}>
                                <KeyRound className="size-4" />
                                Redefinir senha
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={u.activeSessions === 0}
                                onClick={() => setConfirm({ kind: 'REVOKE', user: u })}
                              >
                                <LogOut className="size-4" />
                                Encerrar sessões ({u.activeSessions})
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {u.status === 'ACTIVE' ? (
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => setConfirm({ kind: 'INACTIVATE', user: u })}
                                >
                                  <UserX className="size-4" />
                                  Inativar
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => void reactivateUser(u)}>
                                  <UserCheck className="size-4" />
                                  Ativar
                                </DropdownMenuItem>
                              )}
                              {u.status === 'BLOCKED' ? (
                                <DropdownMenuItem onClick={() => void reactivateUser(u)}>
                                  <ShieldCheck className="size-4" />
                                  Desbloquear
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => setConfirm({ kind: 'BLOCK', user: u })}
                                >
                                  <Ban className="size-4" />
                                  Bloquear
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog criar/editar usuário */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto scrollbar-thin sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar usuário' : 'Novo usuário'}</DialogTitle>
            <DialogDescription>Identificação, acesso e unidades autorizadas.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-1">
            <section className="grid gap-3">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Identificação</p>
              <div className="grid gap-2">
                <Label htmlFor="user-name">Nome completo *</Label>
                <Input
                  id="user-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex.: Maria Silva"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="user-email">E-mail *</Label>
                  <Input
                    id="user-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="maria@padaria.com.br"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="user-phone">Telefone</Label>
                  <Input
                    id="user-phone"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="(11) 99999-0000"
                  />
                </div>
              </div>
            </section>

            <Separator />

            <section className="grid gap-3">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Acesso</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="user-role">Perfil de acesso *</Label>
                  <Select value={form.roleId} onValueChange={(v) => setForm((f) => ({ ...f, roleId: v }))}>
                    <SelectTrigger id="user-role" className="w-full">
                      <SelectValue placeholder="Selecione o perfil" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="user-status">Situação</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm((f) => ({ ...f, status: v as UserStatus }))}
                  >
                    <SelectTrigger id="user-status" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">Ativo</SelectItem>
                      <SelectItem value="INACTIVE">Inativo</SelectItem>
                      <SelectItem value="BLOCKED">Bloqueado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {!form.id && (
                <div className="grid gap-2">
                  <Label htmlFor="user-password">Senha inicial</Label>
                  <Input
                    id="user-password"
                    type="text"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Deixe vazio para gerar automaticamente"
                  />
                </div>
              )}
              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <Label htmlFor="user-must-change" className="text-sm font-medium">
                    Exigir troca de senha no primeiro acesso
                  </Label>
                  <p className="text-muted-foreground text-xs">O usuário deverá definir uma nova senha ao entrar.</p>
                </div>
                <Switch
                  id="user-must-change"
                  checked={form.mustChangePassword}
                  onCheckedChange={(c) => setForm((f) => ({ ...f, mustChangePassword: c }))}
                />
              </div>
            </section>

            <Separator />

            <section className="grid gap-3">
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                Unidades autorizadas
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {branches.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 rounded-md border p-2">
                    <Checkbox
                      id={`branch-${b.id}`}
                      checked={form.branchIds.includes(b.id)}
                      onCheckedChange={(c) => toggleBranch(b.id, c === true)}
                    />
                    <Label htmlFor={`branch-${b.id}`} className="cursor-pointer truncate text-sm font-normal">
                      {b.name}
                    </Label>
                  </div>
                ))}
                {branches.length === 0 && (
                  <p className="text-muted-foreground text-sm">Nenhuma unidade cadastrada.</p>
                )}
              </div>
            </section>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void submitForm()} disabled={saving}>
              {saving ? 'Salvando...' : form.id ? 'Salvar alterações' : 'Criar usuário'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog senha inicial exibida uma única vez */}
      <Dialog open={!!created} onOpenChange={(o) => !o && setCreated(null)}>
        <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="text-primary size-5" />
              Usuário criado
            </DialogTitle>
            <DialogDescription>{created?.name} foi cadastrado com sucesso.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="initial-password">Senha inicial</Label>
              <div className="flex items-center gap-2">
                <Input id="initial-password" readOnly value={created?.password ?? ''} className="font-mono" />
                <Button variant="outline" onClick={copyInitialPassword} className="shrink-0">
                  <Copy className="size-4" />
                  Copiar senha
                </Button>
              </div>
            </div>
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
              <p className="text-xs text-amber-400">
                Esta senha será exibida apenas uma vez. Copie agora e envie ao usuário por um canal seguro; não será
                possível consultá-la novamente.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreated(null)}>Concluído</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog redefinir senha */}
      <Dialog open={!!pwTarget} onOpenChange={(o) => !o && setPwTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
            <DialogDescription>
              Defina uma nova senha para {pwTarget?.name}. As sessões ativas serão encerradas.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-1">
            <div className="grid gap-2">
              <Label htmlFor="new-password">Nova senha *</Label>
              <Input
                id="new-password"
                type="text"
                autoComplete="new-password"
                value={pwValue}
                onChange={(e) => setPwValue(e.target.value)}
                placeholder="Mínimo de 6 caracteres"
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <Label htmlFor="pw-must-change" className="text-sm font-medium">
                  Exigir troca no próximo acesso
                </Label>
                <p className="text-muted-foreground text-xs">O usuário precisará trocar a senha ao entrar.</p>
              </div>
              <Switch id="pw-must-change" checked={pwMustChange} onCheckedChange={setPwMustChange} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwTarget(null)} disabled={pwSaving}>
              Cancelar
            </Button>
            <Button onClick={() => void submitPassword()} disabled={pwSaving || pwValue.trim().length < 6}>
              <KeyRound className="size-4" />
              {pwSaving ? 'Redefinindo...' : 'Redefinir senha'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog permissões do usuário */}
      <Dialog
        open={permsOpen}
        onOpenChange={(o) => {
          if (!o) {
            setPermsOpen(false)
            setCopyFrom('')
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto scrollbar-thin sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2">
              Permissões de {permsTarget?.name}
              {permsRole && <Badge variant="outline">{permsRole.name}</Badge>}
              {permsRole?.isAbsolute && (
                <Badge className="border-amber-500/40 bg-amber-500/10 text-amber-400">Absoluto</Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Concessões extras e restrições individuais aplicadas sobre as permissões do perfil.
            </DialogDescription>
          </DialogHeader>

          {permsLoading ? (
            <div className="space-y-2 py-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Legenda */}
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary text-[10px]">
                    Extra
                  </Badge>
                  concedido além do perfil
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Badge variant="destructive" className="text-[10px]">
                    Restrito
                  </Badge>
                  bloqueio que vence o perfil
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-3" />
                  concessão temporária com validade
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-amber-400" />
                  herdado do perfil
                </span>
              </div>

              {permsRole?.isAbsolute && (
                <Alert className="border-amber-500/40 bg-amber-500/10">
                  <ShieldAlert className="size-4 text-amber-400" />
                  <AlertDescription className="text-amber-400">
                    Perfil com privilégios absolutos: este usuário recebe automaticamente todas as permissões do
                    catálogo, independentemente de personalizações.
                  </AlertDescription>
                </Alert>
              )}

              {/* Ações rápidas */}
              <div className="flex flex-wrap items-center gap-2">
                {otherUsers.length > 0 && (
                  <Select value={copyFrom} onValueChange={(v) => void handleCopyFrom(v)}>
                    <SelectTrigger className="w-60">
                      <SelectValue placeholder="Copiar de outro usuário" />
                    </SelectTrigger>
                    <SelectContent>
                      {otherUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Button variant="outline" onClick={applyRoleDefaults} disabled={!!permsRole?.isAbsolute}>
                  <RotateCcw className="size-4" />
                  Aplicar permissões do perfil
                </Button>
              </div>

              <PermissionMatrix
                state={matrixState}
                onChange={setMatrixState}
                rolePermissions={rolePermissions}
                readOnly={!!permsRole?.isAbsolute}
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPermsOpen(false)} disabled={permsSaving}>
              Cancelar
            </Button>
            <Button
              onClick={() => setConfirmPermsOpen(true)}
              disabled={permsSaving || permsLoading || !!permsRole?.isAbsolute}
            >
              <ShieldCheck className="size-4" />
              Salvar permissões
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog confirmar permissões */}
      <AlertDialog open={confirmPermsOpen} onOpenChange={setConfirmPermsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar alterações de permissões</AlertDialogTitle>
            <AlertDialogDescription>
              As concessões e restrições de {permsTarget?.name} serão salvas e aplicadas imediatamente. Restrições
              individuais vencem as permissões concedidas pelo perfil.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={permsSaving}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={permsSaving}
              onClick={(e) => {
                e.preventDefault()
                void savePerms()
              }}
            >
              {permsSaving ? 'Salvando...' : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog confirmar ações de situação/sessões */}
      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmContent?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmContent?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyAction}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={busyAction}
              onClick={(e) => {
                e.preventDefault()
                void runConfirm()
              }}
            >
              {busyAction ? 'Processando...' : (confirmContent?.action ?? 'Confirmar')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ============ Aba Perfis ============

function RolesTab({ operator }: { operator: Operator }) {
  const canRoles = operator.isAbsolute || operator.permissions.includes('settings.roles')

  const [roles, setRoles] = useState<RoleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<RoleRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyAction, setBusyAction] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<RoleRow | null>(null)
  const [form, setForm] = useState<{ name: string; description: string; permissionKeys: string[] }>({
    name: '',
    description: '',
    permissionKeys: [],
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiGet<{ roles: RoleRow[] }>('/api/roles')
      setRoles(res.roles)
    } catch (err) {
      toast.error('Erro ao carregar perfis', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function openForm(role?: RoleRow) {
    if (role) {
      setEditing(role)
      setForm({
        name: role.name,
        description: role.description ?? '',
        permissionKeys: role.permissionKeys,
      })
    } else {
      setEditing(null)
      setForm({ name: '', description: '', permissionKeys: [] })
    }
    setFormOpen(true)
  }

  async function submitForm() {
    if (!form.name.trim()) {
      toast.error('Informe o nome do perfil')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await apiPatch(`/api/roles/${editing.id}`, {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          permissionKeys: form.permissionKeys,
        })
        toast.success('Perfil atualizado', { description: form.name.trim() })
      } else {
        await apiPost('/api/roles', {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          permissionKeys: form.permissionKeys,
        })
        toast.success('Perfil criado', { description: form.name.trim() })
      }
      setFormOpen(false)
      await load()
    } catch (err) {
      toast.error('Erro ao salvar perfil', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  async function removeRole(role: RoleRow) {
    setBusyAction(true)
    try {
      await apiDelete(`/api/roles/${role.id}`)
      toast.success('Perfil excluído', { description: role.name })
      setDeleteTarget(null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir perfil')
      setDeleteTarget(null)
    } finally {
      setBusyAction(false)
    }
  }

  function deleteReason(role: RoleRow): string {
    if (role.isSystem) return 'Perfis do sistema não podem ser excluídos'
    if (role.usersCount > 0) return `Remova ou realoque os ${role.usersCount} usuário(s) vinculados antes de excluir`
    return 'Excluir perfil'
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          Perfis definem as permissões base; usuários podem receber concessões e restrições individuais.
        </p>
        <Button onClick={() => openForm()} disabled={!canRoles}>
          <Plus className="size-4" />
          Novo perfil
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-xl" />
          ))}
        </div>
      ) : roles.length === 0 ? (
        <Card className="rounded-xl border bg-card p-4">
          <CardContent className="text-muted-foreground py-8 text-center">
            Nenhum perfil cadastrado ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {roles.map((r) => {
            const deletable = !r.isSystem && r.usersCount === 0
            return (
              <Card key={r.id} className="flex flex-col rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{r.name}</p>
                    <p className="text-muted-foreground mt-0.5 line-clamp-2 min-h-8 text-sm">
                      {r.description || 'Sem descrição'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          disabled={!canRoles}
                          onClick={() => openForm(r)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Editar perfil</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive size-8"
                            disabled={!canRoles || !deletable}
                            onClick={() => setDeleteTarget(r)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{deleteReason(r)}</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {r.isSystem && <Badge variant="outline">Sistema</Badge>}
                  {r.isAbsolute && <Badge>Absoluto</Badge>}
                  <Badge variant="outline">
                    {r.usersCount} {r.usersCount === 1 ? 'usuário' : 'usuários'}
                  </Badge>
                  <Badge variant="outline">
                    {r.permissionKeys.length} {r.permissionKeys.length === 1 ? 'permissão' : 'permissões'}
                  </Badge>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* Dialog criar/editar perfil */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto scrollbar-thin sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar perfil' : 'Novo perfil'}</DialogTitle>
            <DialogDescription>Defina o nome e as permissões base concedidas a este perfil.</DialogDescription>
          </DialogHeader>
          {editing?.isAbsolute && (
            <Alert className="border-amber-500/40 bg-amber-500/10">
              <ShieldAlert className="size-4 text-amber-400" />
              <AlertDescription className="text-amber-400">
                Perfil com privilégios absolutos: recebe automaticamente todas as permissões do catálogo.
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-4 py-1">
            <div className="grid gap-2">
              <Label htmlFor="role-name">Nome *</Label>
              <Input
                id="role-name"
                value={form.name}
                disabled={!!editing?.isAbsolute}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex.: Caixa da manhã"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role-description">Descrição</Label>
              <Textarea
                id="role-description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Finalidade do perfil dentro da operação"
              />
            </div>
            <div className="grid gap-2">
              <Label>Permissões do perfil</Label>
              <RolePermissionMatrix
                selected={form.permissionKeys}
                onChange={(keys) => setForm((f) => ({ ...f, permissionKeys: keys }))}
                readOnly={!!editing?.isAbsolute}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void submitForm()} disabled={saving}>
              {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar perfil'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog excluir perfil */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir perfil {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              O perfil será removido permanentemente. Perfis do sistema ou com usuários vinculados não podem ser
              excluídos e a operação será recusada pelo servidor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyAction}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={busyAction}
              onClick={(e) => {
                e.preventDefault()
                void (deleteTarget && removeRole(deleteTarget))
              }}
            >
              <Trash2 className="size-4" />
              {busyAction ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ============ Aba Auditoria ============

function AuditTab() {
  const [logs, setLogs] = useState<AuditLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [actionFilter, setActionFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const debSearch = useDebounced(search)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (actionFilter !== 'ALL') params.set('action', actionFilter)
      if (debSearch.trim()) params.set('search', debSearch.trim())
      params.set('limit', '100')
      const res = await apiGet<{ logs: AuditLogRow[] }>(`/api/audit-logs?${params.toString()}`)
      setLogs(res.logs)
    } catch (err) {
      toast.error('Erro ao carregar auditoria', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setLoading(false)
    }
  }, [actionFilter, debSearch])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todas as ações</SelectItem>
            {Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por usuário ou detalhe"
            className="w-full pl-8 sm:w-64"
          />
        </div>
        <Button variant="outline" size="icon" onClick={() => void load()} disabled={loading} title="Atualizar">
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <Card className="rounded-xl border bg-card p-4">
        <CardContent className="px-0">
          <div className="max-h-96 overflow-y-auto scrollbar-thin">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Ação</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead className="hidden md:table-cell">Detalhe</TableHead>
                  <TableHead className="hidden md:table-cell">IP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground py-8 text-center">
                      Nenhum registro de auditoria encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap tabular-nums">{dthr(l.createdAt)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{AUDIT_ACTION_LABELS[l.action] ?? l.action}</Badge>
                      </TableCell>
                      <TableCell>
                        {l.result === 'SUCCESS' ? (
                          <Badge>Sucesso</Badge>
                        ) : (
                          <Badge variant="destructive">Falha</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{l.actor || '-'}</p>
                          <p className="text-muted-foreground truncate text-xs">{l.userEmail || '-'}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden max-w-56 truncate md:table-cell">
                        {l.detail ?? '-'}
                      </TableCell>
                      <TableCell className="hidden tabular-nums md:table-cell">{l.ip ?? '-'}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
