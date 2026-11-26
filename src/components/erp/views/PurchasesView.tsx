'use client'

// BAKERY ERP - Compras e Fornecedores
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Ban,
  ClipboardList,
  Eye,
  FileUp,
  Loader2,
  Pencil,
  Percent,
  Package,
  PackageCheck,
  Plus,
  Save,
  ShoppingCart,
  Trash2,
  Truck,
  X,
} from 'lucide-react'

import type { PurchaseDTO, SupplierDTO, IngredientDTO, ProductDTO } from '@/lib/types'
import type { NfeDraftHeader, NfeDraftItem } from '@/lib/nfe-import'
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

  // ---- Importação de NF-e (XML) ----
  type XmlTargetType = 'NEW_INGREDIENT' | 'EXISTING_INGREDIENT' | 'NEW_PRODUCT' | 'EXISTING_PRODUCT' | 'SKIP'
  type XmlMappingRow = NfeDraftItem & { targetType: XmlTargetType; targetId: string; newName: string }
  const [importOpen, setImportOpen] = useState(false)
  const [importParsing, setImportParsing] = useState(false)
  const [importConfirming, setImportConfirming] = useState(false)
  const [xmlFilename, setXmlFilename] = useState('')
  const [xmlSource, setXmlSource] = useState('')
  const [xmlHeader, setXmlHeader] = useState<NfeDraftHeader | null>(null)
  const [xmlRows, setXmlRows] = useState<XmlMappingRow[]>([])
  const [xmlProducts, setXmlProducts] = useState<ProductDTO[]>([])
  const [importSupplierChoice, setImportSupplierChoice] = useState('') // '' = emitente da nota
  const [applyMargin, setApplyMargin] = useState(false)
  const [marginPct, setMarginPct] = useState('')
  const [createPayable, setCreatePayable] = useState(true)

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

  // ---------- Importação de NF-e (XML) ----------
  function openImportDialog() {
    setXmlFilename('')
    setXmlSource('')
    setXmlHeader(null)
    setXmlRows([])
    setApplyMargin(false)
    setMarginPct('')
    setCreatePayable(true)
    setImportSupplierChoice('__issuer__')
    setImportOpen(true)
  }

  async function handleXmlFile(file: File) {
    if (!/\.xml$/i.test(file.name)) {
      toast.error('Selecione um arquivo .xml de NF-e')
      return
    }
    setImportParsing(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/purchases/import-xml', { method: 'POST', body })
      const data = (await res.json().catch(() => null)) as
        | { filename: string; draft: { header: NfeDraftHeader; items: NfeDraftItem[] } }
        | { error: string }
        | null
      if (!res.ok || !data || 'error' in data) {
        throw new Error('error' in (data ?? {}) ? data!.error : `Falha ao processar o XML (${res.status})`)
      }
      const [text, prods] = await Promise.all([file.text(), apiGet<ProductDTO[]>('/api/products?limit=500')])
      setXmlSource(text)
      setXmlFilename(data.filename)
      setXmlHeader(data.draft.header)
      setXmlProducts(prods)
      setXmlRows(
        data.draft.items.map((item) => ({
          ...item,
          targetType: 'NEW_INGREDIENT' as XmlTargetType,
          targetId: '',
          newName: item.name,
        })),
      )
      toast.success(`NF-e ${data.draft.header.number} lida`, {
        description: `${data.draft.items.length} item(ns) prontos para incorporação ao estoque`,
      })
    } catch (err) {
      toast.error('Falha ao ler a NF-e', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setImportParsing(false)
    }
  }

  function updateXmlRow(index: number, patch: Partial<XmlMappingRow>) {
    setXmlRows((rows) => rows.map((r) => (r.index === index ? { ...r, ...patch } : r)))
  }

  const xmlTotal = useMemo(
    () => xmlRows.filter((r) => r.targetType !== 'SKIP').reduce((acc, r) => acc + r.qty * r.unitCost, 0),
    [xmlRows],
  )

  async function confirmXmlImport() {
    if (!xmlHeader || xmlRows.length === 0) return
    const margin = applyMargin ? Number(marginPct.replace(',', '.')) : null
    if (applyMargin && (!Number.isFinite(margin!) || margin! < 0 || margin! > 500)) {
      toast.error('Informe uma margem de lucro válida (0 a 500%)')
      return
    }
    setImportConfirming(true)
    try {
      const items = xmlRows.map((r) => ({
        index: r.index,
        targetType:
          r.targetType === 'SKIP'
            ? 'SKIP'
            : r.targetType === 'NEW_INGREDIENT'
              ? 'INGREDIENT'
              : r.targetType === 'EXISTING_INGREDIENT'
                ? 'INGREDIENT'
                : 'PRODUCT',
        targetId:
          r.targetType === 'EXISTING_INGREDIENT' || r.targetType === 'EXISTING_PRODUCT' ? r.targetId : null,
        newName: r.targetType === 'NEW_INGREDIENT' || r.targetType === 'NEW_PRODUCT' ? r.newName : undefined,
        newUnit: r.targetType === 'NEW_INGREDIENT' || r.targetType === 'NEW_PRODUCT' ? r.unit : undefined,
        qty: r.qty,
        unitCost: r.unitCost,
      }))
      const result = await apiPost<{ code: string; incorporated: number; ingredientsCreated: number; ingredientsUpdated: number; productsCreated: number; productsUpdated: number; pricesApplied: number; total: number }>(
        '/api/purchases/import-xml/confirm',
        {
          header: xmlHeader,
          sourceXml: xmlSource,
          items,
          applyMargin,
          marginPct: margin,
          supplierId: importSupplierChoice && importSupplierChoice !== '__issuer__' ? importSupplierChoice : undefined,
          newSupplierName:
            !importSupplierChoice || importSupplierChoice === '__issuer__'
              ? xmlHeader.issuerName || undefined
              : undefined,
          createPayable,
        },
      )
      toast.success(`Importação concluída: compra ${result.code}`, {
        description: `${result.incorporated} item(ns) incorporados ao estoque · ${brl(result.total)}${
          result.pricesApplied > 0 ? ` · margem aplicada em ${result.pricesApplied} produto(s)` : ''
        }${result.payableCreated ? ' · conta a pagar gerada' : ''}`,
      })
      setImportOpen(false)
      await loadData()
    } catch (err) {
      toast.error('Erro na importação', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setImportConfirming(false)
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
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={openImportDialog}>
              <FileUp className="size-4" />
              Importar NF-e (XML)
            </Button>
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

      {/* ============ Dialog: importar NF-e (XML) ============ */}
      <Dialog open={importOpen} onOpenChange={(open) => !open && setImportOpen(false)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="size-5 text-primary" />
              Importar NF-e (XML) — entrada de mercadoria
            </DialogTitle>
            <DialogDescription>
              As mercadorias da nota serão incorporadas automaticamente ao estoque. A margem de lucro é opcional.
            </DialogDescription>
          </DialogHeader>

          {!xmlHeader ? (
            /* ---------- Etapa 1: envio do arquivo ---------- */
            <label className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors hover:bg-accent/40">
              {importParsing ? (
                <Loader2 className="size-8 animate-spin text-primary" />
              ) : (
                <FileUp className="size-8 text-primary" />
              )}
              <div>
                <p className="font-medium">{importParsing ? 'Lendo a nota fiscal...' : 'Selecione o XML da NF-e'}</p>
                <p className="text-muted-foreground text-sm">
                  Arquivos .xml (procNFe/NFe) até 10 MB · clique para escolher
                </p>
              </div>
              <input
                type="file"
                accept=".xml"
                className="sr-only"
                disabled={importParsing}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleXmlFile(file)
                }}
              />
            </label>
          ) : (
            /* ---------- Etapa 2: revisão, mapeamento e margem ---------- */
            <div className="space-y-4">
              {/* Cabeçalho da nota */}
              <div className="grid gap-2 rounded-lg border bg-muted/30 p-3 text-sm sm:grid-cols-4">
                <div>
                  <p className="text-muted-foreground text-xs">Número / série</p>
                  <p className="font-medium font-mono">
                    {xmlHeader.number || '—'} / {xmlHeader.series || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Emitente</p>
                  <p className="truncate font-medium">{xmlHeader.issuerName || '—'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Data de emissão</p>
                  <p className="font-medium">
                    {xmlHeader.issuedAt ? dthr(xmlHeader.issuedAt) : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Total da nota</p>
                  <p className="font-medium tabular-nums">{brl(xmlHeader.total)}</p>
                </div>
                <p className="text-muted-foreground text-xs sm:col-span-4">Arquivo: {xmlFilename}</p>
              </div>

              {/* Fornecedor */}
              <div className="grid gap-2 sm:max-w-md">
                <Label>Fornecedor</Label>
                <Select value={importSupplierChoice} onValueChange={setImportSupplierChoice}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={xmlHeader.issuerName ? `Emitente da nota: ${xmlHeader.issuerName}` : 'Selecione ou use o emitente'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__issuer__">
                      {xmlHeader.issuerName ? `Emitente da nota (${xmlHeader.issuerName})` : 'Criar a partir do emitente da nota'}
                    </SelectItem>
                    {activeSuppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tabela de itens com mapeamento */}
              <div className="rounded-lg border">
                <div className="max-h-80 overflow-y-auto scrollbar-thin">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Item da nota</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Custo un.</TableHead>
                        <TableHead>Destino no ERP</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {xmlRows.map((row) => (
                        <TableRow key={row.index}>
                          <TableCell className="text-xs tabular-nums">{row.index}</TableCell>
                          <TableCell>
                            <p className="max-w-56 truncate font-medium" title={row.name}>{row.name}</p>
                            <p className="text-muted-foreground text-xs">
                              {row.code} · {row.unit} · NCM {row.ncm || '—'}
                            </p>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{num(row.qty, 3)}</TableCell>
                          <TableCell className="text-right tabular-nums">{brl(row.unitCost)}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1.5">
                              <Select
                                value={row.targetType}
                                onValueChange={(v) => updateXmlRow(row.index, { targetType: v as XmlMappingRow['targetType'] })}
                              >
                                <SelectTrigger className="w-full min-w-44">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="NEW_INGREDIENT">Novo insumo</SelectItem>
                                  <SelectItem value="EXISTING_INGREDIENT">Insumo existente...</SelectItem>
                                  <SelectItem value="NEW_PRODUCT">Novo produto (revenda)</SelectItem>
                                  <SelectItem value="EXISTING_PRODUCT">Produto existente...</SelectItem>
                                  <SelectItem value="SKIP">Ignorar este item</SelectItem>
                                </SelectContent>
                              </Select>
                              {row.targetType === 'EXISTING_INGREDIENT' ? (
                                <Select value={row.targetId} onValueChange={(v) => updateXmlRow(row.index, { targetId: v })}>
                                  <SelectTrigger className="w-full min-w-44">
                                    <SelectValue placeholder="Escolha o insumo" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {ingredients.map((i) => (
                                      <SelectItem key={i.id} value={i.id}>
                                        {i.name} ({i.unit})
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : null}
                              {row.targetType === 'EXISTING_PRODUCT' ? (
                                <Select value={row.targetId} onValueChange={(v) => updateXmlRow(row.index, { targetId: v })}>
                                  <SelectTrigger className="w-full min-w-44">
                                    <SelectValue placeholder="Escolha o produto" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {xmlProducts.map((p) => (
                                      <SelectItem key={p.id} value={p.id}>
                                        {p.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : null}
                              {row.targetType === 'NEW_INGREDIENT' || row.targetType === 'NEW_PRODUCT' ? (
                                <Input
                                  value={row.newName}
                                  onChange={(e) => updateXmlRow(row.index, { newName: e.target.value })}
                                  placeholder="Nome do novo item"
                                  className="h-8"
                                />
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Margem de lucro (regra OPCIONAL) */}
              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-start gap-2">
                    <Percent className="mt-0.5 size-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Aplicar margem de lucro aos preços de venda</p>
                      <p className="text-muted-foreground text-xs">
                        Regra opcional — os produtos desta nota (novos ou existentes) terão o preço calculado
                        como custo × (1 + margem). Se desativada, nenhum preço de venda é alterado.
                      </p>
                    </div>
                  </div>
                  <Switch checked={applyMargin} onCheckedChange={setApplyMargin} aria-label="Aplicar margem de lucro" />
                </div>
                {applyMargin ? (
                  <div className="grid items-center gap-3 sm:grid-cols-[8rem_1fr]">
                    <div className="space-y-1.5">
                      <Label htmlFor="xml-margin">Margem (%)</Label>
                      <Input
                        id="xml-margin"
                        type="number"
                        min={0}
                        max={500}
                        step={0.5}
                        value={marginPct}
                        onChange={(e) => setMarginPct(e.target.value)}
                        placeholder="Ex.: 40"
                      />
                    </div>
                    <p className="text-muted-foreground text-xs">
                      Ex.: item com custo de {brl(10)} e margem de {marginPct || 40}% → preço de venda{' '}
                      <span className="font-semibold text-foreground tabular-nums">
                        {brl(10 * (1 + (Number(marginPct.replace(',', '.')) || 0) / 100))}
                      </span>
                    </p>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">Gerar conta a pagar ({brl(xmlTotal)})</p>
                    <p className="text-muted-foreground text-xs">Vence em 14 dias no módulo Financeiro</p>
                  </div>
                  <Switch checked={createPayable} onCheckedChange={setCreatePayable} aria-label="Gerar conta a pagar" />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            {xmlHeader ? (
              <>
                <Button variant="outline" onClick={() => setXmlHeader(null)} disabled={importConfirming}>
                  Trocar arquivo
                </Button>
                <Button
                  onClick={confirmXmlImport}
                  disabled={importConfirming || xmlRows.every((r) => r.targetType === 'SKIP') || (applyMargin && marginPct === '') || (xmlRows.some((r) => (r.targetType === 'EXISTING_INGREDIENT' || r.targetType === 'EXISTING_PRODUCT') && !r.targetId))}
                >
                  {importConfirming ? <Loader2 className="size-4 animate-spin" /> : <PackageCheck className="size-4" />}
                  {importConfirming ? 'Incorporando...' : 'Incorporar ao estoque'}
                </Button>
              </>
            ) : null}
            <Button variant="ghost" onClick={() => setImportOpen(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
