'use client'

// BAKERY ERP - Caixa (sessões, sangria, suprimento e fechamento)
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  Lock,
  Receipt,
  Vault,
} from 'lucide-react'

import type { CashMovementDTO, CashSessionDTO, SaleDTO } from '@/lib/types'
import { apiGet, apiPost } from '@/lib/api'
import { brl, dthr, hr, PAYMENT_METHOD_LABELS } from '@/lib/format'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ============ Helpers visuais ============

function MovementTypeBadge({ type }: { type: string }) {
  if (type === 'VENDA') {
    return (
      <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
        Venda
      </Badge>
    )
  }
  if (type === 'SANGRIA') {
    return (
      <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
        Sangria
      </Badge>
    )
  }
  if (type === 'SUPRIMENTO') {
    return (
      <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-400">
        Suprimento
      </Badge>
    )
  }
  return <Badge variant="secondary">Ajuste</Badge>
}

function SaleStatusBadge({ status }: { status: SaleDTO['status'] }) {
  return status === 'CONCLUIDA' ? (
    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
      Concluída
    </Badge>
  ) : (
    <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
      Cancelada
    </Badge>
  )
}

// Valor assinado para exibição: sangria é saída, ajuste negativo é saída
function signedMovementValue(m: CashMovementDTO): number {
  if (m.type === 'SANGRIA') return -Math.abs(m.amount)
  if (m.type === 'AJUSTE') return m.amount
  return Math.abs(m.amount)
}

type SessionResponse = { current: CashSessionDTO | null; last: CashSessionDTO | null }

// ============ View ============

