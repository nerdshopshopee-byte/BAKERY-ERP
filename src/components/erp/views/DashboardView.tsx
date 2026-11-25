'use client'

// BAKERY ERP - Dashboard gerencial: KPIs, gráficos e alertas operacionais.
// Fonte de dados: GET /api/dashboard (refresh automático a cada 30s).

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  ClipboardList,
  CookingPot,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

import { apiGet } from '@/lib/api'
import { brl, hr, num, pct, PAYMENT_METHOD_LABELS, ROLE_LABELS } from '@/lib/format'
import type { AlertDTO, DashboardDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import type { ViewProps } from '../view-props'

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
]

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--foreground)',
}

function compactBRL(value: number | string): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return ''
  if (Math.abs(n) >= 1000) return `R$ ${num(n / 1000, 1)}k`
  return `R$ ${num(n, 0)}`
}

function fmtQty(qty: number): string {
  return Number.isInteger(qty) ? num(qty) : num(qty, 2)
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

// ============================== PRIMITIVOS ==============================

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums md:text-3xl">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  )
}

function PanelCard({
  title,
  className,
  children,
}: {
  title: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('rounded-xl border border-border bg-card', className)}>
      <div className="border-b border-border/60 px-4 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  )
}

function MiniStat({
  icon: Icon,
  label,
  value,
  pulse,
}: {
  icon: LucideIcon
  label: string
  value: string
  pulse?: boolean
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{label}</span>
          {pulse ? (
            <Badge className="animate-pulse border border-primary/40 bg-primary/20 px-1.5 py-0 text-[10px] text-primary">
              aberto
            </Badge>
          ) : null}
        </p>
        <p className="text-lg font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  )
}

function alertBadge(level: string): { variant: 'destructive' | 'secondary' | 'outline'; label: string } {
  switch (level) {
    case 'CRITICAL':
      return { variant: 'destructive', label: 'Crítico' }
    case 'WARNING':
      return { variant: 'secondary', label: 'Atenção' }
    case 'INFO':
      return { variant: 'outline', label: 'Info' }
    default:
      return { variant: 'outline', label: level || 'Info' }
  }
}

function AlertRow({ alert }: { alert: AlertDTO }) {
  const meta = alertBadge(alert.level)
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Badge
            variant={meta.variant}
            className={
              meta.variant === 'secondary'
                ? 'border border-primary/30 bg-primary/15 text-primary'
                : undefined
            }
          >
            {meta.label}
          </Badge>
          <span className="min-w-0 truncate">{alert.title}</span>
        </p>
        <span className="shrink-0 text-xs text-muted-foreground">{hr(alert.createdAt)}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{alert.message}</p>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-xl lg:col-span-2" />
        <Skeleton className="h-80 rounded-xl" />
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  )
}

// ============================== VIEW ==============================

