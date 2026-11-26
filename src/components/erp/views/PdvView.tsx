// BAKERY ERP - Frente de Caixa (PDV)
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Banknote,
  Bike,
  Croissant,
  History,
  Loader2,
  Minus,
  Plus,
  Printer,
  Receipt,
  Scale,
  Search,
  ShoppingCart,
  Store,
  Trash2,
  User,
  X,
} from 'lucide-react'

import type { ViewProps } from '@/components/erp/view-props'
import { apiGet, apiPatch, apiPost } from '@/lib/api'
import { brl, dthr, hr, num, PAYMENT_METHOD_LABELS } from '@/lib/format'
import type { CategoryDTO, CustomerDTO, ProductDTO, SaleDTO } from '@/lib/types'
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
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'

const PAY_METHODS = ['DINHEIRO', 'PIX', 'DEBITO', 'CREDITO', 'VALE', 'FIADO'] as const
type PayMethod = (typeof PAY_METHODS)[number]

type CartLine = { product: ProductDTO; qty: number; fromScale?: boolean }
type PaymentDraft = { id: string; method: PayMethod; amount: string }

const round2 = (v: number) => Math.round(v * 100) / 100
const round3 = (v: number) => Math.round(v * 1000) / 1000

// Atalhos de peso (gramas) para pesagem manual sem balança integrada
const QUICK_WEIGHTS = [100, 200, 250, 300, 500, 750, 1000]

function parseNum(value: string): number {
  const n = Number(value.replace(',', '.').trim())
  return Number.isFinite(n) && n > 0 ? n : 0
}

function ProductThumb({ src, alt }: { src?: string | null; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className="flex h-28 w-full items-center justify-center rounded-t-xl bg-muted">
        <Croissant className="size-8 text-muted-foreground/70" />
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      className="h-28 w-full rounded-t-xl object-cover"
    />
  )
}

