'use client'

// BAKERY ERP - Relatórios e Inteligência (DRE gerencial, vendas, top produtos, desperdício)
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  BarChart3,
  ChefHat,
  ClipboardCheck,
  Coins,
  Percent,
  PieChart as PieChartIcon,
  Timer,
  TrendingUp,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { ReportSummaryDTO } from '@/lib/types'
import { apiGet } from '@/lib/api'
import { brl, num, pct } from '@/lib/format'
import type { ViewProps } from '@/components/erp/view-props'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const DRE_EXPENSE_COLORS: Record<string, string> = {
  INSUMOS: '#f59e0b',
  FOLHA: '#fb923c',
  ALUGUEL: '#eab308',
  ENERGIA: '#f97316',
  TAXAS: '#a3a3a3',
  OUTROS: '#737373',
}

const PIE_COLORS = ['#f59e0b', '#fb923c', '#eab308', '#f97316', '#a16207', '#737373', '#d97706', '#facc15']

const METHOD_LABELS: Record<string, string> = {
  DINHEIRO: 'Dinheiro',
  PIX: 'PIX',
  DEBITO: 'Débito',
  CREDITO: 'Crédito',
  VALE: 'Vale/Convênio',
  FIADO: 'Fiado',
}

const REASON_LABELS: Record<string, string> = {
  VENCIDO: 'Vencido',
  QUEIMADO: 'Queimado',
  ERRO_PRODUCAO: 'Erro produção',
  DEVOLUCAO: 'Devolução',
  OUTROS: 'Outros',
}

const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
] as const

// ============ View ============

interface ProfitabilityRow {
  productId: string
  name: string
  saleUnit: string
  unitPrice: number
  unitCost: number
  soldQty: number
  revenue: number
  theoryCost: number
  wasteCost: number
  margin: number
  marginPct: number | null
  hasRecipe: boolean
}

interface ProfitabilityPayload {
  periodDays: number
  totals: { revenue: number; cost: number; waste: number; margin: number; marginPct: number | null }
  rows: ProfitabilityRow[]
}

