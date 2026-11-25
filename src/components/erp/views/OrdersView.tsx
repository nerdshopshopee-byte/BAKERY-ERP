'use client'

// BAKERY ERP - KDS: Painel de Pedidos em tempo real.
// Polling de /api/orders?active=1 a cada 4s, bip em novos pedidos (WebAudio)
// e transições de status via PATCH /api/orders/[id].

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  BellRing,
  ChefHat,
  Clock,
  Plus,
  RefreshCw,
  Trash2,
  type LucideIcon,
} from 'lucide-react'

import { apiGet, apiPatch, apiPost } from '@/lib/api'
import { elapsedSince, hr, num, ORDER_SOURCE_LABELS, ORDER_STATUS_LABELS } from '@/lib/format'
import type { OrderDTO } from '@/lib/types'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { ViewProps } from '../view-props'

type OrderStatus = OrderDTO['status']

const COLUMNS: { status: OrderStatus; title: string; icon: LucideIcon; iconClass: string }[] = [
  { status: 'AGUARDANDO', title: 'Aguardando', icon: Clock, iconClass: 'text-primary bg-primary/10' },
  { status: 'PREPARANDO', title: 'Preparando', icon: ChefHat, iconClass: 'text-foreground bg-muted' },
  {
    status: 'PRONTO',
    title: 'Pronto',
    icon: BellRing,
    iconClass: 'text-emerald-500 bg-emerald-500/10',
  },
]

function fmtQty(qty: number): string {
  return Number.isInteger(qty) ? num(qty) : num(qty, 2)
}

// Bip curto (WebAudio) para novos pedidos: onda quadrada 880Hz por 200ms
function playBeep() {
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) return
    const ctx = new AudioCtx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    gain.gain.setValueAtTime(0.1, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.2)
    osc.onended = () => {
      void ctx.close()
    }
  } catch {
    /* áudio indisponível no dispositivo - segue sem bip */
  }
}

// ============================== CARD DE PEDIDO ==============================

