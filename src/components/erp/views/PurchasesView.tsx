'use client'

// BAKERY ERP - Compras e Fornecedores
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Ban,
  ClipboardList,
  Eye,
  Pencil,
  Package,
  PackageCheck,
  Plus,
  Save,
  ShoppingCart,
  Trash2,
  Truck,
  X,
} from 'lucide-react'

import type { PurchaseDTO, SupplierDTO, IngredientDTO } from '@/lib/types'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api'
import { brl, dthr, num } from '@/lib/format'
import { ROLE_LABELS } from '@/lib/format'
import type { ViewProps } from '@/components/erp/view-props'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// ============ Helpers visuais ============

function PurchaseStatusBadge({ status }: { status: PurchaseDTO['status'] }) {
  if (status === 'RECEBIDA') {
    return (
      <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
        Recebida
      </Badge>
    )
  }
  if (status === 'CANCELADA') {
    return (
      <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
        Cancelada
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-400">
      Pendente
    </Badge>
  )
}

type DraftItem = {
  ingredientId: string
  name: string
  unit: string
  qty: number
  unitCost: number
}

type SupplierForm = {
  id?: string
  name: string
  contact: string
  phone: string
  email: string
  items: string
  active: boolean
}

const emptySupplier: SupplierForm = { name: '', contact: '', phone: '', email: '', items: '', active: true }

// ============ View ============

export default function PurchasesView({ operator }: ViewProps) {
  const [purchases, setPurchases] = useState<PurchaseDTO[]>([])
  const [suppliers, setSuppliers] = useState<SupplierDTO[]>([])
  const [ingredients, setIngredients] = useState<IngredientDTO[]>([])
  const [loading, setLoading] = useState(true)

  const [tab, setTab] = useState('compras')

  // ---- Nova compra ----
  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [savingPurchase, setSavingPurchase] = useState(false)
  const [supplierId, setSupplierId] = useState('')
  const [notes, setNotes] = useState('')
  const [draftIngredientId, setDraftIngredientId] = useState('')
  const [draftQty, setDraftQty] = useState('1')
  const [draftUnitCost, setDraftUnitCost] = useState('')
  const [items, setItems] = useState<DraftItem[]>([])

  // ---- Detalhes da compra ----
  const [detailPurchase, setDetailPurchase] = useState<PurchaseDTO | null>(null)

  // ---- Ações destrutivas ----
  const [receiveTarget, setReceiveTarget] = useState<PurchaseDTO | null>(null)
  const [cancelTarget, setCancelTarget] = useState<PurchaseDTO | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<SupplierDTO | null>(null)
  const [busyAction, setBusyAction] = useState(false)

  // ---- Fornecedores ----
  const [supplierOpen, setSupplierOpen] = useState(false)
  const [savingSupplier, setSavingSupplier] = useState(false)
  const [supplierForm, setSupplierForm] = useState<SupplierForm>(emptySupplier)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [p, s, i] = await Promise.all([
        apiGet<PurchaseDTO[]>('/api/purchases'),
        apiGet<SupplierDTO[]>('/api/suppliers'),
        apiGet<IngredientDTO[]>('/api/ingredients'),
      ])
      setPurchases(p)
      setSuppliers(s)
      setIngredients(i)
    } catch (err) {
      toast.error('Erro ao carregar compras', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const activeSuppliers = useMemo(() => suppliers.filter((s) => s.active), [suppliers])
  const supplierMap = useMemo(() => new Map(suppliers.map((s) => [s.id, s])), [suppliers])
  const draftIngredient = useMemo(
    () => ingredients.find((i) => i.id === draftIngredientId) ?? null,
    [ingredients, draftIngredientId]
  )
  const itemsTotal = useMemo(() => items.reduce((acc, i) => acc + i.qty * i.unitCost, 0), [items])

  // ---------- Nova compra ----------
  function openPurchaseDialog() {
    setSupplierId('')
    setNotes('')
    setItems([])
    setDraftIngredientId('')
    setDraftQty('1')
    setDraftUnitCost('')
    setPurchaseOpen(true)
  }

  function handlePickIngredient(id: string) {
    setDraftIngredientId(id)
    const ing = ingredients.find((i) => i.id === id)
    if (ing) setDraftUnitCost(String(ing.costPerUnit))
  }

  function addItem() {
    if (!draftIngredient) return
    const qty = Number(draftQty)
    const unitCost = Number(draftUnitCost)
    if (!Number.isFinite(qty) || qty <= 0) {
      toast.error('Quantidade deve ser maior que zero')
      return
    }
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      toast.error('Custo unitário inválido')
      return
    }
    setItems((prev) => [
      ...prev,
      {
        ingredientId: draftIngredient.id,
        name: draftIngredient.name,
        unit: draftIngredient.unit,
        qty,
        unitCost,
      },
    ])
    setDraftIngredientId('')
    setDraftQty('1')
    setDraftUnitCost('')
  }

  async function submitPurchase() {
    if (!supplierId) {
      toast.error('Selecione um fornecedor')
      return
    }
    if (items.length === 0) {
      toast.error('Adicione ao menos um item à compra')
      return
    }
    setSavingPurchase(true)
    try {
      await apiPost<PurchaseDTO>('/api/purchases', {
        supplierId,
        notes: notes.trim() || undefined,
        items: items.map((i) => ({ ingredientId: i.ingredientId, qty: i.qty, unitCost: i.unitCost })),
      })
      toast.success('Compra registrada', { description: `${num(items.length)} item(ns) - total ${brl(itemsTotal)}` })
      setPurchaseOpen(false)
      await loadData()
    } catch (err) {
      toast.error('Erro ao registrar compra', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setSavingPurchase(false)
    }
  }

  async function receivePurchase(purchase: PurchaseDTO) {
    setBusyAction(true)
    try {
      await apiPatch<PurchaseDTO>(`/api/purchases/${purchase.id}`, { action: 'receive' })
      toast.success('Compra recebida', { description: 'Estoque e custo médio atualizados; conta a pagar gerada.' })
      setReceiveTarget(null)
      await loadData()
    } catch (err) {
      toast.error('Erro ao receber compra', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setBusyAction(false)
    }
  }

  async function cancelPurchase(purchase: PurchaseDTO) {
    setBusyAction(true)
    try {
      await apiPatch<PurchaseDTO>(`/api/purchases/${purchase.id}`, { action: 'cancel' })
      toast.success('Compra cancelada')
      setCancelTarget(null)
      await loadData()
    } catch (err) {
      toast.error('Erro ao cancelar compra', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setBusyAction(false)
    }
  }

  // ---------- Fornecedores ----------
  function openSupplierDialog(supplier?: SupplierDTO) {
    setSupplierForm(
      supplier
        ? {
            id: supplier.id,
            name: supplier.name,
            contact: supplier.contact ?? '',
            phone: supplier.phone ?? '',
            email: supplier.email ?? '',
            items: supplier.items ?? '',
            active: supplier.active,
          }
        : { ...emptySupplier }
    )
    setSupplierOpen(true)
  }

  async function submitSupplier() {
    if (!supplierForm.name.trim()) {
      toast.error('Nome do fornecedor é obrigatório')
      return
    }
    setSavingSupplier(true)
    try {
      const body = {
        name: supplierForm.name.trim(),
        contact: supplierForm.contact.trim() || undefined,
        phone: supplierForm.phone.trim() || undefined,
        email: supplierForm.email.trim() || undefined,
        items: supplierForm.items.trim() || undefined,
        active: supplierForm.active,
      }
      if (supplierForm.id) {
        await apiPatch<SupplierDTO>(`/api/suppliers/${supplierForm.id}`, body)
        toast.success('Fornecedor atualizado')
      } else {
        await apiPost<SupplierDTO>('/api/suppliers', body)
        toast.success('Fornecedor cadastrado')
      }
      setSupplierOpen(false)
      await loadData()
    } catch (err) {
      toast.error('Erro ao salvar fornecedor', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setSavingSupplier(false)
    }
  }

  async function deleteSupplier(supplier: SupplierDTO) {
    setBusyAction(true)
    try {
      const res = await apiDelete<{ deleted?: boolean; softDeleted?: boolean }>(`/api/suppliers/${supplier.id}`)
      if (res.softDeleted) {
        toast.info('Fornecedor desativado', {
          description: 'Existem compras vinculadas; o histórico foi preservado.',
        })
      } else {
        toast.success('Fornecedor excluído')
      }
      setDeleteTarget(null)
      await loadData()
    } catch (err) {
      toast.error('Erro ao excluir fornecedor', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setBusyAction(false)
    }
  }

  // ---------- Render ----------
  const pendingCount = purchases.filter((p) => p.status === 'PENDENTE').length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Truck className="size-5 text-primary" />
            Compras
          </h2>
          <p className="text-muted-foreground text-sm">
            Pedidos a fornecedores e cadastro de parceiros · {pendingCount} pendente(s)
          </p>
        </div>
        <Badge variant="secondary" className="gap-1.5">
          <ClipboardList className="size-3" />
          {ROLE_LABELS[operator.role] ?? operator.role}: {operator.name}
        </Badge>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="compras">Compras</TabsTrigger>
          <TabsTrigger value="fornecedores">Fornecedores</TabsTrigger>
        </TabsList>

        {/* ================= COMPRAS ================= */}
        <TabsContent value="compras" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openPurchaseDialog}>
              <Plus className="size-4" />
              Nova compra
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : purchases.length === 0 ? (
            <Card className="rounded-xl border bg-card p-4">
              <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
                <Package className="size-8 text-primary" />
                <p className="font-medium">Nenhuma compra registrada</p>
                <p className="text-muted-foreground text-sm">
                  Registre a primeira compra para abastecer o estoque de insumos.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-xl border bg-card p-4">
              <CardHeader className="px-0 pt-0">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShoppingCart className="size-4 text-primary" />
                  Compras ({purchases.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Fornecedor</TableHead>
                        <TableHead>Itens</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Criada</TableHead>
                        <TableHead>Recebida</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchases.map((purchase) => (
                        <TableRow key={purchase.id}>
                          <TableCell className="font-mono text-xs">{purchase.code}</TableCell>
                          <TableCell className="font-medium">{purchase.supplier}</TableCell>
                          <TableCell className="text-muted-foreground">{purchase.items.length}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{brl(purchase.total)}</TableCell>
                          <TableCell>
                            <PurchaseStatusBadge status={purchase.status} />
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">{dthr(purchase.createdAt)}</TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {purchase.receivedAt ? dthr(purchase.receivedAt) : '-'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                title="Ver itens"
                                onClick={() => setDetailPurchase(purchase)}
                              >
                                <Eye className="size-4" />
                              </Button>
                              {purchase.status === 'PENDENTE' && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                                    onClick={() => setReceiveTarget(purchase)}
                                  >
                                    <PackageCheck className="size-3.5" />
                                    Receber
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    onClick={() => setCancelTarget(purchase)}
                                  >
                                    <Ban className="size-3.5" />
                                    Cancelar
                                  </Button>
                                </>
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
          )}
        </TabsContent>

        {/* ================= FORNECEDORES ================= */}
        <TabsContent value="fornecedores" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => openSupplierDialog()}>
              <Plus className="size-4" />
              Novo fornecedor
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Card className="rounded-xl border bg-card p-4">
              <CardHeader className="px-0 pt-0">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Truck className="size-4 text-primary" />
                  Fornecedores ({suppliers.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Contato</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>E-mail</TableHead>
                        <TableHead>Itens</TableHead>
                        <TableHead>Ativo</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {suppliers.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-muted-foreground py-6 text-center">
                            Nenhum fornecedor cadastrado.
                          </TableCell>
                        </TableRow>
                      )}
                      {suppliers.map((supplier) => (
                        <TableRow key={supplier.id}>
                          <TableCell className="font-medium">{supplier.name}</TableCell>
                          <TableCell>{supplier.contact ?? '-'}</TableCell>
                          <TableCell className="tabular-nums">{supplier.phone ?? '-'}</TableCell>
                          <TableCell>{supplier.email ?? '-'}</TableCell>
                          <TableCell className="text-muted-foreground max-w-48 truncate">{supplier.items ?? '-'}</TableCell>
                          <TableCell>
                            {supplier.active ? (
                              <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                                Ativo
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Inativo</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                title="Editar"
                                onClick={() => openSupplierDialog(supplier)}
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive size-8"
                                title="Excluir"
                                onClick={() => setDeleteTarget(supplier)}
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
        </TabsContent>
      </Tabs>

      {/* ============ Dialog: nova compra ============ */}
      <Dialog open={purchaseOpen} onOpenChange={setPurchaseOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova compra</DialogTitle>
            <DialogDescription>
              Registre o pedido ao fornecedor. Ao receber, o estoque e o custo médio dos insumos serão atualizados.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="purchase-supplier">Fornecedor</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="w-full" id="purchase-supplier">
                  <SelectValue placeholder="Selecione o fornecedor" />
                </SelectTrigger>
                <SelectContent>
                  {activeSuppliers.length === 0 && (
                    <SelectItem value="none" disabled>
                      Nenhum fornecedor ativo
                    </SelectItem>
                  )}
                  {activeSuppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Itens da compra</Label>
              <div className="grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_5rem_7rem_auto]">
                <Select value={draftIngredientId} onValueChange={handlePickIngredient}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Insumo" />
                  </SelectTrigger>
                  <SelectContent>
                    {ingredients.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name} ({i.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  placeholder="Qtd"
                  value={draftQty}
                  onChange={(e) => setDraftQty(e.target.value)}
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Custo un."
                  value={draftUnitCost}
                  onChange={(e) => setDraftUnitCost(e.target.value)}
                />
                <Button type="button" variant="secondary" onClick={addItem} disabled={!draftIngredientId}>
                  <Plus className="size-4" />
                  Adicionar
                </Button>
              </div>

              {items.length > 0 ? (
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Insumo</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Custo un.</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item, idx) => (
                        <TableRow key={`${item.ingredientId}-${idx}`}>
                          <TableCell className="font-medium">
                            {item.name}
                            <span className="text-muted-foreground ml-1 text-xs">({item.unit})</span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{num(item.qty, 2)}</TableCell>
                          <TableCell className="text-right tabular-nums">{brl(item.unitCost)}</TableCell>
                          <TableCell className="text-right tabular-nums">{brl(item.qty * item.unitCost)}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive size-7"
                              onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                            >
                              <X className="size-3.5" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">Nenhum item adicionado ainda.</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="purchase-notes">Observações</Label>
              <Textarea
                id="purchase-notes"
                placeholder="Nº do pedido, condições de pagamento, frete..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
              <span className="text-sm">Total da compra</span>
              <span className="text-primary text-lg font-semibold tabular-nums">{brl(itemsTotal)}</span>
            </div>
          </div>

          <DialogFooter className="items-center sm:justify-between">
            <p className="text-muted-foreground text-xs">Operador: {operator.name}</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPurchaseOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={submitPurchase} disabled={savingPurchase}>
                <Save className="size-4" />
                {savingPurchase ? 'Salvando...' : 'Registrar compra'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ Dialog: detalhes da compra ============ */}
      <Dialog open={!!detailPurchase} onOpenChange={(open) => !open && setDetailPurchase(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-mono">
              {detailPurchase?.code}
              {detailPurchase && <PurchaseStatusBadge status={detailPurchase.status} />}
            </DialogTitle>
            <DialogDescription>
              {detailPurchase?.supplier} · criada em {detailPurchase ? dthr(detailPurchase.createdAt) : ''}
              {detailPurchase?.receivedAt ? ` · recebida em ${dthr(detailPurchase.receivedAt)}` : ''}
            </DialogDescription>
          </DialogHeader>
          {detailPurchase?.notes && (
            <Alert>
              <AlertDescription>{detailPurchase.notes}</AlertDescription>
            </Alert>
          )}
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Insumo</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Custo un.</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailPurchase?.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.name}
                      <span className="text-muted-foreground ml-1 text-xs">({item.unit})</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{num(item.qty, 2)}</TableCell>
                    <TableCell className="text-right tabular-nums">{brl(item.unitCost)}</TableCell>
                    <TableCell className="text-right tabular-nums">{brl(item.qty * item.unitCost)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-4 py-3">
            <span className="text-sm">Total</span>
            <span className="text-primary text-lg font-semibold tabular-nums">{brl(detailPurchase?.total ?? 0)}</span>
          </div>
        </DialogContent>
      </Dialog>

      {/* ============ AlertDialog: receber compra ============ */}
      <AlertDialog open={!!receiveTarget} onOpenChange={(open) => !open && setReceiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Receber compra {receiveTarget?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação atualiza o estoque dos insumos, recalcula o custo médio e gera automaticamente uma conta a
              pagar de {brl(receiveTarget?.total ?? 0)} para {receiveTarget?.supplier}. Não é possível desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyAction}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 text-white hover:bg-emerald-500"
              disabled={busyAction}
              onClick={() => receiveTarget && receivePurchase(receiveTarget)}
            >
              <PackageCheck className="size-4" />
              {busyAction ? 'Recebendo...' : 'Confirmar recebimento'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ============ AlertDialog: cancelar compra ============ */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar compra {cancelTarget?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              A compra será marcada como cancelada e nenhum estoque será movimentado. Esta ação é irreversível.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyAction}>Voltar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" disabled={busyAction} onClick={() => cancelTarget && cancelPurchase(cancelTarget)}>
              <Ban className="size-4" />
              {busyAction ? 'Cancelando...' : 'Cancelar compra'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ============ Dialog: fornecedor criar/editar ============ */}
      <Dialog open={supplierOpen} onOpenChange={setSupplierOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{supplierForm.id ? 'Editar fornecedor' : 'Novo fornecedor'}</DialogTitle>
            <DialogDescription>Dados de contato e tipos de item fornecidos.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="supplier-name">Nome *</Label>
              <Input
                id="supplier-name"
                value={supplierForm.name}
                onChange={(e) => setSupplierForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex.: Moageira Central"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="supplier-contact">Contato</Label>
                <Input
                  id="supplier-contact"
                  value={supplierForm.contact}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, contact: e.target.value }))}
                  placeholder="Pessoa responsável"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="supplier-phone">Telefone</Label>
                <Input
                  id="supplier-phone"
                  value={supplierForm.phone}
                  onChange={(e) => setSupplierForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="(11) 99999-0000"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="supplier-email">E-mail</Label>
              <Input
                id="supplier-email"
                type="email"
                value={supplierForm.email}
                onChange={(e) => setSupplierForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="vendas@fornecedor.com.br"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="supplier-items">Itens fornecidos</Label>
              <Textarea
                id="supplier-items"
                value={supplierForm.items}
                onChange={(e) => setSupplierForm((f) => ({ ...f, items: e.target.value }))}
                placeholder="Farinha, fermento, manteiga..."
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <Label htmlFor="supplier-active" className="text-sm">
                Fornecedor ativo
              </Label>
              <Switch
                id="supplier-active"
                checked={supplierForm.active}
                onCheckedChange={(v) => setSupplierForm((f) => ({ ...f, active: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSupplierOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitSupplier} disabled={savingSupplier}>
              <Save className="size-4" />
              {savingSupplier ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ AlertDialog: excluir fornecedor ============ */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fornecedor {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se houver compras vinculadas, o fornecedor apenas será desativado para preservar o histórico. A ação
              segue após a confirmação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyAction}>Voltar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" disabled={busyAction} onClick={() => deleteTarget && deleteSupplier(deleteTarget)}>
              <Trash2 className="size-4" />
              {busyAction ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