export default function CashView({ operator }: ViewProps) {
  const [loading, setLoading] = useState(true)
  const [current, setCurrent] = useState<CashSessionDTO | null>(null)
  const [last, setLast] = useState<CashSessionDTO | null>(null)
  const [movements, setMovements] = useState<CashMovementDTO[]>([])
  const [sales, setSales] = useState<SaleDTO[]>([])

  // abrir caixa
  const [openDialog, setOpenDialog] = useState(false)
  const [operatorName, setOperatorName] = useState(operator.name)
  const [openingBalance, setOpeningBalance] = useState('300')
  const [openingBusy, setOpeningBusy] = useState(false)

  // sangria / suprimento
  const [movementType, setMovementType] = useState<'SANGRIA' | 'SUPRIMENTO' | null>(null)
  const [movementAmount, setMovementAmount] = useState('')
  const [movementDesc, setMovementDesc] = useState('')
  const [movementBusy, setMovementBusy] = useState(false)

  // fechar caixa
  const [closeDialog, setCloseDialog] = useState(false)
  const [closingBalance, setClosingBalance] = useState('')
  const [closeBusy, setCloseBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiGet<SessionResponse>('/api/cash/session')
      setCurrent(res.current)
      setLast(res.last)
      if (res.current) {
        const [mv, sl] = await Promise.all([
          apiGet<CashMovementDTO[]>(`/api/cash/movements?sessionId=${res.current.id}&limit=200`),
          apiGet<SaleDTO[]>('/api/sales?limit=20'),
        ])
        setMovements(mv)
        setSales(sl)
      } else {
        setMovements([])
        setSales([])
      }
    } catch (err) {
      toast.error('Erro ao carregar caixa', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const totals = useMemo(() => {
    let entradas = 0
    let saidas = 0
    for (const m of movements) {
      if (m.type === 'SANGRIA') {
        saidas += m.amount
      } else if (m.type === 'SUPRIMENTO' || (m.type === 'VENDA' && m.method === 'DINHEIRO')) {
        entradas += m.amount
      } else if (m.type === 'AJUSTE') {
        if (m.amount >= 0) entradas += m.amount
        else saidas += Math.abs(m.amount)
      }
    }
    const opening = current?.openingBalance ?? 0
    return { entradas, saidas, expected: opening + entradas - saidas }
  }, [movements, current])

  // ---------- Ações ----------
  async function openSession() {
    const opName = operatorName.trim()
    const opening = Number(openingBalance)
    if (!opName) {
      toast.error('Informe o nome do operador')
      return
    }
    if (!Number.isFinite(opening) || opening < 0) {
      toast.error('Saldo de abertura inválido')
      return
    }
    setOpeningBusy(true)
    try {
      await apiPost<CashSessionDTO>('/api/cash/session', {
        action: 'open',
        operatorName: opName,
        openingBalance: opening,
      })
      toast.success('Caixa aberto', { description: `Troco inicial de ${brl(opening)}` })
      setOpenDialog(false)
      await load()
    } catch (err) {
      toast.error('Erro ao abrir caixa', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setOpeningBusy(false)
    }
  }

  function openMovementDialog(type: 'SANGRIA' | 'SUPRIMENTO') {
    setMovementType(type)
    setMovementAmount('')
    setMovementDesc('')
  }

  async function submitMovement() {
    if (!current || !movementType) return
    const amount = Number(movementAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Valor deve ser maior que zero')
      return
    }
    setMovementBusy(true)
    try {
      await apiPost<CashMovementDTO>('/api/cash/movements', {
        sessionId: current.id,
        type: movementType,
        amount,
        description: movementDesc.trim() || undefined,
      })
      toast.success(movementType === 'SANGRIA' ? 'Sangria registrada' : 'Suprimento registrado', {
        description: brl(amount),
      })
      setMovementType(null)
      await load()
    } catch (err) {
      // API devolve 400 com "saldo insuficiente" em sangrias além do disponível
      toast.error(err instanceof Error ? err.message : 'Erro ao registrar movimentação')
    } finally {
      setMovementBusy(false)
    }
  }

  async function closeSession() {
    if (!current) return
    const closing = Number(closingBalance)
    if (!Number.isFinite(closing) || closing < 0) {
      toast.error('Informe a contagem física do dinheiro em caixa')
      return
    }
    setCloseBusy(true)
    try {
      const closed = await apiPost<CashSessionDTO>('/api/cash/session', {
        action: 'close',
        sessionId: current.id,
        closingBalance: closing,
        expectedBalance: totals.expected,
      })
      const diff = (closed.closingBalance ?? 0) - (closed.expectedBalance ?? 0)
      if (Math.abs(diff) < 0.005) {
        toast.success('Caixa fechado sem quebra', { description: `Saldo final ${brl(closing)}` })
      } else {
        toast.warning('Caixa fechado com quebra', {
          description: `Diferença de ${brl(diff)} entre contagem física e saldo esperado.`,
        })
      }
      setCloseDialog(false)
      await load()
    } catch (err) {
      toast.error('Erro ao fechar caixa', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setCloseBusy(false)
    }
  }

  // ---------- Render ----------
  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-44 w-full" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    )
  }

  // ===== Estado SEM sessão aberta =====
  if (!current) {
    return (
      <div className="space-y-4">
        <Card className="mx-auto max-w-lg rounded-xl border bg-card p-4 text-center">
          <CardContent className="flex flex-col items-center gap-4 py-10">
            <div className="bg-primary/10 flex size-14 items-center justify-center rounded-full">
              <Vault className="text-primary size-7" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Caixa fechado</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Abra uma sessão de caixa para registrar vendas em dinheiro, sangrias e suprimentos.
              </p>
            </div>
            <Button onClick={() => setOpenDialog(true)} className="gap-2">
              <Banknote className="size-4" />
              Abrir caixa
            </Button>
            {last && (
              <p className="text-muted-foreground text-xs">
                Última sessão fechou em {dthr(last.closedAt)} com saldo {brl(last.closingBalance ?? 0)} · operador{' '}
                {last.operatorName}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Dialog abrir caixa */}
        <Dialog open={openDialog} onOpenChange={setOpenDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Abrir caixa</DialogTitle>
              <DialogDescription>Informe o operador responsável e o valor de troco inicial.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-2">
                <Label htmlFor="cash-operator">Operador</Label>
                <Input id="cash-operator" value={operatorName} onChange={(e) => setOperatorName(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="cash-opening">Saldo de abertura (R$)</Label>
                <Input
                  id="cash-opening"
                  type="number"
                  min="0"
                  step="0.01"
                  value={openingBalance}
                  onChange={(e) => setOpeningBalance(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={openSession} disabled={openingBusy}>
                <Banknote className="size-4" />
                {openingBusy ? 'Abrindo...' : 'Abrir caixa'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // ===== Estado COM sessão aberta =====
  const closingValue = closingBalance.trim() === '' ? NaN : Number(closingBalance)
  const closingDiff = Number.isFinite(closingValue) ? closingValue - totals.expected : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Vault className="text-primary size-5" />
            Caixa
          </h2>
          <p className="text-muted-foreground text-sm">
            Sessão aberta por {current.operatorName} às {hr(current.openedAt)}
          </p>
        </div>
        <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
          Sessão aberta
        </Badge>
      </div>

      {/* Cabeçalho da sessão */}
      <Card className="rounded-xl border bg-card p-4">
        <CardContent className="grid gap-4 lg:grid-cols-[1fr_1.4fr] lg:items-center">
          <div className="grid gap-1">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">Sessão atual</p>
            <p className="flex items-center gap-2 font-medium">
              <Banknote className="text-primary size-4" />
              {current.operatorName}
            </p>
            <p className="text-muted-foreground text-sm">
              Aberto às {hr(current.openedAt)} · abertura{' '}
              <span className="tabular-nums font-medium text-foreground">{brl(current.openingBalance)}</span>
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/30 p-3 text-center">
            <div>
              <p className="text-muted-foreground text-xs">Entradas</p>
              <p className="text-emerald-400 mt-1 font-semibold tabular-nums">{brl(totals.entradas)}</p>
              <p className="text-muted-foreground mt-0.5 text-[10px]">dinheiro + suprimento</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Saídas</p>
              <p className="text-destructive mt-1 font-semibold tabular-nums">{brl(totals.saidas)}</p>
              <p className="text-muted-foreground mt-0.5 text-[10px]">sangrias</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Saldo esperado</p>
              <p className="text-primary mt-1 text-xl font-bold tabular-nums">{brl(totals.expected)}</p>
              <p className="text-muted-foreground mt-0.5 text-[10px]">abertura + entradas - saídas</p>
            </div>
          </div>
        </CardContent>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => openMovementDialog('SANGRIA')}>
            <Banknote className="size-4" />
            Sangria
          </Button>
          <Button variant="outline" className="gap-2 border-amber-500/40 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300" onClick={() => openMovementDialog('SUPRIMENTO')}>
            <ArrowUpCircle className="size-4" />
            Suprimento
          </Button>
          <Button className="gap-2" onClick={() => { setClosingBalance(''); setCloseDialog(true) }}>
            <Lock className="size-4" />
            Fechar caixa
          </Button>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Movimentações */}
        <Card className="rounded-xl border bg-card p-4">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Receipt className="text-primary size-4" />
              Movimentações da sessão
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {movements.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">Nenhuma movimentação registrada ainda.</p>
            ) : (
              <div className="scrollbar-thin max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hora</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((m) => {
                      const value = signedMovementValue(m)
                      return (
                        <TableRow key={m.id}>
                          <TableCell className="text-muted-foreground tabular-nums">{hr(m.createdAt)}</TableCell>
                          <TableCell>
                            <MovementTypeBadge type={m.type} />
                          </TableCell>
                          <TableCell className="text-muted-foreground max-w-40 truncate">
                            {m.description ?? (m.type === 'VENDA' ? 'Venda PDV' : '-')}
                          </TableCell>
                          <TableCell
                            className={`text-right font-medium tabular-nums ${value < 0 ? 'text-destructive' : 'text-emerald-400'}`}
                          >
                            {value < 0 ? '-' : '+'}
                            {brl(Math.abs(value))}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Vendas recentes */}
        <Card className="rounded-xl border bg-card p-4">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <ArrowDownCircle className="text-primary size-4" />
              Vendas recentes
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {sales.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">Nenhuma venda registrada ainda.</p>
            ) : (
              <div className="scrollbar-thin max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Hora</TableHead>
                      <TableHead>Formas</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sales.map((sale) => (
                      <TableRow key={sale.id} className={sale.status === 'CANCELADA' ? 'opacity-50' : undefined}>
                        <TableCell className="font-mono text-xs">{sale.code}</TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">{hr(sale.createdAt)}</TableCell>
                        <TableCell className="text-muted-foreground max-w-40 truncate text-xs">
                          {sale.payments
                            .map((p) => PAYMENT_METHOD_LABELS[p.method] ?? p.method)
                            .join(', ') || '-'}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{brl(sale.total)}</TableCell>
                        <TableCell>
                          <SaleStatusBadge status={sale.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog sangria/suprimento */}
      <Dialog open={!!movementType} onOpenChange={(open) => !open && setMovementType(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{movementType === 'SANGRIA' ? 'Sangria de caixa' : 'Suprimento de caixa'}</DialogTitle>
            <DialogDescription>
              {movementType === 'SANGRIA'
                ? 'Retire um valor do caixa para depósito ou cofre. O saldo não pode ficar negativo.'
                : 'Adicione valores ao caixa, como troco reforçado ou correções.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="movement-amount">Valor (R$)</Label>
              <Input
                id="movement-amount"
                type="number"
                min="0"
                step="0.01"
                value={movementAmount}
                onChange={(e) => setMovementAmount(e.target.value)}
                placeholder="0,00"
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="movement-desc">Descrição</Label>
              <Input
                id="movement-desc"
                value={movementDesc}
                onChange={(e) => setMovementDesc(e.target.value)}
                placeholder={movementType === 'SANGRIA' ? 'Depósito bancário' : 'Reforço de troco'}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMovementType(null)}>
              Cancelar
            </Button>
            <Button onClick={submitMovement} disabled={movementBusy}>
              {movementType === 'SANGRIA' ? 'Registrar sangria' : 'Registrar suprimento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AlertDialog fechar caixa */}
      <AlertDialog open={closeDialog} onOpenChange={setCloseDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Fechar caixa</AlertDialogTitle>
            <AlertDialogDescription>
              Compare o saldo esperado com a contagem física do dinheiro. A diferença será registrada como quebra ou
              sobra.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Abertura</span>
              <span className="tabular-nums">{brl(current.openingBalance)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Entradas</span>
              <span className="text-emerald-400 tabular-nums">+{brl(totals.entradas)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Saídas</span>
              <span className="text-destructive tabular-nums">-{brl(totals.saidas)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>Saldo esperado</span>
              <span className="text-primary tabular-nums">{brl(totals.expected)}</span>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="closing-balance">Contagem física em caixa (R$)</Label>
            <Input
              id="closing-balance"
              type="number"
              min="0"
              step="0.01"
              value={closingBalance}
              onChange={(e) => setClosingBalance(e.target.value)}
              placeholder="0,00"
            />
            {closingDiff !== null && (
              <p
                className={`flex items-center gap-1.5 text-sm font-medium ${
                  Math.abs(closingDiff) < 0.005 ? 'text-emerald-400' : 'text-destructive'
                }`}
              >
                {Math.abs(closingDiff) < 0.005
                  ? 'Diferença zero: caixa conferido.'
                  : `Diferença de ${brl(closingDiff)} em relação ao esperado.`}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={closeBusy}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={closeBusy || !Number.isFinite(closingValue)}
              onClick={(e) => {
                e.preventDefault()
                void closeSession()
              }}
            >
              <Lock className="size-4" />
              {closeBusy ? 'Fechando...' : 'Fechar caixa'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
