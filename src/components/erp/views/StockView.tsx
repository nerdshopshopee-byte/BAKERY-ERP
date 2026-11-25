// BAKERY ERP - Estoque de Insumos
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowDownUp,
  ArrowLeftRight,
  Coins,
  EllipsisVertical,
  OctagonAlert,
  Package,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
} from 'lucide-react'

import type { ViewProps } from '@/components/erp/view-props'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api'
import { brl, dthr, num } from '@/lib/format'
import type { IngredientDTO, StockMovementDTO, SupplierDTO } from '@/lib/types'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

type IngredientForm = {
  name: string
  unit: string
  costPerUnit: string
  stock: string
  minStock: string
  supplierId: string
}
type MovementForm = {
  type: string
  qty: string
  reason: string
  unitCost: string
}

const UNITS = ['KG', 'G', 'L', 'ML', 'UN', 'PCT'] as const
const MOVE_TYPES = [
  { value: 'ENTRADA', label: 'Entrada', hint: 'Soma ao saldo atual' },
  { value: 'SAIDA', label: 'Saída', hint: 'Subtrai do saldo atual' },
  { value: 'AJUSTE', label: 'Ajuste', hint: 'Define o saldo final do estoque' },
  { value: 'PERDA', label: 'Perda', hint: 'Subtrai do saldo (quebra/perda)' },
] as const

const round2 = (v: number) => Math.round(v * 100) / 100

function parseNum(value: string): number {
  const n = Number(value.replace(',', '.').trim())
  return Number.isFinite(n) ? n : 0
}

function fmtQty(v: number): string {
  return Number.isInteger(v) ? num(v) : num(v, 2)
}

function movementBadge(type: string): {
  variant: 'outline' | 'secondary'
  className: string
  label: string
} {
  switch (type) {
    case 'ENTRADA':
      return {
        variant: 'outline',
        className: 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
        label: 'Entrada',
      }
    case 'SAIDA':
      return { variant: 'outline', className: 'border-destructive/40 text-destructive', label: 'Saída' }
    case 'PERDA':
      return { variant: 'outline', className: 'border-destructive/40 text-destructive', label: 'Perda' }
    case 'AJUSTE':
      return { variant: 'secondary', className: '', label: 'Ajuste' }
    case 'PRODUCAO':
      return {
        variant: 'outline',
        className: 'border-amber-500/40 text-amber-600 dark:text-amber-400',
        label: 'Produção',
      }
    case 'VENDA':
      return { variant: 'secondary', className: '', label: 'Venda' }
    default:
      return { variant: 'outline', className: '', label: type }
  }
}

function signedQtyLabel(m: StockMovementDTO): string {
  if (m.type === 'SAIDA' || m.type === 'PERDA') return `-${fmtQty(m.qty)}`
  return `${m.qty >= 0 ? '+' : ''}${fmtQty(m.qty)}`
}

