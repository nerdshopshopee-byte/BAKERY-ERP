'use client'

// BAKERY ERP - Encomendas (bolos personalizados, festas e salgados com sinal e retirada)
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  CalendarClock,
  Cake,
  ClipboardList,
  Coins,
  PartyPopper,
  Save,
  Search,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react'

import type { BookingDTO } from '@/lib/types'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api'
import { brl, dt, hr } from '@/lib/format'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const KIND_LABELS: Record<string, string> = {
  BOLO: 'Bolo personalizado',
  FESTA: 'Festa/Evento',
  SALGADOS: 'Salgados',
  OUTROS: 'Outros',
}

const KIND_ICONS: Record<string, typeof Cake> = {
  BOLO: Cake,
  FESTA: PartyPopper,
  SALGADOS: UtensilsCrossed,
  OUTROS: ClipboardList,
}

const STATUS_LABELS: Record<string, string> = {
  ORCAMENTO: 'Orçamento',
  CONFIRMADA: 'Confirmada',
  EM_PRODUCAO: 'Em produção',
  PRONTA: 'Pronta',
  RETIRADA: 'Retirada',
  CANCELADA: 'Cancelada',
}

const STATUS_STYLES: Record<string, string> = {
  ORCAMENTO: 'border-muted-foreground/40 bg-muted-foreground/10 text-muted-foreground',
  CONFIRMADA: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
  EM_PRODUCAO: 'border-sky-500/40 bg-sky-500/10 text-sky-400',
  PRONTA: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  RETIRADA: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  CANCELADA: 'border-destructive/40 bg-destructive/10 text-destructive',
}

// Próximo passo do fluxo: [status atual] -> { próximo status, label do botão }
const NEXT_STEP: Record<string, { next: string; label: string }> = {
  ORCAMENTO: { next: 'CONFIRMADA', label: 'Confirmar' },
  CONFIRMADA: { next: 'EM_PRODUCAO', label: 'Produzir' },
  EM_PRODUCAO: { next: 'PRONTA', label: 'Concluir' },
  PRONTA: { next: 'RETIRADA', label: 'Retirar' },
}

function numField(v: string): number | null {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}