export default function PdvView({ operator }: ViewProps) {
  // ---- dados ----
  const [products, setProducts] = useState<ProductDTO[]>([])
  const [categories, setCategories] = useState<CategoryDTO[]>([])
  const [customers, setCustomers] = useState<CustomerDTO[]>([])
  const [loading, setLoading] = useState(true)

  // ---- catálogo ----
  const [search, setSearch] = useState('')
  const [scanning, setScanning] = useState(false)
  const [weighOpen, setWeighOpen] = useState(false)
  const [weighProduct, setWeighProduct] = useState<ProductDTO | null>(null)
  const [weighWeight, setWeighWeight] = useState('')
  const [weighResult, setWeighResult] = useState<{ qty: number; total: number; label: string } | null>(null)
  const [weighBusy, setWeighBusy] = useState(false)

  // Modo manual: peso digitado sem balança integrada (a balança física mostra o peso,
  // o operador digita aqui — a venda funciona das duas formas)
  const weighManualQty = useMemo(() => {
    const raw = weighWeight.replace(',', '.').trim()
    if (!raw) return 0
    const n = Number(raw)
    if (!Number.isFinite(n) || n <= 0) return 0
    return round3(n)
  }, [weighWeight])
  const weighManualTotal = useMemo(
    () => (weighProduct ? round2(weighManualQty * weighProduct.price) : 0),
    [weighManualQty, weighProduct],
  )
  const canConfirmWeigh = weighResult !== null || weighManualQty > 0
  const [catFilter, setCatFilter] = useState<string>('all')

  // ---- carrinho ----
  const [cart, setCart] = useState<CartLine[]>([])
  const [discount, setDiscount] = useState('')
  const [customerId, setCustomerId] = useState('none')
  const [channel, setChannel] = useState('BALCAO')

  // ---- pagamento ----
  const [payOpen, setPayOpen] = useState(false)
  const [payments, setPayments] = useState<PaymentDraft[]>([])
  const [cashReceived, setCashReceived] = useState('')
  const [paying, setPaying] = useState(false)
  const idRef = useRef(0)
  const nextId = () => `pay-${++idRef.current}`

  // ---- comprovante / histórico ----
  const [receipt, setReceipt] = useState<SaleDTO | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [sales, setSales] = useState<SaleDTO[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyTick, setHistoryTick] = useState(0)
  const [cancelTarget, setCancelTarget] = useState<SaleDTO | null>(null)
  const [cancelling, setCancelling] = useState(false)

  const loadCatalog = useCallback(async () => {
    setLoading(true)
    try {
      const [prods, cats, custs] = await Promise.all([
        apiGet<ProductDTO[]>('/api/products?active=true'),
        apiGet<CategoryDTO[]>('/api/categories'),
        apiGet<CustomerDTO[]>('/api/customers'),
      ])
      setProducts(prods)
      setCategories(cats)
      setCustomers(custs)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao carregar catálogo')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  // histórico carrega quando o dialog abre
  useEffect(() => {
    if (!historyOpen) return
    let cancelled = false
    setHistoryLoading(true)
    apiGet<SaleDTO[]>('/api/sales?limit=20')
      .then((rows) => {
        if (!cancelled) setSales(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) toast.error(err instanceof Error ? err.message : 'Erro ao carregar vendas')
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [historyOpen, historyTick])

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter((p) => {
      if (catFilter !== 'all' && p.categoryId !== catFilter) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        (p.barcode ?? '').toLowerCase().includes(q)
      )
    })
  }, [products, search, catFilter])

  const subtotal = useMemo(
    () => round2(cart.reduce((acc, line) => acc + line.product.price * line.qty, 0)),
    [cart],
  )
  const discountNum = useMemo(() => Math.max(0, parseNum(discount)), [discount])
  const discountExceeds = discountNum > subtotal + 0.001
  const total = useMemo(() => Math.max(0, round2(subtotal - discountNum)), [subtotal, discountNum])
  const cartCount = useMemo(() => cart.reduce((acc, l) => acc + l.qty, 0), [cart])

  const paidSum = useMemo(
    () => round2(payments.reduce((acc, p) => acc + parseNum(p.amount), 0)),
    [payments],
  )
  const payDiff = round2(total - paidSum)
  const canFinish = cart.length > 0 && Math.abs(payDiff) <= 0.01
  const hasCashRow = payments.some((p) => p.method === 'DINHEIRO')
  const cashChange = useMemo(() => {
    const received = parseNum(cashReceived)
    return received > 0 ? round2(received - total) : 0
  }, [cashReceived, total])

  // ---- carrinho ----
  function addToCart(product: ProductDTO, qtyOverride?: number, fromScale?: boolean) {
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id)
      if (existing && qtyOverride === undefined) {
        return prev.map((l) =>
          l.product.id === product.id
            ? { ...l, qty: round2(l.qty + (product.byWeight ? 0.5 : 1)) }
            : l,
        )
      }
      if (existing && qtyOverride !== undefined) {
        return prev.map((l) =>
          l.product.id === product.id ? { ...l, qty: round2(l.qty + qtyOverride), fromScale: true } : l,
        )
      }
      return [...prev, { product, qty: qtyOverride ?? (product.byWeight ? 0.5 : 1), fromScale }]
    })
  }

  // ---- etiqueta de balança / leitor de código ----
  const lastScanRef = useRef<{ code: string; at: number } | null>(null)
  async function handleScan() {
    const code = search.trim()
    if (!code || !/\d/.test(code)) return

    // Impede lançamento duplicado por leitura repetida indevida (3s)
    const now = Date.now()
    if (lastScanRef.current && lastScanRef.current.code === code && now - lastScanRef.current.at < 3000) {
      toast.warning('Etiqueta já lançada há poucos segundos — leitura duplicada ignorada')
      return
    }
    lastScanRef.current = { code, at: now }

    setScanning(true)
    try {
      const result = await apiPost<{
        kind: string
        product: ProductDTO
        qty: number
        unitPrice: number
        total: number
      }>('/api/scales/decode', { code })

      // Mescla com o catálogo carregado para garantir todos os campos (preço, custo, kitchen)
      const catalog = products.find((p) => p.id === result.product.id)
      const product: ProductDTO = catalog
        ? catalog
        : {
            ...result.product,
            price: result.unitPrice,
            cost: result.product.cost ?? 0,
            unit: result.product.saleUnit ?? 'UN',
            active: true,
          }

      addToCart(product, result.qty, result.kind === 'SCALE_LABEL')
      if (result.kind === 'SCALE_LABEL') {
        toast.success(
          `${product.name}: ${result.qty.toFixed(3).replace('.', ',')} kg × ${brl(result.unitPrice)} = ${brl(result.total)}`,
        )
      } else {
        toast.success(`${product.name} adicionado`)
      }
      setSearch('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao interpretar o código')
    } finally {
      setScanning(false)
    }
  }

  // ---- pesagem direta no caixa (balança compatível) ----
  function openWeighDialog(product: ProductDTO) {
    setWeighProduct(product)
    setWeighWeight('')
    setWeighResult(null)
    setWeighOpen(true)
  }

  async function runWeigh() {
    if (!weighProduct) return
    setWeighBusy(true)
    setWeighResult(null)
    try {
      const result = await apiPost<{ qty: number; total: number; label: string }>('/api/scales/simulate', {
        productId: weighProduct.id,
        weight: weighWeight.trim() ? Number(weighWeight.replace(',', '.')) : undefined,
      })
      setWeighResult(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha na pesagem')
    } finally {
      setWeighBusy(false)
    }
  }

  function confirmWeigh() {
    if (!weighProduct) return
    if (weighResult) {
      addToCart(weighProduct, weighResult.qty, true)
      toast.success(
        `${weighProduct.name}: ${weighResult.qty.toFixed(3).replace('.', ',')} kg = ${brl(weighResult.total)}`,
      )
    } else if (weighManualQty > 0) {
      // Venda por peso digitado — não exige balança vinculada ao sistema
      addToCart(weighProduct, weighManualQty, true)
      toast.success(
        `${weighProduct.name}: ${weighManualQty.toFixed(3).replace('.', ',')} kg = ${brl(weighManualTotal)}`,
        { description: 'Peso digitado manualmente (balança não integrada)' },
      )
    }
    setWeighOpen(false)
  }

  function setQty(productId: string, qty: number) {
    setCart((prev) => {
      if (qty <= 0) return prev.filter((l) => l.product.id !== productId)
      return prev.map((l) => (l.product.id === productId ? { ...l, qty } : l))
    })
  }

  function removeLine(productId: string) {
    setCart((prev) => prev.filter((l) => l.product.id !== productId))
  }

  function openPayDialog() {
    if (cart.length === 0) return
    setPayments([{ id: nextId(), method: 'DINHEIRO', amount: total > 0 ? total.toFixed(2) : '' }])
    setCashReceived('')
    setPayOpen(true)
  }

  function addPaymentRow() {
    setPayments((prev) => {
      const used = new Set(prev.map((p) => p.method))
      const free = PAY_METHODS.find((m) => !used.has(m))
      if (!free) return prev
      return [...prev, { id: nextId(), method: free, amount: '' }]
    })
  }

  function updatePaymentRow(id: string, patch: Partial<PaymentDraft>) {
    setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
  }

  function removePaymentRow(id: string) {
    setPayments((prev) => (prev.length <= 1 ? prev : prev.filter((p) => p.id !== id)))
  }

  function setCashTotalShortcut() {
    setPayments([{ id: nextId(), method: 'DINHEIRO', amount: total > 0 ? total.toFixed(2) : '' }])
  }

  function clearPayments() {
    setPayments([{ id: nextId(), method: 'DINHEIRO', amount: '' }])
    setCashReceived('')
  }

  async function finishSale() {
    if (cart.length === 0) return
    const fiadoRow = payments.find((p) => p.method === 'FIADO' && parseNum(p.amount) > 0)
    if (fiadoRow && customerId === 'none') {
      toast.error('Selecione um cliente para pagamento fiado')
      return
    }
    setPaying(true)
    try {
      const sale = await apiPost<SaleDTO & { fiscal?: { issued: boolean; status?: string; number?: number; error?: string } }>('/api/sales', {
        items: cart.map((l) => ({ productId: l.product.id, qty: l.qty })),
        discount: discountNum,
        payments: payments.map((p) => ({ method: p.method, amount: round2(parseNum(p.amount)) })),
        channel,
        operator: operator.name,
        ...(customerId !== 'none' ? { customerId } : {}),
      })
      toast.success(`Venda ${sale.code} concluída`)
      if (sale.fiscal?.issued) {
        toast.success(`NFC-e nº ${sale.fiscal.number} ${sale.fiscal.status === 'TRANSMITIDA' ? 'autorizada' : 'emitida'}`, {
          description: 'Documento disponível no módulo Fiscal (XML e DANFE).',
        })
      } else if (sale.fiscal?.error) {
        toast.warning('Venda concluída sem NFC-e', {
          description: sale.fiscal.error,
        })
      }
      setReceipt(sale)
      setPayOpen(false)
      setCart([])
      setDiscount('')
      setCustomerId('none')
      setChannel('BALCAO')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao finalizar venda')
    } finally {
      setPaying(false)
    }
  }

  async function cancelSale() {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      await apiPatch<SaleDTO>(`/api/sales/${cancelTarget.id}`, { action: 'cancel' })
      toast.success(`Venda ${cancelTarget.code} cancelada`)
      setCancelTarget(null)
      setHistoryTick((t) => t + 1)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao cancelar venda')
    } finally {
      setCancelling(false)
    }
  }

  function methodsForRow(current: PaymentDraft): PayMethod[] {
    const usedElsewhere = new Set(
      payments.filter((p) => p.id !== current.id).map((p) => p.method),
    )
    return PAY_METHODS.filter((m) => !usedElsewhere.has(m))
  }

  return (
    <div className="space-y-4">
      {/* Header do PDV */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShoppingCart className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Frente de Caixa</h2>
          <span className="text-xs text-muted-foreground">Operador: {operator.name}</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
          <History />
          Últimas vendas
        </Button>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ===================== Catálogo ===================== */}
        <div className="min-w-0 space-y-3">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleScan()
              }}
              placeholder="Buscar produto, código de barras ou etiqueta de balança (Enter)..."
              className="pl-9"
            />
          </div>

          {/* Chips de categorias */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            <button
              type="button"
              onClick={() => setCatFilter('all')}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                catFilter === 'all'
                  ? 'border-transparent bg-primary text-primary-foreground'
                  : 'bg-card text-muted-foreground hover:bg-accent'
              }`}
            >
              Todos
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCatFilter(cat.id)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  catFilter === cat.id
                    ? 'border-transparent bg-primary text-primary-foreground'
                    : 'bg-card text-muted-foreground hover:bg-accent'
                }`}
              >
                {cat.emoji ? <span className="mr-1">{cat.emoji}</span> : null}
                {cat.name}
              </button>
            ))}
          </div>

          {/* Grade de produtos */}
          {loading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-xl border bg-card">
                  <Skeleton className="h-28 w-full rounded-b-none rounded-t-xl" />
                  <div className="space-y-2 p-3">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-5 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border bg-card p-10 text-muted-foreground">
              <Croissant className="size-8" />
              <p className="text-sm">Nenhum produto encontrado</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {filteredProducts.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    p.isWeighable || (p.byWeight && p.isWeighable !== false && p.isWeighable !== undefined)
                      ? openWeighDialog(p)
                      : addToCart(p)
                  }
                  className="rounded-xl border bg-card text-left transition-transform duration-100 active:scale-95"
                >
                  <ProductThumb src={p.categoryImageUrl} alt={p.name} />
                  <div className="space-y-1 p-3">
                    <p className="line-clamp-2 min-h-10 text-sm font-medium leading-tight">{p.name}</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-bold text-primary tabular-nums">{brl(p.price)}</span>
                      {p.byWeight ? <span className="text-xs text-muted-foreground">/kg</span> : null}
                    </div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs text-muted-foreground">Custo {brl(p.cost)}</span>
                      {p.byWeight ? (
                        <Badge variant="secondary">{p.isWeighable ? 'PESAR' : 'KG'}</Badge>
                      ) : null}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ===================== Carrinho ===================== */}
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 lg:sticky lg:top-0 lg:self-start">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ShoppingCart className="size-4 text-primary" />
              Carrinho
              <Badge variant="secondary" className="tabular-nums">
                {num(cartCount, cartCount % 1 === 0 ? 0 : 2)}
              </Badge>
            </h3>
            {cart.length > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => setCart([])}>
                <Trash2 />
                Limpar
              </Button>
            ) : null}
          </div>

          {cart.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Toque em um produto para adicionar
            </p>
          ) : (
            <div className="max-h-72 space-y-3 overflow-y-auto pr-1 scrollbar-thin">
              {cart.map((line) => (
                <div key={line.product.id} className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium leading-tight">{line.product.name}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {brl(line.product.price)}
                        {line.product.byWeight ? ' /kg' : ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground"
                      onClick={() => removeLine(line.product.id)}
                    >
                      <X />
                    </Button>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    {line.product.byWeight ? (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={0.001}
                          step={0.001}
                          value={line.qty}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            if (!Number.isFinite(v) || v <= 0) return
                            setQty(line.product.id, round3(v))
                          }}
                          className="h-8 w-24 tabular-nums"
                        />
                        <span className="text-xs text-muted-foreground">kg</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-7"
                          onClick={() => setQty(line.product.id, Math.floor(line.qty) - 1)}
                        >
                          <Minus />
                        </Button>
                        <span className="w-8 text-center text-sm font-medium tabular-nums">
                          {num(line.qty)}
                        </span>
                        <Button
                          variant="outline"
                          size="icon"
                          className="size-7"
                          onClick={() => setQty(line.product.id, Math.floor(line.qty) + 1)}
                        >
                          <Plus />
                        </Button>
                      </div>
                    )}
                    <span className="text-sm font-semibold tabular-nums">
                      {brl(line.product.price * line.qty)}
                    </span>
                  </div>
                  <Separator />
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium tabular-nums">{brl(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <Label htmlFor="pdv-discount" className="text-muted-foreground">
                Desconto (R$)
              </Label>
              <Input
                id="pdv-discount"
                type="number"
                min={0}
                step={0.01}
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="h-8 w-28 text-right tabular-nums"
                placeholder="0,00"
              />
            </div>
            <Separator />
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold">TOTAL</span>
              <span className="text-2xl font-bold text-primary tabular-nums">{brl(total)}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  <User className="size-3" />
                  Cliente
                </Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger className="w-full" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem cliente</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Canal</Label>
                <Select value={channel} onValueChange={setChannel}>
                  <SelectTrigger className="w-full" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BALCAO">
                      <Store className="size-3.5" />
                      Balcão
                    </SelectItem>
                    <SelectItem value="DELIVERY">
                      <Bike className="size-3.5" />
                      Delivery
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              className="h-11 w-full text-base"
              disabled={cart.length === 0 || discountExceeds}
              onClick={openPayDialog}
            >
              <Banknote />
              {discountExceeds ? 'Desconto acima do subtotal' : 'Finalizar venda'}
            </Button>
          </div>
        </div>
      </div>

      {/* ===================== Dialog de pagamento ===================== */}
      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="size-5 text-primary" />
              Pagamento
            </DialogTitle>
            <DialogDescription>
              Total a cobrar:{' '}
              <span className="font-semibold text-foreground tabular-nums">{brl(total)}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {payments.map((row) => (
              <div key={row.id} className="flex items-center gap-2">
                <Select
                  value={row.method}
                  onValueChange={(v) => updatePaymentRow(row.id, { method: v as PayMethod })}
                >
                  <SelectTrigger className="w-44 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {methodsForRow(row).map((m) => (
                      <SelectItem key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m] ?? m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={row.amount}
                  onChange={(e) => updatePaymentRow(row.id, { amount: e.target.value })}
                  placeholder="0,00"
                  className="text-right tabular-nums"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground"
                  disabled={payments.length <= 1}
                  onClick={() => removePaymentRow(row.id)}
                >
                  <X />
                </Button>
              </div>
            ))}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={addPaymentRow}>
                <Plus />
                Adicionar forma
              </Button>
              <Button variant="outline" size="sm" onClick={setCashTotalShortcut}>
                <Banknote />
                Dinheiro total
              </Button>
              <Button variant="ghost" size="sm" onClick={clearPayments}>
                <Trash2 />
                Limpar formas
              </Button>
            </div>

            <div
              className={`rounded-lg px-3 py-2 text-sm font-medium tabular-nums ${
                Math.abs(payDiff) <= 0.01
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              }`}
            >
              Pago: {brl(paidSum)} ·{' '}
              {payDiff > 0.01
                ? `Faltam ${brl(payDiff)}`
                : payDiff < -0.01
                  ? `Excedem ${brl(-payDiff)}`
                  : 'Valor fechado'}
            </div>

            {hasCashRow ? (
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="pdv-cash" className="text-sm text-muted-foreground">
                  Recebido (dinheiro)
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="pdv-cash"
                    type="number"
                    min={0}
                    step={0.01}
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    placeholder="0,00"
                    className="h-8 w-28 text-right tabular-nums"
                  />
                  {cashChange > 0 ? (
                    <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      Troco {brl(cashChange)}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)} disabled={paying}>
              Voltar
            </Button>
            <Button onClick={() => void finishSale()} disabled={!canFinish || paying}>
              {paying ? 'Processando...' : 'Concluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== Comprovante ===================== */}
      <Dialog open={receipt !== null} onOpenChange={(open) => !open && setReceipt(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="size-5 text-primary" />
              Comprovante da venda
            </DialogTitle>
            <DialogDescription>
              {receipt ? `Venda ${receipt.code} · ${dthr(receipt.createdAt)}` : ''}
            </DialogDescription>
          </DialogHeader>
          {receipt ? (
            <div className="space-y-3 text-sm">
              <div className="max-h-56 space-y-1 overflow-y-auto pr-1 scrollbar-thin">
                {receipt.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {num(item.qty, item.qty % 1 === 0 ? 0 : 2)}× {item.name}
                    </span>
                    <span className="shrink-0 tabular-nums">{brl(item.subtotal)}</span>
                  </div>
                ))}
              </div>
              <Separator />
              {receipt.discount > 0 ? (
                <div className="flex justify-between text-muted-foreground">
                  <span>Desconto</span>
                  <span className="tabular-nums">-{brl(receipt.discount)}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-base font-bold">
                <span>Total</span>
                <span className="text-primary tabular-nums">{brl(receipt.total)}</span>
              </div>
              <Separator />
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Pagamentos</p>
                {receipt.payments.map((p) => (
                  <div key={p.id} className="flex justify-between">
                    <span>{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</span>
                    <span className="tabular-nums">{brl(p.amount)}</span>
                  </div>
                ))}
              </div>
              {receipt.customer ? (
                <p className="text-xs text-muted-foreground">Cliente: {receipt.customer}</p>
              ) : null}
              {(receipt as SaleDTO & { fiscal?: { issued: boolean; status?: string; number?: number; error?: string } }).fiscal?.issued ? (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs text-emerald-400">
                  NFC-e nº {(receipt as SaleDTO & { fiscal?: { issued: boolean; status?: string; number?: number } }).fiscal?.number}{' '}
                  {(receipt as SaleDTO & { fiscal?: { issued: boolean; status?: string; number?: number } }).fiscal?.status === 'TRANSMITIDA'
                    ? 'autorizada - XML e DANFE disponíveis no módulo Fiscal'
                    : 'emitida - consulte o módulo Fiscal'}
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer />
              Imprimir
            </Button>
            <Button onClick={() => setReceipt(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== Últimas vendas ===================== */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="size-5 text-primary" />
              Últimas vendas
            </DialogTitle>
            <DialogDescription>Cancelamento de vendas concluídas</DialogDescription>
          </DialogHeader>
          <div className="max-h-96 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
            {historyLoading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : sales.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma venda ainda</p>
            ) : (
              sales.map((sale) => (
                <div
                  key={sale.id}
                  className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <span className="font-mono">#{sale.code}</span>
                      {sale.status === 'CANCELADA' ? (
                        <Badge variant="destructive">Cancelada</Badge>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {hr(sale.createdAt)} ·{' '}
                      {sale.payments
                        .map((p) => PAYMENT_METHOD_LABELS[p.method] ?? p.method)
                        .join(', ') || '-'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums">{brl(sale.total)}</span>
                    {sale.status === 'CONCLUIDA' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive"
                        onClick={() => setCancelTarget(sale)}
                      >
                        <X />
                        Cancelar
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Pesagem direta no caixa (balança compatível / simulador) */}
      <Dialog open={weighOpen} onOpenChange={setWeighOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pesagem — {weighProduct?.name}</DialogTitle>
            <DialogDescription>
              Com balança integrada: clique em Ler balança. Sem integração: pese na balança física,
              digite o peso mostrado e confirme — a venda funciona das duas formas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border bg-muted/40 p-4 text-center">
              <p className="text-3xl font-bold tabular-nums">
                {weighResult
                  ? `${weighResult.qty.toFixed(3).replace('.', ',')} kg`
                  : weighManualQty > 0
                    ? `${weighManualQty.toFixed(3).replace('.', ',')} kg`
                    : '— — —'}
              </p>
              {weighResult ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {brl(weighProduct?.price ?? 0)}/kg · total{' '}
                  <span className="font-semibold text-foreground">{brl(weighResult.total)}</span> · leitura da balança integrada
                </p>
              ) : weighManualQty > 0 ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {brl(weighProduct?.price ?? 0)}/kg · total{' '}
                  <span className="font-semibold text-foreground">{brl(weighManualTotal)}</span> · peso digitado manualmente
                </p>
              ) : null}
            </div>

            {/* Atalhos de peso rápido (gramas) */}
            <div className="flex flex-wrap gap-1.5">
              {QUICK_WEIGHTS.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setWeighWeight((g / 1000).toFixed(3))}
                  className={`rounded-full border px-2.5 py-1 text-xs tabular-nums transition-colors ${
                    weighManualQty > 0 && Math.abs(weighManualQty - g / 1000) < 0.0005
                      ? 'border-transparent bg-primary text-primary-foreground'
                      : 'bg-card text-muted-foreground hover:bg-accent'
                  }`}
                >
                  {g >= 1000 ? '1 kg' : `${g} g`}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="w-weight">Peso (kg)</Label>
                <Input
                  id="w-weight"
                  inputMode="decimal"
                  value={weighWeight}
                  onChange={(e) => setWeighWeight(e.target.value)}
                  placeholder="Ex.: 0,450"
                  autoFocus
                />
              </div>
              <div className="flex items-end">
                <Button variant="outline" className="w-full" onClick={() => void runWeigh()} disabled={weighBusy}>
                  {weighBusy ? <Loader2 className="size-4 animate-spin" /> : <Scale className="size-4" />}
                  Ler balança
                </Button>
              </div>
            </div>
            {weighResult?.label && (
              <p className="text-center font-mono text-xs text-muted-foreground">
                Etiqueta gerada: {weighResult.label}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWeighOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmWeigh} disabled={!canConfirmWeigh}>
              Adicionar ao carrinho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de cancelamento */}
      <AlertDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar venda?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget
                ? `A venda #${cancelTarget.code} de ${brl(cancelTarget.total)} será marcada como cancelada. Pagamentos em dinheiro são estornados no caixa aberto.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelling}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                void cancelSale()
              }}
            >
              {cancelling ? 'Cancelando...' : 'Confirmar cancelamento'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
