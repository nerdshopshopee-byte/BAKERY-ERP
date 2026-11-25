'use client'

// BAKERY ERP - Gestão Financeira (visão geral, contas a pagar/receber e movimentações)
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  CalendarClock,
  Coins,
  HandCoins,
  Landmark,
  Plus,
  Receipt,
  Scale,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type {
  CustomerDTO,
  DashboardDTO,
  PayableDTO,
  ReceivableDTO,
  SupplierDTO,
  TransactionDTO,
} from '@/lib/types'
import { apiGet, apiPatch, apiPost } from '@/lib/api'
import { brl, dthr, dt, pct, ROLE_LABELS } from '@/lib/format'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ============ Constantes e helpers ============

const EXPENSE_CATEGORIES = ['INSUMOS', 'FOLHA', 'ALUGUEL', 'ENERGIA', 'TAXAS', 'OUTROS'] as const

const CATEGORY_LABELS: Record<string, string> = {
  INSUMOS: 'Insumos',
  FOLHA: 'Folha',
  ALUGUEL: 'Aluguel',
  ENERGIA: 'Energia',
  TAXAS: 'Taxas',
  OUTROS: 'Outros',
  VENDAS: 'Vendas',
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function todayISODate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function nowLocalInput(): string {
  const d = new Date()
  return `${todayISODate()}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function dayKey(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function DueBadge({ dueDate, pending }: { dueDate: string; pending: boolean }) {
  if (!pending) return null
  const due = new Date(dueDate)
  const today = startOfToday()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (due < today) {
    return (
      <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
        Atrasada
      </Badge>
    )
  }
  if (due < tomorrow) {
    return (
      <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-400">
        Vence hoje
      </Badge>
    )
  }
  return null
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  valueClass,
}: {
  icon: ReactNode
  label: string
  value: string
  hint?: string
  valueClass?: string
}) {
  return (
    <Card className="rounded-xl border bg-card p-4">
      <CardContent className="flex items-start justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-wide">{label}</p>
          <p className={`mt-1 text-xl font-semibold tabular-nums ${valueClass ?? ''}`}>{value}</p>
          {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
        </div>
        <div className="bg-primary/10 flex size-9 shrink-0 items-center justify-center rounded-lg">{icon}</div>
      </CardContent>
    </Card>
  )
}

function PayableStatusBadge({ status }: { status: PayableDTO['status'] }) {
  return status === 'PAGO' ? (
    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
      Pago
    </Badge>
  ) : (
    <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-400">
      Pendente
    </Badge>
  )
}

function ReceivableStatusBadge({ status }: { status: ReceivableDTO['status'] }) {
  return status === 'RECEBIDO' ? (
    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
      Recebido
    </Badge>
  ) : (
    <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-400">
      Pendente
    </Badge>
  )
}

// ============ View ============

export default function FinanceView({ operator }: ViewProps) {
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState<TransactionDTO[]>([])
  const [dashboard, setDashboard] = useState<DashboardDTO | null>(null)
  const [payables, setPayables] = useState<PayableDTO[]>([])
  const [receivables, setReceivables] = useState<ReceivableDTO[]>([])
  const [customers, setCustomers] = useState<CustomerDTO[]>([])
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([])

  const [tab, setTab] = useState('overview')

  // filtros de contas a pagar
  const [payStatus, setPayStatus] = useState('all')
  const [payCategory, setPayCategory] = useState('all')

  // dialogs
  const [payTarget, setPayTarget] = useState<PayableDTO | null>(null)
  const [receiveTarget, setReceiveTarget] = useState<ReceivableDTO | null>(null)
  const [busyAction, setBusyAction] = useState(false)

  const [payableOpen, setPayableOpen] = useState(false)
  const [payableForm, setPayableForm] = useState({ description: '', category: 'OUTROS', amount: '', dueDate: todayISODate(), supplierId: '' })
  const [payableBusy, setPayableBusy] = useState(false)

  const [receivableOpen, setReceivableOpen] = useState(false)
  const [receivableForm, setReceivableForm] = useState({ description: '', customerId: '', amount: '', dueDate: todayISODate() })
  const [receivableBusy, setReceivableBusy] = useState(false)

  const [transactionOpen, setTransactionOpen] = useState(false)
  const [transactionForm, setTransactionForm] = useState({ type: 'DESPESA', category: 'OUTROS', description: '', amount: '', date: nowLocalInput() })
  const [transactionBusy, setTransactionBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [tx, dash, pay, rec, cus, sup] = await Promise.all([
        apiGet<TransactionDTO[]>('/api/transactions?limit=500'),
        apiGet<DashboardDTO>('/api/dashboard'),
        apiGet<PayableDTO[]>('/api/payables'),
        apiGet<ReceivableDTO[]>('/api/receivables'),
        apiGet<CustomerDTO[]>('/api/customers'),
        apiGet<SupplierDTO[]>('/api/suppliers'),
      ])
      setTransactions(tx)
      setDashboard(dash)
      setPayables(pay)
      setReceivables(rec)
      setCustomers(cus)
      setSuppliers(sup)
    } catch (err) {
      toast.error('Erro ao carregar dados financeiros', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // ---------- KPIs ----------
  const kpis = useMemo(() => {
    let revenue = 0
    let expense = 0
    for (const t of transactions) {
      if (t.type === 'RECEITA') revenue += t.amount
      else expense += t.amount
    }
    const result = revenue - expense
    const margin = revenue > 0 ? (result / revenue) * 100 : 0
    return { revenue, expense, result, margin }
  }, [transactions])

  // ---------- Fluxo de caixa: últimos 14 dias ----------
  const cashflow = useMemo(() => {
    const buckets = new Map<string, { receita: number; despesa: number }>()
    for (const t of transactions) {
      const key = dayKey(t.date)
      const bucket = buckets.get(key) ?? { receita: 0, despesa: 0 }
      if (t.type === 'RECEITA') bucket.receita += t.amount
      else bucket.despesa += t.amount
      buckets.set(key, bucket)
    }
    const days: { label: string; Receita: number; Despesa: number }[] = []
    const today = startOfToday()
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      const key = dayKey(d)
      const bucket = buckets.get(key)
      days.push({
        label: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`,
        Receita: bucket?.receita ?? 0,
        Despesa: bucket?.despesa ?? 0,
      })
    }
    return days
  }, [transactions])

  // ---------- DRE do mês ----------
  const dre = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthTx = transactions.filter((t) => new Date(t.date) >= monthStart)
    const revenue = monthTx.filter((t) => t.type === 'RECEITA').reduce((acc, t) => acc + t.amount, 0)
    const expenses = monthTx.filter((t) => t.type === 'DESPESA')
    const byCategory = new Map<string, number>()
    let expenseTotal = 0
    for (const t of expenses) {
      const cat = t.category && CATEGORY_LABELS[t.category] ? t.category : 'OUTROS'
      byCategory.set(cat, (byCategory.get(cat) ?? 0) + t.amount)
      expenseTotal += t.amount
    }
    const lines = EXPENSE_CATEGORIES.map((cat) => ({
      key: cat,
      label: CATEGORY_LABELS[cat],
      value: byCategory.get(cat) ?? 0,
    })).filter((l) => l.value > 0)
    return { revenue, expenseTotal, lines, result: revenue - expenseTotal }
  }, [transactions])

  // ---------- Contas a pagar (filtro) ----------
  const filteredPayables = useMemo(() => {
    return payables.filter((p) => {
      if (payStatus !== 'all' && p.status !== payStatus) return false
      if (payCategory !== 'all' && (p.category ?? 'OUTROS') !== payCategory) return false
      return true
    })
  }, [payables, payStatus, payCategory])

  const payablesPendingTotal = useMemo(
    () => payables.filter((p) => p.status === 'PENDENTE').reduce((acc, p) => acc + p.amount, 0),
    [payables]
  )
  const receivablesPendingTotal = useMemo(
    () => receivables.filter((r) => r.status === 'PENDENTE').reduce((acc, r) => acc + r.amount, 0),
    [receivables]
  )

  // ---------- Ações ----------
  async function markPayablePaid(p: PayableDTO) {
    setBusyAction(true)
    try {
      await apiPatch<PayableDTO>(`/api/payables/${p.id}`, { action: 'pay' })
      toast.success('Conta marcada como paga', { description: `${p.description} - ${brl(p.amount)}` })
      setPayTarget(null)
      await load()
    } catch (err) {
      toast.error('Erro ao pagar conta', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setBusyAction(false)
    }
  }

  async function receiveReceivable(r: ReceivableDTO) {
    setBusyAction(true)
    try {
      await apiPatch<ReceivableDTO>(`/api/receivables/${r.id}`, { action: 'receive' })
      toast.success('Recebimento registrado', { description: `${r.description} - ${brl(r.amount)}` })
      setReceiveTarget(null)
      await load()
    } catch (err) {
      toast.error('Erro ao registrar recebimento', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setBusyAction(false)
    }
  }

  async function createPayable() {
    const amount = Number(payableForm.amount)
    if (!payableForm.description.trim()) {
      toast.error('Informe a descrição da conta')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Valor deve ser maior que zero')
      return
    }
    if (!payableForm.dueDate) {
      toast.error('Informe a data de vencimento')
      return
    }
    setPayableBusy(true)
    try {
      await apiPost<PayableDTO>('/api/payables', {
        description: payableForm.description.trim(),
        category: payableForm.category,
        amount,
        dueDate: payableForm.dueDate,
        supplierId: payableForm.supplierId || undefined,
      })
      toast.success('Conta a pagar criada')
      setPayableOpen(false)
      await load()
    } catch (err) {
      toast.error('Erro ao criar conta', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setPayableBusy(false)
    }
  }

  async function createReceivable() {
    const amount = Number(receivableForm.amount)
    if (!receivableForm.description.trim()) {
      toast.error('Informe a descrição do recebível')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Valor deve ser maior que zero')
      return
    }
    setReceivableBusy(true)
    try {
      await apiPost<ReceivableDTO>('/api/receivables', {
        description: receivableForm.description.trim(),
        customerId: receivableForm.customerId || undefined,
        amount,
        dueDate: receivableForm.dueDate,
      })
      toast.success('Recebível criado')
      setReceivableOpen(false)
      await load()
    } catch (err) {
      toast.error('Erro ao criar recebível', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setReceivableBusy(false)
    }
  }

  async function createTransaction() {
    const amount = Number(transactionForm.amount)
    if (!transactionForm.description.trim()) {
      toast.error('Informe a descrição da movimentação')
      return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Valor deve ser maior que zero')
      return
    }
    setTransactionBusy(true)
    try {
      await apiPost<TransactionDTO>('/api/transactions', {
        type: transactionForm.type,
        category: transactionForm.category,
        description: transactionForm.description.trim(),
        amount,
        date: new Date(transactionForm.date).toISOString(),
      })
      toast.success('Movimentação registrada')
      setTransactionOpen(false)
      await load()
    } catch (err) {
      toast.error('Erro ao registrar movimentação', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setTransactionBusy(false)
    }
  }

  // ---------- Render ----------
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Landmark className="text-primary size-5" />
            Gestão financeira
          </h2>
          <p className="text-muted-foreground text-sm">
            Resultado do período, contas em aberto e lançamentos manuais
          </p>
        </div>
        <Badge variant="secondary" className="gap-1.5">
          <Coins className="size-3" />
          {ROLE_LABELS[operator.role] ?? operator.role}: {operator.name}
        </Badge>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="payables">Contas a pagar</TabsTrigger>
          <TabsTrigger value="receivables">Contas a receber</TabsTrigger>
          <TabsTrigger value="transactions">Movimentações</TabsTrigger>
        </TabsList>

        {/* ================= VISÃO GERAL ================= */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              icon={<ArrowUpCircle className="text-primary size-5" />}
              label="Receitas"
              value={brl(kpis.revenue)}
              hint={`${transactions.filter((t) => t.type === 'RECEITA').length} lançamentos`}
            />
            <KpiCard
              icon={<ArrowDownCircle className="size-5 text-destructive" />}
              label="Despesas"
              value={brl(kpis.expense)}
              hint={`${transactions.filter((t) => t.type === 'DESPESA').length} lançamentos`}
            />
            <KpiCard
              icon={<Scale className="size-5" />}
              label="Resultado"
              value={brl(kpis.result)}
              valueClass={kpis.result >= 0 ? 'text-emerald-400' : 'text-destructive'}
              hint="receitas - despesas"
            />
            <KpiCard
              icon={<TrendingUp className="text-primary size-5" />}
              label="Margem"
              value={pct(kpis.margin)}
              valueClass={kpis.margin >= 0 ? 'text-emerald-400' : 'text-destructive'}
              hint="resultado / receitas"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <KpiCard
              icon={<Wallet className="text-primary size-5" />}
              label="Saldo em caixa"
              value={brl(dashboard?.cashBalance ?? 0)}
              hint="sessões de caixa"
            />
            <KpiCard
              icon={<Receipt className="size-5 text-destructive" />}
              label="Contas a pagar"
              value={brl(payablesPendingTotal)}
              hint={`${payables.filter((p) => p.status === 'PENDENTE').length} pendentes`}
            />
            <KpiCard
              icon={<HandCoins className="text-emerald-400 size-5" />}
              label="Contas a receber"
              value={brl(receivablesPendingTotal)}
              hint={`${receivables.filter((r) => r.status === 'PENDENTE').length} pendentes`}
            />
          </div>

          <Card className="rounded-xl border bg-card p-4">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="text-primary size-4" />
                Fluxo de caixa · últimos 14 dias
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cashflow} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} width={56} tickFormatter={(v: number) => brl(v).replace(/\s?R\$/g, '')} />
                    <RechartsTooltip
                      formatter={(value) => brl(Number(value))}
                      contentStyle={{
                        background: 'var(--popover)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        fontSize: 12,
                      }}
                      labelStyle={{ color: 'var(--foreground)' }}
                      cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    />
                    <Bar dataKey="Receita" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={22} />
                    <Bar dataKey="Despesa" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="text-muted-foreground mt-2 flex gap-4 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-[#f59e0b]" /> Receita
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-[#ef4444]" /> Despesa
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl border bg-card p-4">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="text-primary size-4" />
                DRE simplificada · mês atual
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                  <span className="text-sm font-medium">Faturamento</span>
                  <span className="text-amber-400 font-semibold tabular-nums">{brl(dre.revenue)}</span>
                </div>
                {dre.lines.map((line) => (
                  <div key={line.key} className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2">
                    <span className="text-muted-foreground flex items-center gap-2 text-sm">
                      <span className="bg-destructive/20 size-1.5 rounded-full" />
                      {line.label}
                      <span className="text-muted-foreground/70 text-xs">
                        {dre.revenue > 0 ? pct((line.value / dre.revenue) * 100) : '-'} da receita
                      </span>
                    </span>
                    <span className="tabular-nums">-{brl(line.value)}</span>
                  </div>
                ))}
                {dre.lines.length === 0 && (
                  <p className="text-muted-foreground py-2 text-center text-sm">Sem despesas lançadas no mês.</p>
                )}
                <div
                  className={`mt-2 flex items-center justify-between rounded-lg border px-3 py-2.5 font-semibold ${
                    dre.result >= 0 ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-destructive/40 bg-destructive/10'
                  }`}
                >
                  <span>= Resultado do mês</span>
                  <span className={`tabular-nums ${dre.result >= 0 ? 'text-emerald-400' : 'text-destructive'}`}>
                    {brl(dre.result)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= CONTAS A PAGAR ================= */}
        <TabsContent value="payables" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Select value={payStatus} onValueChange={setPayStatus}>
                <SelectTrigger className="w-40" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  <SelectItem value="PENDENTE">Pendentes</SelectItem>
                  <SelectItem value="PAGO">Pagas</SelectItem>
                </SelectContent>
              </Select>
              <Select value={payCategory} onValueChange={setPayCategory}>
                <SelectTrigger className="w-44" size="sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as categorias</SelectItem>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => {
                setPayableForm({ description: '', category: 'OUTROS', amount: '', dueDate: todayISODate(), supplierId: '' })
                setPayableOpen(true)
              }}
            >
              <Plus className="size-4" />
              Nova conta
            </Button>
          </div>

          <Card className="rounded-xl border bg-card p-4">
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Fornecedor</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayables.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-muted-foreground py-6 text-center">
                          Nenhuma conta encontrada com os filtros atuais.
                        </TableCell>
                      </TableRow>
                    )}
                    {filteredPayables.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.description}</TableCell>
                        <TableCell className="text-muted-foreground">{p.supplier ?? '-'}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{CATEGORY_LABELS[p.category ?? 'OUTROS'] ?? p.category}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="tabular-nums">{dt(p.dueDate)}</span>
                            <DueBadge dueDate={p.dueDate} pending={p.status === 'PENDENTE'} />
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{brl(p.amount)}</TableCell>
                        <TableCell>
                          <PayableStatusBadge status={p.status} />
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            {p.status === 'PENDENTE' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                                onClick={() => setPayTarget(p)}
                              >
                                Marcar pago
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= CONTAS A RECEBER ================= */}
        <TabsContent value="receivables" className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setReceivableForm({ description: '', customerId: '', amount: '', dueDate: todayISODate() })
                setReceivableOpen(true)
              }}
            >
              <Plus className="size-4" />
              Novo recebível
            </Button>
          </div>

          <Card className="rounded-xl border bg-card p-4">
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receivables.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-muted-foreground py-6 text-center">
                          Nenhum recebível registrado.
                        </TableCell>
                      </TableRow>
                    )}
                    {receivables.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.description}</TableCell>
                        <TableCell className="text-muted-foreground">{r.customer ?? '-'}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="tabular-nums">{dt(r.dueDate)}</span>
                            <DueBadge dueDate={r.dueDate} pending={r.status === 'PENDENTE'} />
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{brl(r.amount)}</TableCell>
                        <TableCell>
                          <ReceivableStatusBadge status={r.status} />
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            {r.status === 'PENDENTE' && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                                onClick={() => setReceiveTarget(r)}
                              >
                                Receber
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= MOVIMENTAÇÕES ================= */}
        <TabsContent value="transactions" className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setTransactionForm({ type: 'DESPESA', category: 'OUTROS', description: '', amount: '', date: nowLocalInput() })
                setTransactionOpen(true)
              }}
            >
              <Plus className="size-4" />
              Nova movimentação
            </Button>
          </div>

          <Card className="rounded-xl border bg-card p-4">
            <CardContent className="px-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>Método</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.slice(0, 100).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-muted-foreground py-6 text-center">
                          Nenhuma movimentação registrada.
                        </TableCell>
                      </TableRow>
                    )}
                    {transactions.slice(0, 100).map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-muted-foreground text-xs">{dthr(t.date)}</TableCell>
                        <TableCell>
                          {t.type === 'RECEITA' ? (
                            <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                              Receita
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
                              Despesa
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{CATEGORY_LABELS[t.category ?? 'OUTROS'] ?? t.category}</Badge>
                        </TableCell>
                        <TableCell className="max-w-56 truncate font-medium">{t.description}</TableCell>
                        <TableCell
                          className={`text-right font-medium tabular-nums ${t.type === 'RECEITA' ? 'text-emerald-400' : 'text-destructive'}`}
                        >
                          {t.type === 'RECEITA' ? '+' : '-'}
                          {brl(t.amount)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{t.method ?? '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ============ AlertDialog: pagar conta ============ */}
      <AlertDialog open={!!payTarget} onOpenChange={(open) => !open && setPayTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registrar pagamento?</AlertDialogTitle>
            <AlertDialogDescription>
              A conta &quot;{payTarget?.description}&quot; de {brl(payTarget?.amount ?? 0)} será marcada como paga e o
              valor será registrado como despesa. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyAction}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busyAction}
              onClick={(e) => {
                e.preventDefault()
                void (payTarget && markPayablePaid(payTarget))
              }}
            >
              {busyAction ? 'Registrando...' : 'Marcar pago'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ============ AlertDialog: receber ============ */}
      <AlertDialog open={!!receiveTarget} onOpenChange={(open) => !open && setReceiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Registrar recebimento?</AlertDialogTitle>
            <AlertDialogDescription>
              O recebível &quot;{receiveTarget?.description}&quot; de {brl(receiveTarget?.amount ?? 0)} será marcado
              como recebido e gerará uma receita. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyAction}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busyAction}
              onClick={(e) => {
                e.preventDefault()
                void (receiveTarget && receiveReceivable(receiveTarget))
              }}
            >
              {busyAction ? 'Registrando...' : 'Receber'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ============ Dialog: nova conta a pagar ============ */}
      <Dialog open={payableOpen} onOpenChange={setPayableOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova conta a pagar</DialogTitle>
            <DialogDescription>Lance despesas recorrentes ou pontuais com vencimento.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="payable-desc">Descrição *</Label>
              <Input
                id="payable-desc"
                value={payableForm.description}
                onChange={(e) => setPayableForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Ex.: Aluguel da loja"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Categoria</Label>
                <Select value={payableForm.category} onValueChange={(v) => setPayableForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="payable-amount">Valor (R$)</Label>
                <Input
                  id="payable-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={payableForm.amount}
                  onChange={(e) => setPayableForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0,00"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="payable-due">Vencimento</Label>
                <Input
                  id="payable-due"
                  type="date"
                  value={payableForm.dueDate}
                  onChange={(e) => setPayableForm((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label>Fornecedor (opcional)</Label>
                <Select value={payableForm.supplierId} onValueChange={(v) => setPayableForm((f) => ({ ...f, supplierId: v === 'none' ? '' : v }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Nenhum" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayableOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={createPayable} disabled={payableBusy}>
              {payableBusy ? 'Salvando...' : 'Criar conta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Dialog: novo recebível ============ */}
      <Dialog open={receivableOpen} onOpenChange={setReceivableOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo recebível</DialogTitle>
            <DialogDescription>Registre valores a receber de clientes ou terceiros.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="receivable-desc">Descrição *</Label>
              <Input
                id="receivable-desc"
                value={receivableForm.description}
                onChange={(e) => setReceivableForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Ex.: Encomenda de bolo - entrada"
              />
            </div>
            <div className="grid gap-2">
              <Label>Cliente (opcional)</Label>
              <Select value={receivableForm.customerId} onValueChange={(v) => setReceivableForm((f) => ({ ...f, customerId: v === 'none' ? '' : v }))}>
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
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="receivable-amount">Valor (R$)</Label>
                <Input
                  id="receivable-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={receivableForm.amount}
                  onChange={(e) => setReceivableForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0,00"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="receivable-due">Vencimento</Label>
                <Input
                  id="receivable-due"
                  type="date"
                  value={receivableForm.dueDate}
                  onChange={(e) => setReceivableForm((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceivableOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={createReceivable} disabled={receivableBusy}>
              {receivableBusy ? 'Salvando...' : 'Criar recebível'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Dialog: nova movimentação ============ */}
      <Dialog open={transactionOpen} onOpenChange={setTransactionOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova movimentação</DialogTitle>
            <DialogDescription>Lançamento manual de receita ou despesa no fluxo financeiro.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Tipo</Label>
                <Select value={transactionForm.type} onValueChange={(v) => setTransactionForm((f) => ({ ...f, type: v, category: v === 'RECEITA' ? 'VENDAS' : 'OUTROS' }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RECEITA">Receita</SelectItem>
                    <SelectItem value="DESPESA">Despesa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Categoria</Label>
                <Select value={transactionForm.category} onValueChange={(v) => setTransactionForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {transactionForm.type === 'RECEITA' ? (
                      <SelectItem value="VENDAS">Vendas</SelectItem>
                    ) : (
                      EXPENSE_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CATEGORY_LABELS[c]}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tx-desc">Descrição *</Label>
              <Input
                id="tx-desc"
                value={transactionForm.description}
                onChange={(e) => setTransactionForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Ex.: Manutenção do forno"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="tx-amount">Valor (R$)</Label>
                <Input
                  id="tx-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={transactionForm.amount}
                  onChange={(e) => setTransactionForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0,00"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tx-date">Data</Label>
                <Input
                  id="tx-date"
                  type="datetime-local"
                  value={transactionForm.date}
                  onChange={(e) => setTransactionForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="items-center sm:justify-between">
            <p className="text-muted-foreground text-xs">Operador: {operator.name}</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setTransactionOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={createTransaction} disabled={transactionBusy}>
                {transactionBusy ? 'Salvando...' : 'Registrar'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
