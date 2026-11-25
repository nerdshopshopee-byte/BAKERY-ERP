'use client'

// BAKERY ERP - Pagamentos (Mercado Pago simulado: PIX, taxas e webhook)
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  CheckCircle2,
  Copy,
  MoreHorizontal,
  Plus,
  QrCode,
  RefreshCw,
  ShieldAlert,
  Webhook,
  XCircle,
} from 'lucide-react'

import type { CustomerDTO, PaymentDTO } from '@/lib/types'
import { apiGet, apiPatch, apiPost } from '@/lib/api'
import { brl, dthr } from '@/lib/format'
import type { ViewProps } from '@/components/erp/view-props'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ============ Helpers visuais ============

function PaymentStatusBadge({ status }: { status: PaymentDTO['status'] }) {
  if (status === 'PAGO') {
    return (
      <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
        <CheckCircle2 className="size-3" />
        Pago
      </Badge>
    )
  }
  if (status === 'CANCELADO') {
    return <Badge variant="secondary">Cancelado</Badge>
  }
  return (
    <Badge variant="outline" className="animate-pulse border-amber-500/40 bg-amber-500/10 text-amber-400">
      Pendente
    </Badge>
  )
}

function MethodBadge({ method }: { method: string }) {
  if (method === 'PIX') {
    return (
      <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-400">
        PIX
      </Badge>
    )
  }
  return (
    <Badge variant="outline">
      {method === 'CREDITO' ? 'Crédito' : method === 'DEBITO' ? 'Débito' : method}
    </Badge>
  )
}

async function copyText(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} copiado`)
  } catch {
    toast.error('Não foi possível copiar')
  }
}

// ============ View ============

export default function PaymentsView({ operator }: ViewProps) {
  const [loading, setLoading] = useState(true)
  const [payments, setPayments] = useState<PaymentDTO[]>([])
  const [customers, setCustomers] = useState<CustomerDTO[]>([])

  // gerar cobrança
  const [pixOpen, setPixOpen] = useState(false)
  const [pixForm, setPixForm] = useState({ amount: '', description: '', customerId: '' })
  const [pixBusy, setPixBusy] = useState(false)

  // dialog da cobrança ativa
  const [charge, setCharge] = useState<PaymentDTO | null>(null)
  const [chargeBusy, setChargeBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [pay, cus] = await Promise.all([
        apiGet<PaymentDTO[]>('/api/payments?limit=100'),
        apiGet<CustomerDTO[]>('/api/customers'),
      ])
      setPayments(pay)
      setCustomers(cus)
    } catch (err) {
      toast.error('Erro ao carregar pagamentos', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const kpis = useMemo(() => {
    let received = 0
    let pending = 0
    let fees = 0
    let net = 0
    for (const p of payments) {
      if (p.status === 'PAGO') {
        received += p.amount
        fees += p.fee
        net += p.netAmount
      } else if (p.status === 'PENDENTE') {
        pending += p.amount
      }
    }
    return { received, pending, fees, net }
  }, [payments])

  // ---------- Ações ----------
  async function createPix() {
    const amount = Number(pixForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Valor deve ser maior que zero')
      return
    }
    setPixBusy(true)
    try {
      const payment = await apiPost<PaymentDTO>('/api/payments/pix', {
        amount,
        description: pixForm.description.trim() || undefined,
        customerId: pixForm.customerId || undefined,
      })
      toast.success('Cobrança PIX gerada', { description: payment.externalId ?? payment.id })
      setPixOpen(false)
      setCharge(payment)
      const list = await apiGet<PaymentDTO[]>('/api/payments?limit=100')
      setPayments(list)
    } catch (err) {
      toast.error('Erro ao gerar cobrança', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setPixBusy(false)
    }
  }

  async function confirmPayment(payment: PaymentDTO) {
    setChargeBusy(true)
    try {
      const updated = await apiPatch<PaymentDTO>(`/api/payments/${payment.id}`, { action: 'confirm' })
      setPayments((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
      if (charge?.id === updated.id) setCharge(updated)
      toast.success('Pagamento confirmado', {
        description: `${brl(updated.amount)} · líquido ${brl(updated.netAmount)}`,
      })
    } catch (err) {
      toast.error('Erro ao confirmar pagamento', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setChargeBusy(false)
    }
  }

  async function cancelPayment(payment: PaymentDTO) {
    setChargeBusy(true)
    try {
      const updated = await apiPatch<PaymentDTO>(`/api/payments/${payment.id}`, { action: 'cancel' })
      setPayments((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
      if (charge?.id === updated.id) setCharge(updated)
      toast.info('Cobrança cancelada', { description: payment.externalId ?? payment.id })
    } catch (err) {
      toast.error('Erro ao cancelar cobrança', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setChargeBusy(false)
    }
  }

  // ---------- Render ----------
  const webhookExample = `POST /api/payments/webhook