export default function StockView({ operator }: ViewProps) {
  const [ingredients, setIngredients] = useState<IngredientDTO[]>([])
  const [movements, setMovements] = useState<StockMovementDTO[]>([])
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([])
  const [loading, setLoading] = useState(true)

  // dialog movimentação
  const [moveTarget, setMoveTarget] = useState<IngredientDTO | null>(null)
  const [moveForm, setMoveForm] = useState<MovementForm>({ type: 'ENTRADA', qty: '', reason: '', unitCost: '' })
  const [moveSaving, setMoveSaving] = useState(false)

  // dialog insumo
  const [ingOpen, setIngOpen] = useState(false)
  const [editingIng, setEditingIng] = useState<IngredientDTO | null>(null)
  const [ingForm, setIngForm] = useState<IngredientForm>({
    name: '',
    unit: 'KG',
    costPerUnit: '',
    stock: '',
    minStock: '',
    supplierId: 'none',
  })
  const [ingSaving, setIngSaving] = useState(false)

  // exclusão
  const [deleteTarget, setDeleteTarget] = useState<IngredientDTO | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ings, movs, sups] = await Promise.all([
        apiGet<IngredientDTO[]>('/api/ingredients'),
        apiGet<StockMovementDTO[]>('/api/stock/movements?limit=80'),
        apiGet<SupplierDTO[]>('/api/suppliers'),
      ])
      setIngredients(ings)
      setMovements(movs)
      setSuppliers(sups)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao carregar estoque')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const summary = useMemo(() => {
    const alertItems = ingredients.filter((i) => i.minStock > 0 && i.stock <= i.minStock)
    const criticalItems = ingredients.filter(
      (i) => i.minStock > 0 && i.stock <= i.minStock * 0.5,
    )
    const totalValue = ingredients.reduce((acc, i) => acc + i.stock * i.costPerUnit, 0)
    return { alert: alertItems.length, critical: criticalItems.length, totalValue }
  }, [ingredients])

  // ---- movimentação ----
  function openMovement(ing: IngredientDTO) {
    setMoveForm({
      type: 'ENTRADA',
      qty: '',
      reason: '',
      unitCost: ing.costPerUnit > 0 ? String(ing.costPerUnit) : '',
    })
    setMoveTarget(ing)
  }

  const moveHint = MOVE_TYPES.find((t) => t.value === moveForm.type)?.hint ?? ''

  async function saveMovement() {
    if (!moveTarget) return
    const qty = parseNum(moveForm.qty)
    const isAjuste = moveForm.type === 'AJUSTE'
    if (isAjuste ? qty < 0 : qty <= 0) {
      toast.error(isAjuste ? 'Informe o saldo final' : 'Quantidade deve ser maior que zero')
      return
    }
    setMoveSaving(true)
    try {
      const unitCost = moveForm.unitCost.trim() === '' ? undefined : round2(parseNum(moveForm.unitCost))
      await apiPost('/api/stock/movements', {
        itemType: 'INGREDIENT',
        ingredientId: moveTarget.id,
        type: moveForm.type,
        qty,
        reason: moveForm.reason.trim() || null,
        ...(unitCost !== undefined ? { unitCost } : {}),
      })
      toast.success('Movimentação registrada')
      setMoveTarget(null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao registrar movimentação')
    } finally {
      setMoveSaving(false)
    }
  }

  // ---- insumo ----
  function openCreateIngredient() {
    setEditingIng(null)
    setIngForm({
      name: '',
      unit: 'KG',
      costPerUnit: '',
      stock: '',
      minStock: '',
      supplierId: 'none',
    })
    setIngOpen(true)
  }

  function openEditIngredient(ing: IngredientDTO) {
    setEditingIng(ing)
    setIngForm({
      name: ing.name,
      unit: ing.unit,
      costPerUnit: String(ing.costPerUnit),
      stock: String(ing.stock),
      minStock: String(ing.minStock),
      supplierId: ing.supplierId ?? 'none',
    })
    setIngOpen(true)
  }

  async function saveIngredient() {
    const name = ingForm.name.trim()
    if (!name) {
      toast.error('Informe o nome do insumo')
      return
    }
    if (parseNum(ingForm.costPerUnit) < 0 || ingForm.costPerUnit.trim() === '') {
      toast.error('Informe o custo por unidade')
      return
    }
    setIngSaving(true)
    try {
      const base = {
        name,
        unit: ingForm.unit,
        costPerUnit: round2(parseNum(ingForm.costPerUnit)),
        minStock: round2(parseNum(ingForm.minStock)),
        supplierId: ingForm.supplierId === 'none' ? null : ingForm.supplierId,
      }
      if (editingIng) {
        await apiPatch<IngredientDTO>(`/api/ingredients/${editingIng.id}`, base)
        toast.success('Insumo atualizado')
      } else {
        await apiPost<IngredientDTO>('/api/ingredients', {
          ...base,
          stock: round2(parseNum(ingForm.stock)),
        })
        toast.success('Insumo criado')
      }
      setIngOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar insumo')
    } finally {
      setIngSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await apiDelete(`/api/ingredients/${deleteTarget.id}`)
      toast.success('Insumo excluído')
      setDeleteTarget(null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir insumo')
    } finally {
      setDeleting(false)
    }
  }

  function progressInfo(ing: IngredientDTO): { value: number; className: string; critical: boolean; alert: boolean } {
    const critical = ing.minStock > 0 && ing.stock <= ing.minStock * 0.5
    const alert = ing.minStock > 0 && ing.stock <= ing.minStock
    const ratio = ing.minStock > 0 ? ing.stock / ing.minStock : 1
    const value = Math.min(100, Math.max(0, Math.round(ratio * 100)))
    let className = ''
    if (critical) className = '[&>div]:bg-destructive'
    else if (alert) className = '[&>div]:bg-amber-500'
    return { value, className, critical, alert }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Package className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Estoque de Insumos</h2>
        </div>
        <Button size="sm" onClick={openCreateIngredient}>
          <Plus />
          Novo insumo
        </Button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Package className="size-3.5 text-primary" />
            Total insumos
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{num(ingredients.length)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <TriangleAlert className="size-3.5 text-amber-500" />
            Itens em alerta
          </p>
          <p className="mt-1 text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">
            {num(summary.alert)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <OctagonAlert className="size-3.5 text-destructive" />
            Críticos
          </p>
          <p className="mt-1 text-2xl font-bold text-destructive tabular-nums">
            {num(summary.critical)}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Coins className="size-3.5 text-primary" />
            Valor em estoque
          </p>
          <p className="mt-1 text-2xl font-bold text-primary tabular-nums">
            {brl(summary.totalValue)}
          </p>
        </div>
      </div>

      {/* Tabela de insumos */}
      <div className="rounded-xl border bg-card">
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : ingredients.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nenhum insumo cadastrado
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead className="min-w-44">Estoque atual</TableHead>
                <TableHead className="text-right">Mínimo</TableHead>
                <TableHead className="text-right">Custo/un.</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {ingredients.map((ing) => {
                const info = progressInfo(ing)
                return (
                  <TableRow key={ing.id} className={info.critical ? 'bg-destructive/5' : undefined}>
                    <TableCell className="font-medium">
                      {ing.name}
                      <span className="ml-1 text-xs text-muted-foreground">({ing.unit})</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {ing.supplierName ?? '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-20 shrink-0 text-sm font-medium tabular-nums ${
                            info.critical
                              ? 'text-destructive'
                              : info.alert
                                ? 'text-amber-600 dark:text-amber-400'
                                : ''
                          }`}
                        >
                          {fmtQty(ing.stock)} {ing.unit}
                        </span>
                        <Progress value={info.value} className={`h-2 w-full ${info.className}`} />
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {fmtQty(ing.minStock)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {brl(ing.costPerUnit)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {brl(ing.stock * ing.costPerUnit)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <EllipsisVertical />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openMovement(ing)}>
                            <ArrowDownUp />
                            Movimentar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEditIngredient(ing)}>
                            <Pencil />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeleteTarget(ing)}
                          >
                            <Trash2 />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Movimentações recentes */}
      <div className="rounded-xl border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <ArrowLeftRight className="size-4 text-primary" />
          Movimentações recentes
          <span className="text-xs font-normal text-muted-foreground">({movements.length})</span>
        </h3>
        <div className="mt-3 max-h-72 overflow-y-auto scrollbar-thin">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : movements.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma movimentação registrada
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((m) => {
                  const badge = movementBadge(m.type)
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                        {dthr(m.createdAt)}
                      </TableCell>
                      <TableCell className="text-xs font-medium">{m.itemName ?? '-'}</TableCell>
                      <TableCell>
                        <Badge variant={badge.variant} className={`text-xs ${badge.className}`}>
                          {badge.label}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={`text-right text-xs font-medium tabular-nums ${
                          m.type === 'ENTRADA' || (m.qty >= 0 && m.type !== 'SAIDA' && m.type !== 'PERDA')
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-destructive'
                        }`}
                      >
                        {signedQtyLabel(m)}
                      </TableCell>
                      <TableCell className="max-w-56 truncate text-xs text-muted-foreground">
                        {m.reason ?? '-'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Dialog movimentação */}
      <Dialog
        open={moveTarget !== null}
        onOpenChange={(open) => !open && setMoveTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowDownUp className="size-5 text-primary" />
              Movimentar estoque
            </DialogTitle>
            <DialogDescription>
              {moveTarget
                ? `${moveTarget.name} · saldo atual ${fmtQty(moveTarget.stock)} ${moveTarget.unit}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          {moveTarget ? (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label>Tipo</Label>
                <Select
                  value={moveForm.type}
                  onValueChange={(v) => setMoveForm((f) => ({ ...f, type: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MOVE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{moveHint}</p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="m-qty">
                  {moveForm.type === 'AJUSTE' ? 'Saldo final' : 'Quantidade'} ({moveTarget.unit})
                </Label>
                <Input
                  id="m-qty"
                  type="number"
                  min={moveForm.type === 'AJUSTE' ? 0 : 0.01}
                  step={0.01}
                  value={moveForm.qty}
                  onChange={(e) => setMoveForm((f) => ({ ...f, qty: e.target.value }))}
                  className="text-right tabular-nums"
                  placeholder="0"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="m-cost">Custo/unidade (R$)</Label>
                <Input
                  id="m-cost"
                  type="number"
                  min={0}
                  step={0.01}
                  value={moveForm.unitCost}
                  onChange={(e) => setMoveForm((f) => ({ ...f, unitCost: e.target.value }))}
                  className="text-right tabular-nums"
                  placeholder="Opcional"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="m-reason">Motivo</Label>
                <Textarea
                  id="m-reason"
                  rows={2}
                  value={moveForm.reason}
                  onChange={(e) => setMoveForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="Ex.: compra, quebra, contagem física..."
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveTarget(null)} disabled={moveSaving}>
              Cancelar
            </Button>
            <Button onClick={() => void saveMovement()} disabled={moveSaving}>
              {moveSaving ? 'Registrando...' : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog insumo */}
      <Dialog open={ingOpen} onOpenChange={setIngOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingIng ? 'Editar insumo' : 'Novo insumo'}</DialogTitle>
            <DialogDescription>
              {editingIng
                ? `Editando ${editingIng.name} · para alterar o saldo use Movimentar`
                : 'Cadastre um insumo de produção'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="i-name">Nome</Label>
                <Input
                  id="i-name"
                  value={ingForm.name}
                  onChange={(e) => setIngForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex.: Farinha de trigo"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Unidade</Label>
                <Select
                  value={ingForm.unit}
                  onValueChange={(v) => setIngForm((f) => ({ ...f, unit: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="i-cost">Custo/unidade (R$)</Label>
                <Input
                  id="i-cost"
                  type="number"
                  min={0}
                  step={0.01}
                  value={ingForm.costPerUnit}
                  onChange={(e) => setIngForm((f) => ({ ...f, costPerUnit: e.target.value }))}
                  className="text-right tabular-nums"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="i-min">Estoque mínimo</Label>
                <Input
                  id="i-min"
                  type="number"
                  min={0}
                  step={0.01}
                  value={ingForm.minStock}
                  onChange={(e) => setIngForm((f) => ({ ...f, minStock: e.target.value }))}
                  className="text-right tabular-nums"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="i-stock">Estoque inicial</Label>
              <Input
                id="i-stock"
                type="number"
                min={0}
                step={0.01}
                value={ingForm.stock}
                onChange={(e) => setIngForm((f) => ({ ...f, stock: e.target.value }))}
                className="text-right tabular-nums"
                disabled={editingIng !== null}
              />
              {editingIng ? (
                <p className="text-xs text-muted-foreground">
                  Use Movimentar para ajustar o saldo atual
                </p>
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <Label>Fornecedor</Label>
              <Select
                value={ingForm.supplierId}
                onValueChange={(v) => setIngForm((f) => ({ ...f, supplierId: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem fornecedor</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIngOpen(false)} disabled={ingSaving}>
              Cancelar
            </Button>
            <Button onClick={() => void saveIngredient()} disabled={ingSaving}>
              {ingSaving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir insumo?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `"${deleteTarget.name}" será removido. Insumos com histórico de movimentações, receitas ou compras não podem ser excluídos.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                void confirmDelete()
              }}
            >
              {deleting ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