export default function ReportsView({ operator }: ViewProps) {
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState<number>(30)
  const [report, setReport] = useState<ReportSummaryDTO | null>(null)
  const [profitability, setProfitability] = useState<ProfitabilityPayload | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [data, profit] = await Promise.all([
        apiGet<ReportSummaryDTO>(`/api/reports/summary?days=${days}`),
        apiGet<ProfitabilityPayload>(`/api/reports/profitability?days=${days}`),
      ])
      setReport(data)
      setProfitability(profit)
    } catch (err) {
      toast.error('Erro ao carregar relatórios', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    void load()
  }, [load])

  const dre = report?.dre

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <BarChart3 className="text-primary size-5" />
            Relatórios
          </h2>
          <p className="text-muted-foreground text-sm">
            DRE gerencial, vendas, produção e desperdício · operador {operator.name}
          </p>
        </div>
        <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <TabsList>
            {PERIODS.map((p) => (
              <TabsTrigger key={p.days} value={String(p.days)}>
                {p.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {loading || !report ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      ) : (
        <>
          {/* KPIs do período */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="rounded-xl border bg-card p-4">
              <CardContent className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">Receita no período</p>
                  <p className="text-primary mt-1 text-2xl font-semibold tabular-nums">{brl(dre?.revenue)}</p>
                  <p className="text-muted-foreground text-xs">{report.period.days} dias</p>
                </div>
                <div className="bg-primary/10 flex size-9 items-center justify-center rounded-lg">
                  <Coins className="text-primary size-5" />
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-xl border bg-card p-4">
              <CardContent className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">Lucro bruto</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">{brl(dre?.grossProfit)}</p>
                  <p className="text-muted-foreground text-xs">receita - custo dos produtos</p>
                </div>
                <div className="bg-primary/10 flex size-9 items-center justify-center rounded-lg">
                  <TrendingUp className="text-primary size-5" />
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-xl border bg-card p-4">
              <CardContent className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">Margem líquida</p>
                  <p className={`mt-1 text-2xl font-semibold tabular-nums ${(dre?.margin ?? 0) < 0 ? 'text-destructive' : 'text-emerald-400'}`}>
                    {pct(dre?.margin)}
                  </p>
                  <p className="text-muted-foreground text-xs">lucro líquido {brl(dre?.netProfit)}</p>
                </div>
                <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10">
                  <Percent className="size-5 text-emerald-400" />
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-xl border bg-card p-4">
              <CardContent className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">Ticket médio por pedido</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {brl(report.orders.total > 0 ? (dre?.revenue ?? 0) / report.orders.total : 0)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {report.orders.avgMinutes !== null ? `${num(report.orders.avgMinutes)} min de média` : 'sem entregas'}
                  </p>
                </div>
                <div className="bg-muted-foreground/10 flex size-9 items-center justify-center rounded-lg">
                  <Timer className="text-muted-foreground size-5" />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* DRE gerencial */}
            <Card className="rounded-xl border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="text-primary size-4" />
                  DRE gerencial
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Receita de vendas</span>
                    <span className="font-medium tabular-nums">{brl(dre?.revenue)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">(-) Custo dos produtos vendidos</span>
                    <span className="text-destructive font-medium tabular-nums">-{brl(dre?.cogs)}</span>
                  </div>
                  <div className="text-primary flex items-center justify-between border-t pt-1.5 font-medium">
                    <span>= Lucro bruto</span>
                    <span className="tabular-nums">{brl(dre?.grossProfit)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">(-) Despesas operacionais</span>
                    <span className="text-destructive font-medium tabular-nums">-{brl(dre?.totalExpenses)}</span>
                  </div>
                  <div className={`flex items-center justify-between border-t pt-1.5 font-semibold ${(dre?.netProfit ?? 0) < 0 ? 'text-destructive' : 'text-emerald-400'}`}>
                    <span>= Lucro líquido</span>
                    <span className="tabular-nums">{brl(dre?.netProfit)}</span>
                  </div>
                </div>
                {dre && dre.expensesByCategory.length > 0 ? (
                  <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dre.expensesByCategory.map((e) => ({ name: e.category, Despesa: e.amount }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#a3a3a3' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: '#a3a3a3' }} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                        <RechartsTooltip
                          formatter={(value: number) => brl(value)}
                          contentStyle={{ backgroundColor: '#1c1917', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                        />
                        <Bar dataKey="Despesa" radius={[4, 4, 0, 0]} maxBarSize={28}>
                          {dre.expensesByCategory.map((e) => (
                            <Cell key={e.category} fill={DRE_EXPENSE_COLORS[e.category] ?? '#737373'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-muted-foreground py-4 text-center text-sm">Sem despesas registradas no período.</p>
                )}
              </CardContent>
            </Card>

            {/* Vendas por categoria */}
            <Card className="rounded-xl border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <PieChartIcon className="text-primary size-4" />
                  Vendas por categoria
                </CardTitle>
              </CardHeader>
              <CardContent>
                {report.salesByCategory.length > 0 ? (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={report.salesByCategory}
                          dataKey="amount"
                          nameKey="category"
                          innerRadius={45}
                          outerRadius={80}
                          paddingAngle={2}
                        >
                          {report.salesByCategory.map((entry, index) => (
                            <Cell key={entry.category} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          formatter={(value: number, name: string) => [brl(value), name]}
                          contentStyle={{ backgroundColor: '#1c1917', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-muted-foreground py-10 text-center text-sm">Sem vendas registradas no período.</p>
                )}
                <div className="mt-2 flex flex-wrap justify-center gap-2">
                  {report.salesByCategory.slice(0, 6).map((c, index) => (
                    <Badge key={c.category} variant="outline" className="gap-1.5 text-xs">
                      <span className="size-2.5 rounded-sm" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                      {c.category} · {brl(c.amount)}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Top produtos */}
            <Card className="rounded-xl border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top produtos por receita</CardTitle>
              </CardHeader>
              <CardContent>
                {report.topProducts.length > 0 ? (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={report.topProducts.slice(0, 6).map((p) => ({ name: p.name, Receita: p.amount }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#a3a3a3' }} axisLine={false} tickLine={false} interval={0} height={40} angle={-20} textAnchor="end" />
                        <YAxis tick={{ fontSize: 11, fill: '#a3a3a3' }} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                        <RechartsTooltip
                          formatter={(value: number) => brl(value)}
                          contentStyle={{ backgroundColor: '#1c1917', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                        />
                        <Bar dataKey="Receita" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={26} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-muted-foreground py-10 text-center text-sm">Sem vendas registradas no período.</p>
                )}
              </CardContent>
            </Card>

            {/* Formas de pagamento */}
            <Card className="rounded-xl border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Recebimentos por forma de pagamento</CardTitle>
              </CardHeader>
              <CardContent>
                {report.salesByMethod.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Forma</TableHead>
                        <TableHead className="text-right">Total recebido</TableHead>
                        <TableHead className="text-right">Participação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.salesByMethod.map((m) => {
                        const share = (dre?.revenue ?? 0) > 0 ? (m.amount / (dre?.revenue ?? 1)) * 100 : 0
                        return (
                          <TableRow key={m.method}>
                            <TableCell className="font-medium">{METHOD_LABELS[m.method] ?? m.method}</TableCell>
                            <TableCell className="text-right tabular-nums">{brl(m.amount)}</TableCell>
                            <TableCell className="text-muted-foreground text-right tabular-nums">{pct(share)}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-muted-foreground py-10 text-center text-sm">Sem pagamentos registrados no período.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Produção planejada x realizada */}
            <Card className="rounded-xl border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ChefHat className="text-primary size-4" />
                  Produção planejada x realizada
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg border p-3">
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Planejado</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">{num(report.production.planned, 0)}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Produzido</p>
                    <p className="text-primary mt-1 text-xl font-semibold tabular-nums">{num(report.production.done, 0)}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-muted-foreground text-xs uppercase tracking-wide">Aderência</p>
                    <p className={`mt-1 text-xl font-semibold tabular-nums ${report.production.accuracy >= 100 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {pct(report.production.accuracy, 0)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                  <ClipboardCheck className="text-primary size-4 shrink-0" />
                  <span className="text-muted-foreground">
                    {report.orders.total} pedidos no período, {report.orders.delivered} entregues.
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Desperdício por motivo */}
            <Card className="rounded-xl border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Desperdício por motivo (custo)</CardTitle>
              </CardHeader>
              <CardContent>
                {report.wasteByReason.length > 0 ? (
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={report.wasteByReason.map((w) => ({ name: REASON_LABELS[w.reason] ?? w.reason, Perda: w.amount }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#a3a3a3' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: '#a3a3a3' }} axisLine={false} tickLine={false} width={44} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                        <RechartsTooltip
                          formatter={(value: number) => brl(value)}
                          contentStyle={{ backgroundColor: '#1c1917', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }}
                        />
                        <Bar dataKey="Perda" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={26} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="text-muted-foreground py-10 text-center text-sm">Nenhuma perda registrada no período.</p>
                )}
              </CardContent>
            </Card>

            {/* Rentabilidade por produto (ficha técnica real) */}
            <Card className="rounded-xl border bg-card md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Rentabilidade por produto (custo real da ficha técnica)</CardTitle>
                <CardDescription>
                  Margem após custo teórico dos ingredientes, mão de obra, embalagem e desperdício
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {profitability && profitability.rows.length > 0 ? (
                  <>
                    <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Receita</p>
                        <p className="text-lg font-semibold tabular-nums">{brl(profitability.totals.revenue)}</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Custo teórico</p>
                        <p className="text-lg font-semibold tabular-nums">{brl(profitability.totals.cost)}</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Desperdício</p>
                        <p className="text-lg font-semibold tabular-nums text-destructive">{brl(profitability.totals.waste)}</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Margem</p>
                        <p className="text-lg font-semibold tabular-nums text-emerald-400">
                          {brl(profitability.totals.margin)} ({profitability.totals.marginPct?.toFixed(1).replace('.', ',')}%)
                        </p>
                      </div>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Produto</TableHead>
                          <TableHead className="text-right">Vendido</TableHead>
                          <TableHead className="text-right">Receita</TableHead>
                          <TableHead className="text-right">Custo/un.</TableHead>
                          <TableHead className="text-right">Custo total</TableHead>
                          <TableHead className="text-right">Desperdício</TableHead>
                          <TableHead className="text-right">Margem</TableHead>
                          <TableHead className="text-right">Margem %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {profitability.rows.slice(0, 12).map((row) => (
                          <TableRow key={row.productId}>
                            <TableCell>
                              <p className="font-medium">{row.name}</p>
                              {row.hasRecipe && (
                                <Badge variant="outline" className="mt-0.5">ficha técnica</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.saleUnit === 'KG' || row.saleUnit === 'G' || row.saleUnit === 'L' || row.saleUnit === 'ML'
                                ? `${row.soldQty.toFixed(3).replace('.', ',')} ${row.saleUnit}`
                                : row.soldQty}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{brl(row.revenue)}</TableCell>
                            <TableCell className="text-right tabular-nums">{brl(row.unitCost)}</TableCell>
                            <TableCell className="text-right tabular-nums">{brl(row.theoryCost)}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.wasteCost > 0 ? <span className="text-destructive">{brl(row.wasteCost)}</span> : '—'}
                            </TableCell>
                            <TableCell className={`text-right tabular-nums font-medium ${row.margin < 0 ? 'text-destructive' : 'text-emerald-400'}`}>
                              {brl(row.margin)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.marginPct !== null ? `${row.marginPct.toFixed(1).replace('.', ',')}%` : '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                ) : (
                  <p className="text-muted-foreground py-10 text-center text-sm">
                    Sem vendas no período para calcular rentabilidade.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