Content-Type: application/json

{
  "data": { "id": "MP-1700000000000" }
}`

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <QrCode className="text-primary size-5" />
            Mercado Pago
          </h2>
          <p className="text-muted-foreground text-sm">Cobranças PIX, taxas e conciliação · operador {operator.name}</p>
        </div>
        <Button
          onClick={() => {
            setPixForm({ amount: '', description: '', customerId: '' })
            setPixOpen(true)
          }}
        >
          <Plus className="size-4" />
          Gerar cobrança PIX
        </Button>
      </div>

      {/* Banner demonstração */}
      <Card className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
        <CardContent className="flex items-start gap-3">
          <div className="bg-primary/10 flex size-10 shrink-0 items-center justify-center rounded-lg">
            <QrCode className="text-primary size-5" />
          </div>
          <div>
            <p className="font-medium">Integração Mercado Pago — modo demonstração</p>
            <p className="text-muted-foreground mt-1 text-sm">
              A API oficial exige <span className="font-mono text-foreground">MERCADO_PAGO_ACCESS_TOKEN</span>. Neste
              ambiente as cobranças PIX são simuladas localmente com o mesmo fluxo de payload/webhook do provedor.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Recebido', value: brl(kpis.received), hint: `${payments.filter((p) => p.status === 'PAGO').length} pagos` },
          { label: 'Pendente', value: brl(kpis.pending), hint: `${payments.filter((p) => p.status === 'PENDENTE').length} cobranças` },
          { label: 'Taxas', value: brl(kpis.fees), hint: 'sobre pagamentos confirmados' },
          { label: 'Líquido', value: brl(kpis.net), hint: 'recebido - taxas' },
        ].map((kpi) => (
          <Card key={kpi.label} className="rounded-xl border bg-card p-4">
            <CardContent>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">{kpi.label}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{kpi.value}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">{kpi.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabela de pagamentos */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <Card className="rounded-xl border bg-card p-4">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="text-primary size-4" />
              Pagamentos ({payments.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Criada</TableHead>
                    <TableHead>ID externo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Método</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">Taxa</TableHead>
                    <TableHead className="text-right">Líquido</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-muted-foreground py-6 text-center">
                        Nenhuma cobrança gerada ainda.
                      </TableCell>
                    </TableRow>
                  )}
                  {payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-muted-foreground text-xs">{dthr(p.createdAt)}</TableCell>
                      <TableCell className="font-mono text-xs">{p.externalId ?? '-'}</TableCell>
                      <TableCell className="max-w-44 truncate">{p.description ?? '-'}</TableCell>
                      <TableCell>
                        <MethodBadge method={p.method} />
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{brl(p.amount)}</TableCell>
                      <TableCell className="text-muted-foreground text-right tabular-nums">
                        {p.status === 'PAGO' ? brl(p.fee) : '-'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.status === 'PAGO' ? brl(p.netAmount) : '-'}
                      </TableCell>
                      <TableCell>
                        <PaymentStatusBadge status={p.status} />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          {p.status === 'PENDENTE' ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="size-8" title="Ações">
                                  <MoreHorizontal className="size-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Cobrança</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="gap-2 text-emerald-400 focus:text-emerald-300"
                                  onClick={() => void confirmPayment(p)}
                                >
                                  <CheckCircle2 className="size-4" />
                                  Confirmar
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive gap-2"
                                  onClick={() => void cancelPayment(p)}
                                >
                                  <XCircle className="size-4" />
                                  Cancelar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}
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

      {/* Webhook */}
      <Card className="rounded-xl border bg-card p-4">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <Webhook className="text-primary size-4" />
            Webhook
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <p className="text-muted-foreground mb-3 text-sm">
            Para integração real, cadastre no painel do Mercado Pago o endpoint abaixo. A notificação segue o formato
            oficial <span className="font-mono text-foreground">{`{ data: { id } }`}</span> e confirma a cobrança
            correspondente pelo ID externo.
          </p>
          <div className="relative rounded-lg border bg-muted/40 p-3">
            <pre className="overflow-x-auto font-mono text-xs whitespace-pre-wrap">
              <code>{webhookExample}</code>
            </pre>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 size-7"
              title="Copiar exemplo"
              onClick={() => void copyText(webhookExample, 'Exemplo de webhook')}
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Dialog: gerar cobrança */}
      <Dialog open={pixOpen} onOpenChange={setPixOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar cobrança PIX</DialogTitle>
            <DialogDescription>Crie uma cobrança PIX simulada no padrão de payload do Mercado Pago.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="pix-amount">Valor (R$) *</Label>
              <Input
                id="pix-amount"
                type="number"
                min="0"
                step="0.01"
                value={pixForm.amount}
                onChange={(e) => setPixForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0,00"
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pix-desc">Descrição</Label>
              <Input
                id="pix-desc"
                value={pixForm.description}
                onChange={(e) => setPixForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Ex.: Encomenda de bolo"
              />
            </div>
            <div className="grid gap-2">
              <Label>Cliente (opcional)</Label>
              <Select
                value={pixForm.customerId}
                onValueChange={(v) => setPixForm((f) => ({ ...f, customerId: v === 'none' ? '' : v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPixOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={createPix} disabled={pixBusy}>
              <QrCode className="size-4" />
              {pixBusy ? 'Gerando...' : 'Gerar PIX'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: cobrança ativa */}
      <Dialog open={!!charge} onOpenChange={(open) => !open && setCharge(null)}>
        <DialogContent className="max-w-md">
          {charge && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between gap-2">
                  Cobrança PIX
                  <PaymentStatusBadge status={charge.status} />
                </DialogTitle>
                <DialogDescription>
                  {charge.externalId} · criada em {dthr(charge.createdAt)}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="rounded-lg border bg-muted/30 p-4 text-center">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">Valor</p>
                  <p className="text-primary mt-1 text-3xl font-bold tabular-nums">{brl(charge.amount)}</p>
                  {charge.description && <p className="text-muted-foreground mt-1 text-sm">{charge.description}</p>}
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label>Código copia e cola</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      onClick={() => charge.pixCode && void copyText(charge.pixCode, 'Código PIX')}
                    >
                      <Copy className="size-3" />
                      Copiar
                    </Button>
                  </div>
                  <pre className="scrollbar-thin max-h-28 overflow-y-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs break-all whitespace-pre-wrap">
                    <code>{charge.pixCode ?? 'Código indisponível'}</code>
                  </pre>
                </div>

                {charge.status === 'PAGO' && (
                  <div className="space-y-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
                    <p className="flex items-center gap-1.5 font-medium text-emerald-400">
                      <CheckCircle2 className="size-4" />
                      Pagamento confirmado
                    </p>
                    <p className="text-muted-foreground">
                      Pago em {dthr(charge.paidAt)} · taxa {brl(charge.fee)} · líquido{' '}
                      <span className="font-medium text-foreground">{brl(charge.netAmount)}</span>
                    </p>
                  </div>
                )}

                {charge.status === 'CANCELADO' && (
                  <div className="text-muted-foreground flex items-center gap-1.5 rounded-lg border p-3 text-sm">
                    <ShieldAlert className="size-4" />
                    Esta cobrança foi cancelada e não pode mais ser paga.
                  </div>
                )}
              </div>

              {charge.status === 'PENDENTE' && (
                <DialogFooter className="flex-col gap-2 sm:flex-col">
                  <Button
                    variant="outline"
                    className="w-full gap-2 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                    disabled={chargeBusy}
                    onClick={() => void confirmPayment(charge)}
                  >
                    <Webhook className="size-4" />
                    {chargeBusy ? 'Confirmando...' : 'Simular confirmação de pagamento (webhook)'}
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-muted-foreground hover:text-destructive w-full gap-2 text-xs"
                    disabled={chargeBusy}
                    onClick={() => void cancelPayment(charge)}
                  >
                    <XCircle className="size-3.5" />
                    Cancelar cobrança
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