function nowLocalInput(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

type BookingForm = {
  customerName: string
  phone: string
  kind: string
  description: string
  serveQty: string
  dueDate: string
  totalAmount: string
  deposit: string
  notes: string
}

const emptyForm: BookingForm = {
  customerName: '',
  phone: '',
  kind: 'BOLO',
  description: '',
  serveQty: '',
  dueDate: '',
  totalAmount: '',
  deposit: '',
  notes: '',
}

// ============ View ============

export default function BookingsView({ operator }: ViewProps) {
  const [loading, setLoading] = useState(true)
  const [bookings, setBookings] = useState<BookingDTO[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('TODAS')

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<BookingForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<BookingDTO | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await apiGet<BookingDTO[]>('/api/bookings')
      setBookings(list)
    } catch (err) {
      toast.error('Erro ao carregar encomendas', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const stats = useMemo(() => {
    const active = bookings.filter((b) => !['RETIRADA', 'CANCELADA'].includes(b.status))
    const toReceive = active.reduce((acc, b) => acc + Math.max(0, b.totalAmount - b.deposit), 0)
    const soon = new Date(Date.now() + 48 * 60 * 60 * 1000)
    const upcoming = active.filter((b) => new Date(b.dueDate) <= soon).length
    return { active: active.length, toReceive, upcoming }
  }, [bookings])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return bookings.filter((b) => {
      if (statusFilter !== 'TODAS' && b.status !== statusFilter) return false
      if (!q) return true
      return (
        b.customerName.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q) ||
        b.description.toLowerCase().includes(q)
      )
    })
  }, [bookings, search, statusFilter])

  // ---------- Formulário ----------
  async function submitForm() {
    if (!form.customerName.trim()) {
      toast.error('Nome do cliente é obrigatório')
      return
    }
    if (!form.description.trim()) {
      toast.error('Descrição da encomenda é obrigatória')
      return
    }
    if (!form.dueDate) {
      toast.error('Informe a data e horário de retirada')
      return
    }
    const totalAmount = numField(form.totalAmount) ?? 0
    const deposit = numField(form.deposit) ?? 0
    if (deposit > totalAmount) {
      toast.error('Sinal não pode ser maior que o valor total')
      return
    }
    setSaving(true)
    try {
      await apiPost<BookingDTO>('/api/bookings', {
        customerName: form.customerName.trim(),
        phone: form.phone.trim() || undefined,
        kind: form.kind,
        description: form.description.trim(),
        serveQty: numField(form.serveQty) ?? undefined,
        dueDate: new Date(form.dueDate).toISOString(),
        totalAmount,
        deposit,
        notes: form.notes.trim() || undefined,
      })
      toast.success('Encomenda registrada', { description: `${form.customerName} - retirada ${dt(form.dueDate)} ${hr(form.dueDate)}` })
      setFormOpen(false)
      setForm(emptyForm)
      await load()
    } catch (err) {
      toast.error('Erro ao salvar encomenda', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  // ---------- Fluxo de status ----------
  async function advance(b: BookingDTO) {
    const step = NEXT_STEP[b.status]
    if (!step) return
    setBusyId(b.id)
    try {
      await apiPatch<BookingDTO>(`/api/bookings/${b.id}`, { status: step.next })
      toast.success(`Encomenda ${b.code} · ${STATUS_LABELS[step.next]}`)
      await load()
    } catch (err) {
      toast.error('Erro ao atualizar encomenda', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setBusyId(null)
    }
  }

  async function removeBooking(b: BookingDTO) {
    setBusyId(b.id)
    try {
      await apiDelete(`/api/bookings/${b.id}`)
      toast.success('Encomenda excluída', { description: b.code })
      setDeleteTarget(null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir encomenda')
      setDeleteTarget(null)
    } finally {
      setBusyId(null)
    }
  }

  // ---------- Render ----------
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Cake className="text-primary size-5" />
            Encomendas
          </h2>
          <p className="text-muted-foreground text-sm">
            Bolos, festas e salgados · sinal, saldo e retirada · operador {operator.name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente ou código"
              className="w-56 pl-8"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40" aria-label="Filtrar por status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAS">Todos os status</SelectItem>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => {
              setForm(emptyForm)
              setFormOpen(true)
            }}
          >
            <Cake className="size-4" />
            Nova encomenda
          </Button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-xl border bg-card p-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Encomendas ativas</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{stats.active}</p>
            </div>
            <div className="bg-primary/10 flex size-9 items-center justify-center rounded-lg">
              <ClipboardList className="text-primary size-5" />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border bg-card p-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Saldo a receber</p>
              <p className="text-primary mt-1 text-2xl font-semibold tabular-nums">{brl(stats.toReceive)}</p>
              <p className="text-muted-foreground text-xs">total - sinal das ativas</p>
            </div>
            <div className="bg-primary/10 flex size-9 items-center justify-center rounded-lg">
              <Coins className="text-primary size-5" />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border bg-card p-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Retirada em 48h</p>
              <p className={`mt-1 text-2xl font-semibold tabular-nums ${stats.upcoming > 0 ? 'text-amber-400' : ''}`}>
                {stats.upcoming}
              </p>
            </div>
            <div className="bg-amber-500/10 flex size-9 items-center justify-center rounded-lg">
              <CalendarClock className="size-5 text-amber-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <Card className="rounded-xl border bg-card p-4">
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Retirada</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Sinal</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-muted-foreground py-6 text-center">
                        {search || statusFilter !== 'TODAS'
                          ? 'Nenhuma encomenda encontrada para os filtros.'
                          : 'Nenhuma encomenda registrada ainda.'}
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.map((b) => {
                    const KindIcon = KIND_ICONS[b.kind] ?? ClipboardList
                    const step = NEXT_STEP[b.status]
                    const saldo = Math.max(0, b.totalAmount - b.deposit)
                    const late = b.status !== 'RETIRADA' && b.status !== 'CANCELADA' && new Date(b.dueDate) < new Date()
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="font-mono text-xs font-medium">{b.code}</TableCell>
                        <TableCell>
                          <p className="font-medium">{b.customerName}</p>
                          <p className="text-muted-foreground text-xs tabular-nums">{b.phone ?? '-'}</p>
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center gap-1.5 text-sm">
                            <KindIcon className="text-primary size-4" />
                            {KIND_LABELS[b.kind] ?? b.kind}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-48">
                          <p className="truncate">{b.description}</p>
                          {b.serveQty ? (
                            <p className="text-muted-foreground text-xs">rend. {b.serveQty} {b.kind === 'SALGADOS' ? 'un' : 'pessoas'}</p>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <p className="tabular-nums">{dt(b.dueDate)}</p>
                          <p className="text-muted-foreground text-xs tabular-nums">{hr(b.dueDate)}{late ? ' · atrasada' : ''}</p>
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{brl(b.totalAmount)}</TableCell>
                        <TableCell className="text-muted-foreground text-right tabular-nums">{b.deposit > 0 ? brl(b.deposit) : '-'}</TableCell>
                        <TableCell className={`text-right font-medium tabular-nums ${b.status === 'RETIRADA' || b.status === 'CANCELADA' ? 'text-muted-foreground' : 'text-primary'}`}>
                          {b.status === 'RETIRADA' || b.status === 'CANCELADA' ? '-' : brl(saldo)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_STYLES[b.status] ?? ''}>
                            {STATUS_LABELS[b.status] ?? b.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {step && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8"
                                disabled={busyId === b.id}
                                onClick={() => void advance(b)}
                                aria-label={`${step.label} encomenda ${b.code}`}
                              >
                                {step.label}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive size-8"
                              title="Excluir"
                              onClick={() => setDeleteTarget(b)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog nova encomenda */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova encomenda</DialogTitle>
            <DialogDescription>Cliente, descrição, ficha de produção, sinal e retirada.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="booking-name">Cliente *</Label>
                <Input
                  id="booking-name"
                  value={form.customerName}
                  onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                  placeholder="Nome do cliente"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="booking-phone">Telefone</Label>
                <Input
                  id="booking-phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="(11) 99999-0000"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="booking-kind">Tipo *</Label>
                <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v }))}>
                  <SelectTrigger id="booking-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(KIND_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="booking-serve">Rendimento / pessoas</Label>
                <Input
                  id="booking-serve"
                  value={form.serveQty}
                  onChange={(e) => setForm((f) => ({ ...f, serveQty: e.target.value }))}
                  placeholder="Ex.: 30"
                  inputMode="decimal"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="booking-description">Descrição *</Label>
              <Input
                id="booking-description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Ex.: Bolo de chocolate com morangos, cobertura chantilly"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="booking-notes">Ficha de produção</Label>
              <Textarea
                id="booking-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Instruções específicas: recheio, decoração, restrições, embalagem..."
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="booking-due">Retirada *</Label>
                <Input
                  id="booking-due"
                  type="datetime-local"
                  value={form.dueDate}
                  onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="booking-total">Valor total (R$)</Label>
                <Input
                  id="booking-total"
                  value={form.totalAmount}
                  onChange={(e) => setForm((f) => ({ ...f, totalAmount: e.target.value }))}
                  placeholder="0,00"
                  inputMode="decimal"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="booking-deposit">Sinal pago (R$)</Label>
              <Input
                id="booking-deposit"
                value={form.deposit}
                onChange={(e) => setForm((f) => ({ ...f, deposit: e.target.value }))}
                placeholder="0,00"
                inputMode="decimal"
              />
              <p className="text-muted-foreground text-xs">
                Saldo restante é cobrado na retirada.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitForm} disabled={saving}>
              <Save className="size-4" />
              {saving ? 'Salvando...' : 'Registrar encomenda'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog excluir */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir encomenda {deleteTarget?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              O registro será removido permanentemente. Se já recebeu sinal, componda o acerto financeiro antes de excluir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId === deleteTarget?.id}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={busyId === deleteTarget?.id}
              onClick={(e) => {
                e.preventDefault()
                void (deleteTarget && removeBooking(deleteTarget))
              }}
            >
              <Trash2 className="size-4" />
              {busyId === deleteTarget?.id ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