export default function DashboardView({ operator }: ViewProps) {
  const [data, setData] = useState<DashboardDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    try {
      const dto = await apiGet<DashboardDTO>('/api/dashboard')
      setData(dto)
      setUpdatedAt(new Date())
    } catch {
      toast.error('Não foi possível carregar os dados do dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const timer = setInterval(() => {
      void load({ silent: true })
    }, 30000)
    return () => clearInterval(timer)
  }, [load])

  async function handleRefresh() {
    setRefreshing(true)
    await load({ silent: true })
    setRefreshing(false)
  }

  if (loading && !data) {
    return <DashboardSkeleton />
  }

  if (!data) {
    return (
      <EmptyHint text="Sem dados disponíveis. Clique em atualizar para tentar novamente." />
    )
  }

  const paymentData = data.paymentMethods ?? []

  return (
    <div className="space-y-4">
      {/* Cabeçalho da visão geral */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {greeting()}, {operator.name}
          </h2>
          <p className="text-xs text-muted-foreground">
            Perfil: {ROLE_LABELS[operator.role]}
            {updatedAt ? ` • Atualizado às ${hr(updatedAt)}` : ''}
            {' • '}Atualização automática a cada 30s
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label="Atualizar dados do dashboard"
        >
          <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />
          Atualizar
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCard
          icon={Banknote}
          label="Faturamento hoje"
          value={brl(data.revenueToday)}
          sub={`semana: ${brl(data.revenueWeek)} • mês: ${brl(data.revenueMonth)}`}
        />
        <KpiCard
          icon={ShoppingBag}
          label="Vendas de hoje"
          value={num(data.salesCountToday)}
          sub={`Ticket médio: ${brl(data.avgTicketToday)}`}
        />
        <KpiCard
          icon={TrendingUp}
          label="Lucro estimado hoje"
          value={brl(data.profitToday)}
          sub={`Margem: ${pct(data.marginToday)}`}
        />
        <KpiCard icon={Wallet} label="Saldo em caixa" value={brl(data.cashBalance)} />
      </div>

      {/* Grid principal */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Faturamento 14 dias */}
        <PanelCard title="Faturamento - últimos 14 dias" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data.revenueHistory} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="dashboardRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
                width={56}
                tickFormatter={(value: number | string) => compactBRL(value)}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value) => brl(Number(value))}
                cursor={{ stroke: 'var(--chart-1)', strokeOpacity: 0.4 }}
              />
              <Area
                type="monotone"
                dataKey="total"
                name="Faturamento"
                stroke="var(--chart-1)"
                strokeWidth={2}
                fill="url(#dashboardRevenueGradient)"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </PanelCard>

        {/* Formas de pagamento */}
        <PanelCard title="Formas de pagamento (hoje)">
          {paymentData.length === 0 ? (
            <EmptyHint text="Nenhuma venda registrada hoje." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={paymentData}
                  dataKey="total"
                  nameKey="method"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  strokeWidth={0}
                >
                  {paymentData.map((entry, index) => (
                    <Cell key={entry.method} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value) => [brl(Number(value)), undefined]}
                />
                <Legend
                  iconSize={9}
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(value) => PAYMENT_METHOD_LABELS[String(value)] ?? String(value)}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </PanelCard>

        {/* Vendas por categoria */}
        <PanelCard title="Vendas por categoria (30 dias)" className="lg:col-span-2">
          {data.categorySales.length === 0 ? (
            <EmptyHint text="Nenhuma venda registrada nos últimos 30 dias." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={data.categorySales}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value: number | string) => compactBRL(value)}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={130}
                  tick={{ fontSize: 11, fill: 'var(--foreground)' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value) => brl(Number(value))}
                  cursor={{ fill: 'var(--accent)' }}
                />
                <Bar dataKey="total" name="Total vendido" fill="var(--chart-1)" radius={[0, 4, 4, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </PanelCard>

        {/* Top produtos */}
        <PanelCard title="Top produtos">
          {data.topProducts.length === 0 ? (
            <EmptyHint text="Nenhuma venda registrada ainda." />
          ) : (
            <div className="max-h-64 space-y-2 overflow-y-auto scrollbar-thin pr-1">
              {data.topProducts.map((product, index) => (
                <div
                  key={`${product.name}-${index}`}
                  className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{product.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {fmtQty(product.qty)}x
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {brl(product.total)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </PanelCard>

        {/* Operação agora */}
        <PanelCard title="Operação agora">
          <div className="grid grid-cols-2 gap-3">
            <MiniStat
              icon={ClipboardList}
              label="Pedidos abertos"
              value={num(data.ordersOpen)}
              pulse={data.ordersOpen > 0}
            />
            <MiniStat
              icon={CookingPot}
              label="Produção pendente"
              value={num(data.productionPending)}
            />
            <MiniStat
              icon={ArrowUpRight}
              label="Contas a pagar pendentes"
              value={brl(data.payablesPending)}
            />
            <MiniStat
              icon={ArrowDownRight}
              label="Contas a receber"
              value={brl(data.receivablesPending)}
            />
          </div>
        </PanelCard>

        {/* Alertas de estoque */}
        <PanelCard title="Alertas de estoque">
          {data.lowStockIngredients.length === 0 ? (
            <EmptyHint text="Estoque saudável - nenhum ingrediente abaixo do mínimo." />
          ) : (
            <div className="space-y-3">
              {data.lowStockIngredients.map((ingredient) => {
                const ratio =
                  ingredient.minStock > 0
                    ? Math.min(100, (ingredient.stock / ingredient.minStock) * 100)
                    : 100
                const critical = ingredient.stock <= ingredient.minStock * 0.5
                return (
                  <div key={ingredient.name}>
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{ingredient.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        mín {num(ingredient.minStock)} {ingredient.unit}
                      </span>
                    </div>
                    <Progress
                      value={ratio}
                      className={cn(
                        'mt-1.5 bg-muted',
                        critical && '[&>div]:bg-destructive'
                      )}
                      aria-label={`Estoque de ${ingredient.name}`}
                    />
                    <p
                      className={cn(
                        'mt-1 text-xs',
                        critical ? 'font-medium text-destructive' : 'text-muted-foreground'
                      )}
                    >
                      Atual: {fmtQty(ingredient.stock)} {ingredient.unit}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </PanelCard>

        {/* Alertas recentes */}
        <PanelCard title="Alertas recentes">
          {data.alerts.length === 0 ? (
            <EmptyHint text="Nenhum alerta no momento." />
          ) : (
            <div className="max-h-64 space-y-3 overflow-y-auto scrollbar-thin pr-1">
              {data.alerts.map((alert) => (
                <AlertRow key={alert.id} alert={alert} />
              ))}
            </div>
          )}
        </PanelCard>
      </div>
    </div>
  )
}