function OrderCard({
  order,
  onStatus,
}: {
  order: OrderDTO
  onStatus: (order: OrderDTO, status: OrderStatus) => void
}) {
  const createdMs = new Date(order.createdAt).getTime()
  const mins = Math.max(0, Math.floor((Date.now() - createdMs) / 60000))
  const late = mins > 20
  const warn = !late && mins > 10

  return (
    <div
      className={`kds-in rounded-lg border bg-background/50 p-3 ${
        late ? 'animate-pulse border-destructive/80' : warn ? 'border-primary/50' : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-base font-bold tracking-tight">{order.code}</p>
          <p className="truncate text-xs text-muted-foreground">
            {order.customerName ?? 'Cliente não informado'}
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 text-[10px]">
          {ORDER_SOURCE_LABELS[order.source] ?? order.source}
        </Badge>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`inline-flex items-center gap-1 font-medium ${
            late ? 'text-destructive' : warn ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <Clock className="size-3" />
          {elapsedSince(order.createdAt)}
        </span>
        {late ? (
          <Badge variant="destructive" className="text-[10px]">
            Atrasado
          </Badge>
        ) : null}
        {order.expectedAt ? (
          <span className="text-muted-foreground">previsto {hr(order.expectedAt)}</span>
        ) : null}
      </div>

      <div className="mt-2 space-y-1.5">
        {order.items.map((item) => (
          <div key={item.id} className="flex items-start gap-2 text-sm">
            <Badge className="mt-0.5 min-w-8 justify-center bg-primary/15 text-primary">
              {fmtQty(item.qty)}
            </Badge>
            <span className="min-w-0 flex-1">
              {item.name}
              {item.notes ? (
                <span className="block text-xs italic text-muted-foreground">
                  Obs: {item.notes}
                </span>
              ) : null}
            </span>
          </div>
        ))}
      </div>

      {order.notes ? (
        <p className="mt-2 text-xs italic text-muted-foreground">Obs geral: {order.notes}</p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {order.status === 'AGUARDANDO' ? (
          <Button
            size="sm"
            className="flex-1"
            onClick={() => onStatus(order, 'PREPARANDO')}
            aria-label={`Iniciar preparo do pedido ${order.code}`}
          >
            Iniciar preparo
          </Button>
        ) : null}
        {order.status === 'PREPARANDO' ? (
          <Button
            size="sm"
            className="flex-1"
            onClick={() => onStatus(order, 'PRONTO')}
            aria-label={`Marcar pedido ${order.code} como pronto`}
          >
            Marcar pronto
          </Button>
        ) : null}
        {order.status === 'PRONTO' ? (
          <>
            <Button
              size="sm"
              className="flex-1"
              onClick={() => onStatus(order, 'ENTREGUE')}
              aria-label={`Entregar pedido ${order.code}`}
            >
              Entregar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onStatus(order, 'CANCELADO')}
              aria-label={`Cancelar pedido ${order.code}`}
            >
              Cancelar
            </Button>
          </>
        ) : null}
      </div>
    </div>
  )
}

// ============================== VIEW ==============================

type NewItemForm = { name: string; qty: string }
type NewOrderForm = {
  customerName: string
  phone: string
  source: string
  notes: string
  expectedAt: string
}

const DEFAULT_FORM: NewOrderForm = {
  customerName: '',
  phone: '',
  source: 'WHATSAPP',
  notes: '',
  expectedAt: '',
}

const DEFAULT_ITEMS: NewItemForm[] = [{ name: '', qty: '1' }]

export default function OrdersView({ operator }: ViewProps) {
  const [orders, setOrders] = useState<OrderDTO[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [soundOn, setSoundOn] = useState(true)
  const [now, setNow] = useState<Date | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<NewOrderForm>(DEFAULT_FORM)
  const [items, setItems] = useState<NewItemForm[]>(DEFAULT_ITEMS)
  const [submitting, setSubmitting] = useState(false)

  const seenIdsRef = useRef<Set<string>>(new Set())
  const initializedRef = useRef(false)
  const soundRef = useRef(true)

  useEffect(() => {
    soundRef.current = soundOn
  }, [soundOn])

  const load = useCallback(async () => {
    try {
      const list = await apiGet<OrderDTO[]>('/api/orders?active=1')
      const fresh = list.filter((order) => !seenIdsRef.current.has(order.id))
      if (initializedRef.current) {
        for (const order of fresh) {
          if (soundRef.current) playBeep()
          toast.success(`Novo pedido ${order.code}`, {
            description: order.customerName ? `Cliente: ${order.customerName}` : 'Entrou na fila.',
          })
        }
      }
      if (fresh.length > 0) {
        const next = new Set(seenIdsRef.current)
        for (const order of fresh) next.add(order.id)
        seenIdsRef.current = next
      }
      initializedRef.current = true
      setOrders(list)
    } catch {
      toast.error('Falha ao atualizar a lista de pedidos')
    } finally {
      setLoading(false)
    }
  }, [])

  // Polling a cada 4s
  useEffect(() => {
    void load()
    const timer = setInterval(() => {
      void load()
    }, 4000)
    return () => clearInterval(timer)
  }, [load])

  // Relógio grande + atualização dos tempos decorridos
  useEffect(() => {
    const tick = () => setNow(new Date())
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [])

  const byStatus = useMemo(() => {
    const map: Record<OrderStatus, OrderDTO[]> = {
      AGUARDANDO: [],
      PREPARANDO: [],
      PRONTO: [],
      ENTREGUE: [],
      CANCELADO: [],
    }
    for (const order of orders) map[order.status].push(order)
    for (const key of Object.keys(map) as OrderStatus[]) {
      map[key].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    }
    return map
  }, [orders])

  async function handleStatus(order: OrderDTO, status: OrderStatus) {
    try {
      await apiPatch(`/api/orders/${order.id}`, { status })
      toast.success(`Pedido ${order.code}: ${ORDER_STATUS_LABELS[status]}`)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao atualizar o pedido')
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  function updateItem(index: number, patch: Partial<NewItemForm>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  function addItem() {
    setItems((prev) => [...prev, { name: '', qty: '1' }])
  }

  function removeItem(index: number) {
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  function resetForm() {
    setForm(DEFAULT_FORM)
    setItems(DEFAULT_ITEMS)
  }

  async function handleCreateOrder() {
    const cleanItems = items
      .map((item) => ({
        name: item.name.trim(),
        qty: Number(item.qty.replace(',', '.')),
      }))
      .filter((item) => item.name !== '' && Number.isFinite(item.qty) && item.qty > 0)

    if (cleanItems.length === 0) {
      toast.error('Adicione pelo menos um item com nome e quantidade válidos')
      return
    }

    setSubmitting(true)
    try {
      const created = await apiPost<OrderDTO>('/api/orders', {
        customerName: form.customerName.trim() || undefined,
        phone: form.phone.trim() || undefined,
        source: form.source,
        notes: form.notes.trim() || undefined,
        expectedAt: form.expectedAt ? new Date(form.expectedAt).toISOString() : undefined,
        items: cleanItems,
      })
      // Evita bip/toast duplicado para pedido criado por este operador
      seenIdsRef.current.add(created.id)
      toast.success(`Pedido ${created.code} criado`, {
        description: 'Enviado para a fila de produção.',
      })
      setDialogOpen(false)
      resetForm()
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao criar pedido')
    } finally {
      setSubmitting(false)
    }
  }

  const clockText = now
    ? now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
    : '--:--:--'

  return (
    <div className="space-y-4">
      {/* Cabeçalho do painel */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Painel de Pedidos (KDS)</h2>
          <p className="text-xs text-muted-foreground">
            Operador: {operator.name} • Atualização automática a cada 4s •{' '}
            {soundOn ? 'Sons ativados' : 'Sons desativados'}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2 md:gap-3">
          <span
            className="font-mono text-2xl font-bold tabular-nums"
            suppressHydrationWarning
            aria-label="Relógio atual"
          >
            {clockText}
          </span>

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Atualizar lista de pedidos agora"
          >
            <RefreshCw className={refreshing ? 'size-4 animate-spin' : 'size-4'} />
            Atualizar
          </Button>

          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5">
            <Switch
              id="kds-sound-switch"
              checked={soundOn}
              onCheckedChange={setSoundOn}
              aria-label="Alternar sons de novos pedidos"
            />
            <Label
              htmlFor="kds-sound-switch"
              className="cursor-pointer text-xs text-muted-foreground"
            >
              Som
            </Label>
          </div>

          <Button onClick={() => setDialogOpen(true)} aria-label="Criar novo pedido manual">
            <Plus className="size-4" />
            Novo pedido
          </Button>
        </div>
      </div>

      {/* Colunas do KDS */}
      {loading && orders.length === 0 ? (
        <div className="grid gap-4 md:grid-cols-3">
          {COLUMNS.map((column) => (
            <div key={column.status} className="space-y-3 rounded-xl border border-border bg-card p-3">
              <Skeleton className="h-8 w-44" />
              <Skeleton className="h-36 rounded-lg" />
              <Skeleton className="h-36 rounded-lg" />
              <Skeleton className="h-36 rounded-lg" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {COLUMNS.map((column) => {
            const columnOrders = byStatus[column.status]
            return (
              <div key={column.status} className="rounded-xl border border-border bg-card">
                <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2.5">
                  <span
                    className={`flex size-7 items-center justify-center rounded-full ${column.iconClass}`}
                  >
                    <column.icon className="size-4" />
                  </span>
                  <h3 className="text-sm font-semibold">{column.title}</h3>
                  <Badge variant="secondary" className="ml-auto tabular-nums">
                    {columnOrders.length}
                  </Badge>
                </div>
                <div className="max-h-[calc(100vh-260px)] space-y-3 overflow-y-auto scrollbar-thin p-3">
                  {columnOrders.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                      Nenhum pedido nesta etapa
                    </p>
                  ) : (
                    columnOrders.map((order) => (
                      <OrderCard key={order.id} order={order} onStatus={handleStatus} />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Dialog: novo pedido manual */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) resetForm()
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto scrollbar-thin sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo pedido manual</DialogTitle>
            <DialogDescription>
              Registre um pedido recebido por WhatsApp, encomenda ou delivery.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="order-customer">Cliente</Label>
                <Input
                  id="order-customer"
                  value={form.customerName}
                  onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                  placeholder="Nome do cliente"
                  maxLength={120}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="order-phone">Telefone</Label>
                <Input
                  id="order-phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="(00) 00000-0000"
                  maxLength={30}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="order-source">Origem</Label>
              <Select
                value={form.source}
                onValueChange={(value) => setForm((f) => ({ ...f, source: value }))}
              >
                <SelectTrigger id="order-source" aria-label="Origem do pedido">
                  <SelectValue placeholder="Origem do pedido" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                  <SelectItem value="ENCOMENDA">Encomenda</SelectItem>
                  <SelectItem value="DELIVERY">Delivery</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="order-notes">Observações</Label>
              <Textarea
                id="order-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Ex: entregar às 14h, pão bem assado"
                rows={2}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="order-expected">Previsão de entrega (opcional)</Label>
              <Input
                id="order-expected"
                type="datetime-local"
                value={form.expectedAt}
                onChange={(e) => setForm((f) => ({ ...f, expectedAt: e.target.value }))}
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Itens do pedido</Label>
              <div className="space-y-2">
                {items.map((item, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <Input
                      value={item.name}
                      onChange={(e) => updateItem(index, { name: e.target.value })}
                      placeholder="Produto (ex: Pão francês)"
                      className="flex-1"
                      aria-label={`Nome do item ${index + 1}`}
                    />
                    <Input
                      value={item.qty}
                      onChange={(e) => updateItem(index, { qty: e.target.value })}
                      type="number"
                      min="0"
                      step="1"
                      inputMode="decimal"
                      className="w-20 shrink-0"
                      aria-label={`Quantidade do item ${index + 1}`}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeItem(index)}
                      disabled={items.length === 1}
                      aria-label={`Remover item ${index + 1}`}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addItem}
                className="w-full border-dashed"
              >
                <Plus className="size-4" />
                Adicionar item
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting}>
              Cancelar
            </Button>
            <Button onClick={handleCreateOrder} disabled={submitting}>
              {submitting ? 'Enviando...' : 'Criar pedido'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
