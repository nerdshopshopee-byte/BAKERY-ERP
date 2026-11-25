'use client'

// BAKERY ERP - Clientes (cadastro, fiado e pontos de fidelidade)
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Cake,
  Coins,
  Pencil,
  Save,
  Search,
  Star,
  Trash2,
  Users,
} from 'lucide-react'

import type { CustomerDTO } from '@/lib/types'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api'
import { brl, num } from '@/lib/format'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type CustomerForm = {
  id?: string
  name: string
  phone: string
  address: string
  birthday: string
  notes: string
}

const emptyForm: CustomerForm = { name: '', phone: '', address: '', birthday: '', notes: '' }

// ============ View ============

export default function CustomersView({ operator }: ViewProps) {
  const [loading, setLoading] = useState(true)
  const [customers, setCustomers] = useState<CustomerDTO[]>([])
  const [search, setSearch] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<CustomerForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<CustomerDTO | null>(null)
  const [busyAction, setBusyAction] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await apiGet<CustomerDTO[]>('/api/customers')
      setCustomers(list)
    } catch (err) {
      toast.error('Erro ao carregar clientes', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const stats = useMemo(() => {
    const credit = customers.reduce((acc, c) => acc + c.creditBalance, 0)
    const points = customers.reduce((acc, c) => acc + c.points, 0)
    return { total: customers.length, credit, points }
  }, [customers])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return customers
    return customers.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.phone ?? '').toLowerCase().includes(q)
    )
  }, [customers, search])

  // ---------- Formulário ----------
  function openForm(customer?: CustomerDTO) {
    setForm(
      customer
        ? {
            id: customer.id,
            name: customer.name,
            phone: customer.phone ?? '',
            address: customer.address ?? '',
            birthday: customer.birthday ?? '',
            notes: customer.notes ?? '',
          }
        : { ...emptyForm }
    )
    setFormOpen(true)
  }

  async function submitForm() {
    if (!form.name.trim()) {
      toast.error('Nome do cliente é obrigatório')
      return
    }
    setSaving(true)
    try {
      const body = {
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
        birthday: form.birthday.trim() || undefined,
        notes: form.notes.trim() || undefined,
      }
      if (form.id) {
        await apiPatch<CustomerDTO>(`/api/customers/${form.id}`, body)
        toast.success('Cliente atualizado', { description: body.name })
      } else {
        await apiPost<CustomerDTO>('/api/customers', body)
        toast.success('Cliente cadastrado', { description: body.name })
      }
      setFormOpen(false)
      await load()
    } catch (err) {
      toast.error('Erro ao salvar cliente', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  async function removeCustomer(customer: CustomerDTO) {
    setBusyAction(true)
    try {
      await apiDelete<{ deleted?: boolean }>(`/api/customers/${customer.id}`)
      toast.success('Cliente excluído', { description: customer.name })
      setDeleteTarget(null)
      await load()
    } catch (err) {
      // Erros de negócio (vendas/recebimentos vinculados) chegam como 400 com mensagem
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir cliente')
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
            Clientes
          </h2>
          <p className="text-muted-foreground text-sm">
            Fidelidade, aniversários e saldo fiado · operador {operator.name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou telefone"
              className="w-56 pl-8"
            />
          </div>
          <Button onClick={() => openForm()}>
            <Pencil className="size-4" />
            Novo cliente
          </Button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-xl border bg-card p-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Total de clientes</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{num(stats.total)}</p>
            </div>
            <div className="bg-primary/10 flex size-9 items-center justify-center rounded-lg">
              <Users className="text-primary size-5" />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border bg-card p-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Total fiado</p>
              <p className={`mt-1 text-2xl font-semibold tabular-nums ${stats.credit > 0 ? 'text-destructive' : ''}`}>
                {brl(stats.credit)}
              </p>
              {stats.credit > 0 && (
                <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
                  cobrança pendente
                </Badge>
              )}
            </div>
            <div className="bg-destructive/10 flex size-9 items-center justify-center rounded-lg">
              <Coins className="size-5 text-destructive" />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border bg-card p-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Pontos acumulados</p>
              <p className="text-primary mt-1 text-2xl font-semibold tabular-nums">{num(stats.points)}</p>
            </div>
            <div className="bg-primary/10 flex size-9 items-center justify-center rounded-lg">
              <Star className="text-primary size-5" />
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
                    <TableHead>Nome</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Endereço</TableHead>
                    <TableHead>Aniversário</TableHead>
                    <TableHead className="text-right">Pontos</TableHead>
                    <TableHead className="text-right">Fiado</TableHead>
                    <TableHead>Notas</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-muted-foreground py-6 text-center">
                        {search ? 'Nenhum cliente encontrado para a busca.' : 'Nenhum cliente cadastrado ainda.'}
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="tabular-nums">{c.phone ?? '-'}</TableCell>
                      <TableCell className="text-muted-foreground max-w-40 truncate">{c.address ?? '-'}</TableCell>
                      <TableCell>
                        {c.birthday ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Cake className="text-primary size-3.5" />
                            <span className="tabular-nums">{c.birthday}</span>
                          </span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-400">
                          <Star className="size-3" />
                          {num(c.points)}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right font-medium tabular-nums ${c.creditBalance > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {c.creditBalance > 0 ? brl(c.creditBalance) : '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-40 truncate">{c.notes ?? '-'}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            title="Editar"
                            onClick={() => openForm(c)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive size-8"
                            title="Excluir"
                            onClick={() => setDeleteTarget(c)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog criar/editar */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Editar cliente' : 'Novo cliente'}</DialogTitle>
            <DialogDescription>Dados de contato, aniversário e observações internas.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="customer-name">Nome *</Label>
              <Input
                id="customer-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nome completo"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="customer-phone">Telefone</Label>
                <Input
                  id="customer-phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="(11) 99999-0000"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="customer-birthday">Aniversário (dd/mm)</Label>
                <Input
                  id="customer-birthday"
                  value={form.birthday}
                  onChange={(e) => setForm((f) => ({ ...f, birthday: e.target.value }))}
                  placeholder="dd/mm"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="customer-address">Endereço</Label>
              <Input
                id="customer-address"
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Rua, número, bairro"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="customer-notes">Notas</Label>
              <Textarea
                id="customer-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Preferências, restrições alimentares..."
              />
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
            <AlertDialogTitle>Excluir cliente {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              O cadastro será removido permanentemente. Clientes com vendas ou recebimentos vinculados não podem ser
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
                void (deleteTarget && removeCustomer(deleteTarget))
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
