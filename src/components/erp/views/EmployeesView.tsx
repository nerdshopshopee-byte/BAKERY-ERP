'use client'

// BAKERY ERP - Equipe (funcionários, cargos e ponto)
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Briefcase,
  CalendarDays,
  LogIn,
  LogOut,
  Pencil,
  Phone,
  Save,
  Trash2,
  Users,
} from 'lucide-react'

import type { EmployeeDTO, TimeLogDTO } from '@/lib/types'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api'
import { brl, dt, num, ROLE_LABELS } from '@/lib/format'
import type { ViewProps } from '@/components/erp/view-props'
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

const ROLE_KEYS = Object.keys(ROLE_LABELS)

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const second = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return (first + second).toUpperCase() || '?'
}

type EmployeeForm = {
  id?: string
  name: string
  role: string
  salary: string
  phone: string
  active: boolean
}

const emptyForm: EmployeeForm = { name: '', role: 'ATENDENTE', salary: '', phone: '', active: true }

// ============ View ============

export default function EmployeesView({ operator }: ViewProps) {
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState<EmployeeDTO[]>([])
  const [punchedIn, setPunchedIn] = useState<Record<string, boolean>>({})

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<EmployeeForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<EmployeeDTO | null>(null)
  const [busyAction, setBusyAction] = useState(false)
  const [punchBusyId, setPunchBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await apiGet<EmployeeDTO[]>('/api/employees')
      setEmployees(list)
    } catch (err) {
      toast.error('Erro ao carregar equipe', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const stats = useMemo(() => {
    const active = employees.filter((e) => e.active)
    const payroll = active.reduce((acc, e) => acc + e.salary, 0)
    const roles = new Set(employees.map((e) => e.role))
    return { activeCount: active.length, payroll, roleCount: roles.size }
  }, [employees])

  // ---------- Ações ----------
  function openForm(employee?: EmployeeDTO) {
    setForm(
      employee
        ? {
            id: employee.id,
            name: employee.name,
            role: employee.role,
            salary: String(employee.salary),
            phone: employee.phone ?? '',
            active: employee.active,
          }
        : { ...emptyForm }
    )
    setFormOpen(true)
  }

  async function submitForm() {
    if (!form.name.trim()) {
      toast.error('Nome do funcionário é obrigatório')
      return
    }
    const salary = Number(form.salary)
    if (!Number.isFinite(salary) || salary < 0) {
      toast.error('Salário inválido')
      return
    }
    setSaving(true)
    try {
      const body = {
        name: form.name.trim(),
        role: form.role,
        salary,
        phone: form.phone.trim() || undefined,
        active: form.active,
      }
      if (form.id) {
        await apiPatch<EmployeeDTO>(`/api/employees/${form.id}`, body)
        toast.success('Funcionário atualizado')
      } else {
        await apiPost<EmployeeDTO>('/api/employees', body)
        toast.success('Funcionário cadastrado')
      }
      setFormOpen(false)
      await load()
    } catch (err) {
      toast.error('Erro ao salvar funcionário', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  async function punch(employee: EmployeeDTO) {
    setPunchBusyId(employee.id)
    try {
      const log = await apiPost<TimeLogDTO>(`/api/employees/${employee.id}/punch`)
      if (log.checkOut) {
        setPunchedIn((prev) => ({ ...prev, [employee.id]: false }))
        toast.success('Saída registrada', { description: `${employee.name} às ${new Date(log.checkOut).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` })
      } else {
        setPunchedIn((prev) => ({ ...prev, [employee.id]: true }))
        toast.success('Entrada registrada', { description: `${employee.name} às ${new Date(log.checkIn).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` })
      }
    } catch (err) {
      toast.error('Erro ao registrar ponto', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setPunchBusyId(null)
    }
  }

  async function removeEmployee(employee: EmployeeDTO) {
    setBusyAction(true)
    try {
      await apiDelete<{ deleted?: boolean }>(`/api/employees/${employee.id}`)
      toast.success('Funcionário excluído', { description: employee.name })
      setDeleteTarget(null)
      await load()
    } catch (err) {
      // Erros de negócio (ex.: registros de ponto vinculados) chegam como 400 com mensagem
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir funcionário')
      setDeleteTarget(null)
    } finally {
      setBusyAction(false)
    }
  }

  // ---------- Render ----------
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Users className="text-primary size-5" />
            Equipe
          </h2>
          <p className="text-muted-foreground text-sm">
            Cadastro, cargos e registro de ponto · sessão de {operator.name}
          </p>
        </div>
        <Button onClick={() => openForm()}>
          <Pencil className="size-4" />
          Novo funcionário
        </Button>
      </div>

      {/* Resumo */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-xl border bg-card p-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Total ativos</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{num(stats.activeCount)}</p>
            </div>
            <div className="bg-primary/10 flex size-9 items-center justify-center rounded-lg">
              <Users className="text-primary size-5" />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border bg-card p-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Folha salarial mensal</p>
              <p className="text-primary mt-1 text-2xl font-semibold tabular-nums">{brl(stats.payroll)}</p>
            </div>
            <div className="bg-primary/10 flex size-9 items-center justify-center rounded-lg">
              <Briefcase className="text-primary size-5" />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border bg-card p-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Cargos distintos</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{num(stats.roleCount)}</p>
            </div>
            <div className="bg-primary/10 flex size-9 items-center justify-center rounded-lg">
              <CalendarDays className="text-primary size-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grade de funcionários */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-52 w-full" />
          ))}
        </div>
      ) : employees.length === 0 ? (
        <Card className="rounded-xl border bg-card p-4">
          <CardContent className="py-10 text-center">
            <Users className="text-primary mx-auto size-8" />
            <p className="mt-2 font-medium">Nenhum funcionário cadastrado</p>
            <p className="text-muted-foreground text-sm">Adicione o primeiro membro da equipe.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {employees.map((employee) => {
            const isIn = punchedIn[employee.id]
            return (
              <Card key={employee.id} className="rounded-xl border bg-card p-4">
                <CardHeader className="px-0 pt-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="bg-primary/10 size-11">
                        <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                          {initials(employee.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="leading-tight font-semibold">{employee.name}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-400">
                            {ROLE_LABELS[employee.role] ?? employee.role}
                          </Badge>
                          {employee.active ? (
                            <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                              Ativo
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Inativo</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 px-0">
                  <p className="flex items-center gap-2 text-sm">
                    <Briefcase className="text-muted-foreground size-3.5" />
                    Salário: <span className="font-medium tabular-nums">{brl(employee.salary)}</span>
                  </p>
                  <p className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Phone className="size-3.5" />
                    {employee.phone ?? '-'}
                  </p>
                  <p className="text-muted-foreground flex items-center gap-2 text-sm">
                    <CalendarDays className="size-3.5" />
                    Admissão: <span className="tabular-nums">{dt(employee.hiredAt)}</span>
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5"
                      disabled={punchBusyId === employee.id}
                      onClick={() => punch(employee)}
                    >
                      {isIn ? <LogOut className="size-3.5" /> : <LogIn className="size-3.5" />}
                      Registrar ponto
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={() => openForm(employee)}>
                      <Pencil className="size-3.5" />
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 gap-1.5"
                      onClick={() => setDeleteTarget(employee)}
                    >
                      <Trash2 className="size-3.5" />
                      Excluir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Dialog criar/editar */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar funcionário' : 'Novo funcionário'}</DialogTitle>
            <DialogDescription>Dados do colaborador, cargo e salário mensal.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="employee-name">Nome *</Label>
              <Input
                id="employee-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nome completo"
              />
            </div>
            <div className="grid gap-2">
              <Label>Cargo</Label>
              <Select value={form.role} onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_KEYS.map((key) => (
                    <SelectItem key={key} value={key}>
                      {ROLE_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="employee-salary">Salário mensal (R$)</Label>
                <Input
                  id="employee-salary"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.salary}
                  onChange={(e) => setForm((f) => ({ ...f, salary: e.target.value }))}
                  placeholder="0,00"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="employee-phone">Telefone</Label>
                <Input
                  id="employee-phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="(11) 99999-0000"
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <Label htmlFor="employee-active" className="text-sm">
                Funcionário ativo
              </Label>
              <Switch id="employee-active" checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitForm} disabled={saving}>
              <Save className="size-4" />
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog excluir */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              O funcionário será removido permanentemente. Se houver registros de ponto vinculados, a exclusão será
              recusada pelo servidor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyAction}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={busyAction}
              onClick={(e) => {
                e.preventDefault()
                void (deleteTarget && removeEmployee(deleteTarget))
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
