// BAKERY ERP - Produção (ordens de produção + receitas/fichas técnicas)
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  ChefHat,
  ClipboardList,
  Coins,
  FlaskConical,
  Package,
  Play,
  Plus,
  User,
  X,
  CircleCheck,
  Trash2,
} from 'lucide-react'

import type { ViewProps } from '@/components/erp/view-props'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api'
import { brl, dthr, hr, num } from '@/lib/format'
import type {
  IngredientDTO,
  ProductDTO,
  ProductionOrderDTO,
  RecipeDTO,
} from '@/lib/types'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

type OrderForm = { recipeId: string; plannedQty: string; notes: string }
type RecipeForm = {
  name: string
  productId: string
  yieldQty: string
  unit: string
  laborCost: string
  notes: string
}
type DraftItem = { id: string; ingredientId: string; qty: string }

const RECIPE_UNITS = ['UN', 'KG', 'PCT'] as const

const round2 = (v: number) => Math.round(v * 100) / 100

function parseNum(value: string): number {
  const n = Number(value.replace(',', '.').trim())
  return Number.isFinite(n) ? n : 0
}

function fmtQty(v: number): string {
  return Number.isInteger(v) ? num(v) : num(v, 2)
}

function OrderStatusBadge({ status }: { status: ProductionOrderDTO['status'] }) {
  if (status === 'PLANEJADA') {
    return (
      <Badge
        variant="outline"
        className="border-amber-500/40 text-amber-600 dark:text-amber-400"
      >
        Planejada
      </Badge>
    )
  }
  if (status === 'EM_ANDAMENTO') {
    return (
      <Badge variant="secondary" className="animate-pulse">
        Em andamento
      </Badge>
    )
  }
  if (status === 'CONCLUIDA') {
    return (
      <Badge
        variant="outline"
        className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
      >
        Concluída
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-destructive/40 text-destructive">
      Cancelada
    </Badge>
  )
}

export default function ProductionView({ operator }: ViewProps) {
  const [orders, setOrders] = useState<ProductionOrderDTO[]>([])
  const [recipes, setRecipes] = useState<RecipeDTO[]>([])
  const [ingredients, setIngredients] = useState<IngredientDTO[]>([])
  const [products, setProducts] = useState<ProductDTO[]>([])
  const [loading, setLoading] = useState(true)

  // nova ordem
  const [orderOpen, setOrderOpen] = useState(false)
  const [orderForm, setOrderForm] = useState<OrderForm>({ recipeId: 'none', plannedQty: '', notes: '' })
  const [orderSaving, setOrderSaving] = useState(false)

  // concluir ordem
  const [completeTarget, setCompleteTarget] = useState<ProductionOrderDTO | null>(null)
  const [producedQty, setProducedQty] = useState('')
  const [lossQty, setLossQty] = useState('')
  const [batchCode, setBatchCode] = useState('')
  const [shelfLifeDays, setShelfLifeDays] = useState('')
  const [consumptionDraft, setConsumptionDraft] = useState<Array<{ ingredientId: string; actualQty: string }>>([])
  const [completing, setCompleting] = useState(false)

  // cancelar ordem
  const [cancelTarget, setCancelTarget] = useState<ProductionOrderDTO | null>(null)
  const [cancelling, setCancelling] = useState(false)

  // ficha técnica
  const [detailRecipe, setDetailRecipe] = useState<RecipeDTO | null>(null)
  const [deleteRecipeTarget, setDeleteRecipeTarget] = useState<RecipeDTO | null>(null)
  const [deletingRecipe, setDeletingRecipe] = useState(false)

  // nova receita
  const [recipeOpen, setRecipeOpen] = useState(false)
  const [recipeForm, setRecipeForm] = useState<RecipeForm>({
    name: '',
    productId: 'none',
    yieldQty: '',
    unit: 'UN',
    laborCost: '',
    notes: '',
  })
  const [draftItems, setDraftItems] = useState<DraftItem[]>([])
  const [draftIngredientId, setDraftIngredientId] = useState('none')
  const [draftQty, setDraftQty] = useState('')
  const [recipeSaving, setRecipeSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ords, recs, ings, prods] = await Promise.all([
        apiGet<ProductionOrderDTO[]>('/api/production-orders'),
        apiGet<RecipeDTO[]>('/api/recipes'),
        apiGet<IngredientDTO[]>('/api/ingredients'),
        apiGet<ProductDTO[]>('/api/products'),
      ])
      setOrders(ords)
      setRecipes(recs)
      setIngredients(ings)
      setProducts(prods)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao carregar produção')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const loadOrders = useCallback(async () => {
    try {
      setOrders(await apiGet<ProductionOrderDTO[]>('/api/production-orders'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao recarregar ordens')
    }
  }, [])

  const loadRecipes = useCallback(async () => {
    try {
      setRecipes(await apiGet<RecipeDTO[]>('/api/recipes'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao recarregar receitas')
    }
  }, [])

  const selectedOrderRecipe = useMemo(
    () => recipes.find((r) => r.id === orderForm.recipeId) ?? null,
    [recipes, orderForm.recipeId],
  )

  const recipeIngredientCost = useMemo(
    () =>
      round2(
        draftItems.reduce((acc, item) => {
          const ing = ingredients.find((i) => i.id === item.ingredientId)
          return acc + parseNum(item.qty) * (ing?.costPerUnit ?? 0)
        }, 0),
      ),
    [draftItems, ingredients],
  )
  const recipeEstimatedTotal = round2(recipeIngredientCost + parseNum(recipeForm.laborCost))

  const stats = useMemo(() => {
    const planned = orders.filter((o) => o.status === 'PLANEJADA').length
    const running = orders.filter((o) => o.status === 'EM_ANDAMENTO').length
    return { planned, running }
  }, [orders])

  function productName(productId?: string | null): string {
    if (!productId) return 'Sem produto vinculado'
    return products.find((p) => p.id === productId)?.name ?? 'Produto removido'
  }

  function ingredientName(ingredientId: string): string {
    return ingredients.find((i) => i.id === ingredientId)?.name ?? 'Insumo'
  }

  // ---- ordens ----
  async function createOrder() {
    const plannedQty = parseNum(orderForm.plannedQty)
    if (orderForm.recipeId === 'none') {
      toast.error('Selecione uma receita')
      return
    }
    if (plannedQty <= 0) {
      toast.error('Quantidade planejada deve ser maior que zero')
      return
    }
    setOrderSaving(true)
    try {
      const created = await apiPost<ProductionOrderDTO>('/api/production-orders', {
        recipeId: orderForm.recipeId,
        plannedQty,
        notes: orderForm.notes.trim() || null,
        operator: operator.name,
      })
      toast.success(`Ordem ${created.code} criada`)
      setOrderOpen(false)
      setOrderForm({ recipeId: 'none', plannedQty: '', notes: '' })
      await loadOrders()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar ordem')
    } finally {
      setOrderSaving(false)
    }
  }

  async function startOrder(order: ProductionOrderDTO) {
    try {
      await apiPatch<ProductionOrderDTO>(`/api/production-orders/${order.id}`, {
        action: 'start',
        operator: operator.name,
      })
      toast.success(`Ordem ${order.code} iniciada`)
      await loadOrders()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao iniciar ordem')
    }
  }

  function openComplete(order: ProductionOrderDTO) {
    setCompleteTarget(order)
    setProducedQty(String(order.plannedQty))
    setLossQty('')
    setBatchCode('')
    setShelfLifeDays('')
    // Consumo real pré-preenchido com o previsto (proporcional à produção planejada)
    void (async () => {
      try {
        const recipes = await apiGet<Array<{
          id: string
          yieldQty: number
          items: Array<{ ingredientId: string; qty: number }>
        }>>('/api/recipes')
        const recipe = recipes.find((r) => r.id === order.recipeId)
        if (!recipe) return
        const factor = order.plannedQty / (recipe.yieldQty || 1)
        setConsumptionDraft(
          recipe.items.map((item) => ({ ingredientId: item.ingredientId, actualQty: String(round2(item.qty * factor)) })),
        )
      } catch {
        setConsumptionDraft([])
      }
    })()
  }

  async function confirmComplete() {
    if (!completeTarget) return
    const qty = parseNum(producedQty)
    if (qty <= 0) {
      toast.error('Quantidade produzida deve ser maior que zero')
      return
    }
    setCompleting(true)
    try {
      await apiPatch<ProductionOrderDTO>(`/api/production-orders/${completeTarget.id}`, {
        action: 'complete',
        producedQty: qty,
        operator: operator.name,
        lossQty: lossQty.trim() ? parseNum(lossQty) : 0,
        batchCode: batchCode.trim() || null,
        shelfLifeDays: shelfLifeDays.trim() ? parseNum(shelfLifeDays) : null,
        consumption: consumptionDraft.map((entry) => ({
          ingredientId: entry.ingredientId,
          actualQty: parseNum(entry.actualQty),
        })),
      })
      toast.success(
        `Ordem ${completeTarget.code} concluída · consumo real registrado · estoque atualizado`,
      )
      setCompleteTarget(null)
      await loadOrders()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao concluir ordem')
    } finally {
      setCompleting(false)
    }
  }

  async function confirmCancelOrder() {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      await apiPatch<ProductionOrderDTO>(`/api/production-orders/${cancelTarget.id}`, {
        action: 'cancel',
        operator: operator.name,
      })
      toast.success(`Ordem ${cancelTarget.code} cancelada`)
      setCancelTarget(null)
      await loadOrders()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao cancelar ordem')
    } finally {
      setCancelling(false)
    }
  }

  // ---- receitas ----
  function addDraftItem() {
    if (draftIngredientId === 'none') {
      toast.error('Selecione um ingrediente')
      return
    }
    const qty = parseNum(draftQty)
    if (qty <= 0) {
      toast.error('Informe a quantidade do ingrediente')
      return
    }
    const existing = draftItems.find((i) => i.ingredientId === draftIngredientId)
    if (existing) {
      setDraftItems((prev) =>
        prev.map((i) =>
          i.id === existing.id ? { ...i, qty: String(round2(parseNum(i.qty) + qty)) } : i,
        ),
      )
    } else {
      setDraftItems((prev) => [
        ...prev,
        { id: `item-${Date.now()}-${prev.length}`, ingredientId: draftIngredientId, qty: String(qty) },
      ])
    }
    setDraftQty('')
    setDraftIngredientId('none')
  }

  async function createRecipe() {
    const name = recipeForm.name.trim()
    const yieldQty = parseNum(recipeForm.yieldQty)
    if (!name) {
      toast.error('Informe o nome da receita')
      return
    }
    if (yieldQty <= 0) {
      toast.error('Rendimento deve ser maior que zero')
      return
    }
    if (draftItems.length === 0) {
      toast.error('Adicione ao menos um ingrediente')
      return
    }
    const invalidQty = draftItems.some((i) => parseNum(i.qty) <= 0)
    if (invalidQty) {
      toast.error('Todos os ingredientes precisam de quantidade maior que zero')
      return
    }
    setRecipeSaving(true)
    try {
      await apiPost<RecipeDTO>('/api/recipes', {
        name,
        productId: recipeForm.productId === 'none' ? null : recipeForm.productId,
        yieldQty,
        unit: recipeForm.unit,
        laborCost: round2(parseNum(recipeForm.laborCost)),
        notes: recipeForm.notes.trim() || null,
        items: draftItems.map((i) => ({ ingredientId: i.ingredientId, qty: round2(parseNum(i.qty)) })),
      })
      toast.success('Receita criada')
      setRecipeOpen(false)
      setRecipeForm({ name: '', productId: 'none', yieldQty: '', unit: 'UN', laborCost: '', notes: '' })
      setDraftItems([])
      setDraftIngredientId('none')
      setDraftQty('')
      await loadRecipes()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar receita')
    } finally {
      setRecipeSaving(false)
    }
  }

  async function confirmDeleteRecipe() {
    if (!deleteRecipeTarget) return
    setDeletingRecipe(true)
    try {
      await apiDelete(`/api/recipes/${deleteRecipeTarget.id}`)
      toast.success('Receita excluída')
      setDeleteRecipeTarget(null)
      setDetailRecipe(null)
      await loadRecipes()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir receita')
    } finally {
      setDeletingRecipe(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ChefHat className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Produção</h2>
          {stats.running > 0 ? (
            <Badge variant="secondary" className="animate-pulse">
              {stats.running} em andamento
            </Badge>
          ) : null}
        </div>
      </div>

      <Tabs defaultValue="orders">
        <TabsList>
          <TabsTrigger value="orders">
            <ClipboardList />
            Ordens de produção
          </TabsTrigger>
          <TabsTrigger value="recipes">
            <FlaskConical />
            Receitas (Fichas técnicas)
          </TabsTrigger>
        </TabsList>

        {/* ===================== Ordens ===================== */}
        <TabsContent value="orders" className="space-y-3">
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => {
                setOrderForm({ recipeId: 'none', plannedQty: '', notes: '' })
                setOrderOpen(true)
              }}
            >
              <Plus />
              Nova ordem
            </Button>
          </div>

          {loading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-44 w-full rounded-xl" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border bg-card p-10 text-muted-foreground">
              <ClipboardList className="size-8" />
              <p className="text-sm">Nenhuma ordem de produção</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {orders.map((order) => (
                <div key={order.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm text-muted-foreground">{order.code}</span>
                    <OrderStatusBadge status={order.status} />
                  </div>
                  <div>
                    <p className="font-semibold leading-tight">{order.recipeName}</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                      <span className="tabular-nums">
                        Planejada: <span className="font-medium text-foreground">{fmtQty(order.plannedQty)}</span>
                      </span>
                      {order.producedQty != null ? (
                        <span className="tabular-nums">
                          Produzida: <span className="font-medium text-foreground">{fmtQty(order.producedQty)}</span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {order.notes ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{order.notes}</p>
                  ) : null}
                  <div className="mt-auto space-y-1 text-xs text-muted-foreground">
                    {order.operator ? (
                      <p className="flex items-center gap-1">
                        <User className="size-3" />
                        {order.operator}
                      </p>
                    ) : null}
                    <p>Criada em {dthr(order.createdAt)}</p>
                    {order.startedAt ? <p>Iniciada às {hr(order.startedAt)}</p> : null}
                    {order.finishedAt ? <p>Concluída às {hr(order.finishedAt)}</p> : null}
                  </div>
                  {order.status === 'PLANEJADA' || order.status === 'EM_ANDAMENTO' ? (
                    <div className="flex gap-2 border-t pt-3">
                      {order.status === 'PLANEJADA' ? (
                        <Button size="sm" className="flex-1" onClick={() => void startOrder(order)}>
                          <Play />
                          Iniciar
                        </Button>
                      ) : (
                        <Button size="sm" className="flex-1" onClick={() => openComplete(order)}>
                          <CircleCheck />
                          Concluir
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        onClick={() => setCancelTarget(order)}
                      >
                        <X />
                        Cancelar
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ===================== Receitas ===================== */}
        <TabsContent value="recipes" className="space-y-3">
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => {
                setRecipeForm({ name: '', productId: 'none', yieldQty: '', unit: 'UN', laborCost: '', notes: '' })
                setDraftItems([])
                setDraftIngredientId('none')
                setDraftQty('')
                setRecipeOpen(true)
              }}
            >
              <Plus />
              Nova receita
            </Button>
          </div>

          {loading ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-40 w-full rounded-xl" />
              ))}
            </div>
          ) : recipes.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border bg-card p-10 text-muted-foreground">
              <FlaskConical className="size-8" />
              <p className="text-sm">Nenhuma receita cadastrada</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {recipes.map((recipe) => (
                <button
                  key={recipe.id}
                  type="button"
                  onClick={() => setDetailRecipe(recipe)}
                  className="rounded-xl border bg-card p-4 text-left transition-transform duration-100 active:scale-[0.98]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold leading-tight">{recipe.name}</p>
                    <Badge variant="secondary">{recipe.items.length} itens</Badge>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Package className="size-3" />
                    {productName(recipe.productId)}
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Rendimento</p>
                      <p className="font-medium tabular-nums">
                        {fmtQty(recipe.yieldQty)} {recipe.unit}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Custo do lote</p>
                      <p className="font-medium tabular-nums">{brl(recipe.totalCost)}</p>
                    </div>
                  </div>
                  <Separator className="my-2" />
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-muted-foreground">Custo por unidade</span>
                    <span className="font-bold text-primary tabular-nums">
                      {brl(recipe.costPerUnit)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ===================== Dialog nova ordem ===================== */}
      <Dialog open={orderOpen} onOpenChange={setOrderOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="size-5 text-primary" />
              Nova ordem de produção
            </DialogTitle>
            <DialogDescription>Planeja a fabricação a partir de uma receita</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Receita</Label>
              <Select
                value={orderForm.recipeId}
                onValueChange={(v) => setOrderForm((f) => ({ ...f, recipeId: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" disabled>
                    Selecione uma receita
                  </SelectItem>
                  {recipes.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name} · rende {fmtQty(r.yieldQty)} {r.unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedOrderRecipe ? (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Coins className="size-3" />
                  Custo por unidade: {brl(selectedOrderRecipe.costPerUnit)}
                </p>
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="o-qty">Quantidade planejada</Label>
              <Input
                id="o-qty"
                type="number"
                min={0.1}
                step={0.1}
                value={orderForm.plannedQty}
                onChange={(e) => setOrderForm((f) => ({ ...f, plannedQty: e.target.value }))}
                className="text-right tabular-nums"
                placeholder="0"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="o-notes">Notas</Label>
              <Textarea
                id="o-notes"
                rows={2}
                value={orderForm.notes}
                onChange={(e) => setOrderForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOrderOpen(false)} disabled={orderSaving}>
              Cancelar
            </Button>
            <Button onClick={() => void createOrder()} disabled={orderSaving}>
              {orderSaving ? 'Criando...' : 'Criar ordem'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== Dialog concluir ordem ===================== */}
      <Dialog
        open={completeTarget !== null}
        onOpenChange={(open) => !open && setCompleteTarget(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Concluir ordem {completeTarget?.code ?? ''}</DialogTitle>
            <DialogDescription>
              Ajuste o consumo real de cada insumo. O custo previsto x real será calculado
              automaticamente e o estoque do produto será atualizado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="op-produced">Quantidade produzida</Label>
                <Input
                  id="op-produced"
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={producedQty}
                  onChange={(e) => setProducedQty(e.target.value)}
                  className="text-right tabular-nums"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="op-loss">Perdas</Label>
                <Input
                  id="op-loss"
                  type="number"
                  min={0}
                  step={0.1}
                  value={lossQty}
                  onChange={(e) => setLossQty(e.target.value)}
                  placeholder="0"
                  className="text-right tabular-nums"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="op-batch">Lote</Label>
                <Input
                  id="op-batch"
                  value={batchCode}
                  onChange={(e) => setBatchCode(e.target.value)}
                  placeholder="Ex.: L2026-0428"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="op-shelf">Validade (dias)</Label>
                <Input
                  id="op-shelf"
                  type="number"
                  min={1}
                  value={shelfLifeDays}
                  onChange={(e) => setShelfLifeDays(e.target.value)}
                  placeholder="Ex.: 1"
                />
              </div>
            </div>
            {consumptionDraft.length > 0 && (
              <div className="rounded-lg border p-3 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Consumo real de insumos
                </p>
                {consumptionDraft.map((entry, index) => (
                  <div key={entry.ingredientId} className="grid grid-cols-[1fr_120px] items-center gap-2">
                    <span className="truncate text-sm">{ingredientName(entry.ingredientId)}</span>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={entry.actualQty}
                      onChange={(e) =>
                        setConsumptionDraft((prev) =>
                          prev.map((item, i) => (i === index ? { ...item, actualQty: e.target.value } : item)),
                        )
                    }
                      className="text-right tabular-nums"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCompleteTarget(null)}
              disabled={completing}
            >
              Voltar
            </Button>
            <Button onClick={() => void confirmComplete()} disabled={completing}>
              {completing ? 'Concluindo...' : 'Concluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== Ficha técnica ===================== */}
      <Dialog
        open={detailRecipe !== null}
        onOpenChange={(open) => !open && setDetailRecipe(null)}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="size-5 text-primary" />
              Ficha técnica: {detailRecipe?.name ?? ''}
            </DialogTitle>
            <DialogDescription>
              {detailRecipe
                ? `${productName(detailRecipe.productId)} · rende ${fmtQty(detailRecipe.yieldQty)} ${detailRecipe.unit}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {detailRecipe ? (
            <div className="space-y-4 text-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ingrediente</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Custo/un.</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailRecipe.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.ingredientName ?? '-'}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtQty(item.qty)} {item.unit ?? ''}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right tabular-nums">
                        {brl(item.costPerUnit ?? 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {brl(item.qty * (item.costPerUnit ?? 0))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="space-y-1 rounded-lg border p-3">
                <div className="flex justify-between text-muted-foreground">
                  <span>Custo dos insumos</span>
                  <span className="tabular-nums">
                    {brl(
                      detailRecipe.items.reduce(
                        (acc, i) => acc + i.qty * (i.costPerUnit ?? 0),
                        0,
                      ),
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Mão de obra</span>
                  <span className="tabular-nums">{brl(detailRecipe.laborCost)}</span>
                </div>
                {detailRecipe.packagingCost > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Embalagem</span>
                    <span className="tabular-nums">{brl(detailRecipe.packagingCost)}</span>
                  </div>
                )}
                {detailRecipe.lossPct > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Perda prevista ({detailRecipe.lossPct}%)</span>
                    <span className="tabular-nums">{brl(detailRecipe.ficha?.lossCost ?? 0)}</span>
                  </div>
                )}
                <Separator className="my-1" />
                <div className="flex justify-between font-medium">
                  <span>Custo total do lote</span>
                  <span className="tabular-nums">{brl(detailRecipe.totalCost)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Custo por unidade</span>
                  <span className="text-primary tabular-nums">{brl(detailRecipe.costPerUnit)}</span>
                </div>
              </div>

              {/* Margem e preço sugerido */}
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Resultado por unidade
                </p>
                {detailRecipe.ficha?.salePrice != null ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Preço de venda</span>
                      <span className="tabular-nums">{brl(detailRecipe.ficha.salePrice)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Margem de contribuição</span>
                      <span
                        className={`tabular-nums font-semibold ${
                          (detailRecipe.ficha.marginPerUnit ?? 0) < 0 ? 'text-destructive' : 'text-emerald-500'
                        }`}
                      >
                        {brl(detailRecipe.ficha.marginPerUnit ?? 0)} (
                        {detailRecipe.ficha.marginPct?.toFixed(1).replace('.', ',')}%)
                      </span>
                    </div>
                    {detailRecipe.ficha.suggestedPrice != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Preço sugerido (margem alvo {detailRecipe.ficha.targetMarginPct}%)
                        </span>
                        <span className="tabular-nums">{brl(detailRecipe.ficha.suggestedPrice)}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Vincule um produto à receita para calcular margem e preço sugerido.
                  </p>
                )}
                {(detailRecipe.modifiers?.length ?? 0) > 0 && (
                  <div className="flex justify-between border-t pt-1">
                    <span className="text-muted-foreground">
                      Modificadores (custo extra/un, somado às escolhas)
                    </span>
                    <span className="tabular-nums">
                      {brl(detailRecipe.ficha?.modifierCostsTotal ?? 0)}
                    </span>
                  </div>
                )}
              </div>

              {/* Modificadores: adicionais, retiradas e opções */}
              {(detailRecipe.modifiers?.length ?? 0) > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Adicionais e modificadores
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Insumo</TableHead>
                        <TableHead className="text-right">Custo</TableHead>
                        <TableHead className="text-right">Preço</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailRecipe.modifiers.map((modifier) => (
                        <TableRow key={modifier.id}>
                          <TableCell className="font-medium">
                            {modifier.name}
                            {!modifier.active && (
                              <Badge variant="outline" className="ml-1">
                                inativo
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={
                                modifier.kind === 'ADDITION'
                                  ? 'text-emerald-500'
                                  : modifier.kind === 'REMOVAL'
                                    ? 'text-destructive'
                                    : 'text-muted-foreground'
                              }
                            >
                              {modifier.kind === 'ADDITION'
                                ? 'adicional'
                                : modifier.kind === 'REMOVAL'
                                  ? 'retirada'
                                  : 'opção'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {modifier.ingredientName ?? '—'}
                            {modifier.qty > 0 && ` ${fmtQty(modifier.qty)} ${modifier.unit}`}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {brl(modifier.computedCost ?? modifier.extraCost)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {brl(modifier.extraPrice)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {detailRecipe.notes ? (
                <p className="text-xs text-muted-foreground">Notas: {detailRecipe.notes}</p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            {detailRecipe ? (
              <Button
                variant="outline"
                className="text-destructive"
                onClick={() => setDeleteRecipeTarget(detailRecipe)}
                disabled={deletingRecipe}
              >
                <Trash2 />
                Excluir receita
              </Button>
            ) : null}
            <Button onClick={() => setDetailRecipe(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== Dialog nova receita ===================== */}
      <Dialog open={recipeOpen} onOpenChange={setRecipeOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="size-5 text-primary" />
              Nova receita
            </DialogTitle>
            <DialogDescription>
              O custo total é calculado automaticamente a partir dos insumos e da mão de obra
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="r-name">Nome</Label>
                <Input
                  id="r-name"
                  value={recipeForm.name}
                  onChange={(e) => setRecipeForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex.: Massa de pão francês"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Produto vinculado</Label>
                <Select
                  value={recipeForm.productId}
                  onValueChange={(v) => setRecipeForm((f) => ({ ...f, productId: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="r-yield">Rendimento</Label>
                <Input
                  id="r-yield"
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={recipeForm.yieldQty}
                  onChange={(e) => setRecipeForm((f) => ({ ...f, yieldQty: e.target.value }))}
                  className="text-right tabular-nums"
                  placeholder="0"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Unidade</Label>
                <Select
                  value={recipeForm.unit}
                  onValueChange={(v) => setRecipeForm((f) => ({ ...f, unit: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RECIPE_UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="r-labor">Mão de obra (R$)</Label>
                <Input
                  id="r-labor"
                  type="number"
                  min={0}
                  step={0.01}
                  value={recipeForm.laborCost}
                  onChange={(e) => setRecipeForm((f) => ({ ...f, laborCost: e.target.value }))}
                  className="text-right tabular-nums"
                  placeholder="0,00"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="r-notes">Notas</Label>
              <Textarea
                id="r-notes"
                rows={2}
                value={recipeForm.notes}
                onChange={(e) => setRecipeForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Modo de preparo, observações..."
              />
            </div>

            <Separator />

            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Ingredientes do lote</p>
              <div className="flex gap-2">
                <Select value={draftIngredientId} onValueChange={setDraftIngredientId}>
                  <SelectTrigger className="min-w-0 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" disabled>
                      Selecione o ingrediente
                    </SelectItem>
                    {ingredients.map((ing) => (
                      <SelectItem key={ing.id} value={ing.id}>
                        {ing.name} ({ing.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={0.001}
                  step={0.01}
                  value={draftQty}
                  onChange={(e) => setDraftQty(e.target.value)}
                  className="w-24 shrink-0 text-right tabular-nums"
                  placeholder="Qtd"
                />
                <Button size="icon" className="shrink-0" onClick={addDraftItem}>
                  <Plus />
                </Button>
              </div>

              {draftItems.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {draftItems.map((item) => {
                    const ing = ingredients.find((i) => i.id === item.ingredientId)
                    return (
                      <div
                        key={item.id}
                        className="flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm"
                      >
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {ing?.name ?? '-'}
                        </span>
                        <Input
                          type="number"
                          min={0.001}
                          step={0.01}
                          value={item.qty}
                          onChange={(e) =>
                            setDraftItems((prev) =>
                              prev.map((row) =>
                                row.id === item.id ? { ...row, qty: e.target.value } : row,
                              ),
                            )
                          }
                          className="h-7 w-20 text-right text-xs tabular-nums"
                        />
                        <span className="w-8 shrink-0 text-xs text-muted-foreground">
                          {ing?.unit ?? ''}
                        </span>
                        <span className="w-20 shrink-0 text-right text-xs tabular-nums">
                          {brl(parseNum(item.qty) * (ing?.costPerUnit ?? 0))}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 shrink-0 text-muted-foreground"
                          onClick={() =>
                            setDraftItems((prev) => prev.filter((row) => row.id !== item.id))
                          }
                        >
                          <X />
                        </Button>
                      </div>
                    )
                  })}
                  <div className="flex justify-between px-1 pt-1 text-xs text-muted-foreground">
                    <span>Custo estimado (insumos + mão de obra)</span>
                    <span className="font-semibold text-primary tabular-nums">
                      {brl(recipeEstimatedTotal)}
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecipeOpen(false)} disabled={recipeSaving}>
              Cancelar
            </Button>
            <Button onClick={() => void createRecipe()} disabled={recipeSaving}>
              {recipeSaving ? 'Salvando...' : 'Salvar receita'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===================== Alertas ===================== */}
      <AlertDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar ordem de produção?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget
                ? `A ordem ${cancelTarget.code} (${cancelTarget.recipeName}) será marcada como cancelada.`
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
                void confirmCancelOrder()
              }}
            >
              {cancelling ? 'Cancelando...' : 'Cancelar ordem'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={deleteRecipeTarget !== null}
        onOpenChange={(open) => !open && setDeleteRecipeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir receita?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteRecipeTarget
                ? `A ficha técnica "${deleteRecipeTarget.name}" e seus ingredientes serão removidos permanentemente.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingRecipe}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingRecipe}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                void confirmDeleteRecipe()
              }}
            >
              {deletingRecipe ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
