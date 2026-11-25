// BAKERY ERP - Produtos e Catálogo
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Coins,
  EllipsisVertical,
  Package,
  Pencil,
  Percent,
  Plus,
  Search,
  Tag,
  Trash2,
} from 'lucide-react'

import type { ViewProps } from '@/components/erp/view-props'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api'
import { brl, num, pct } from '@/lib/format'
import type { CategoryDTO, ProductDTO } from '@/lib/types'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'

type CategoryRow = CategoryDTO & { productCount?: number }
type ProductDeleteResult = { ok?: boolean; softDeleted?: boolean }
type ProductForm = {
  name: string
  categoryId: string
  price: string
  cost: string
  unit: 'UN' | 'KG'
  barcode: string
  byWeight: boolean
  isKitchen: boolean
  notes: string
}
type CategoryForm = { name: string; emoji: string; imageUrl: string }

const EMPTY_PRODUCT: ProductForm = {
  name: '',
  categoryId: 'none',
  price: '',
  cost: '',
  unit: 'UN',
  barcode: '',
  byWeight: false,
  isKitchen: true,
  notes: '',
}

const PRODUCT_IMAGES = [
  { value: '/products/paes.png', label: 'Pães' },
  { value: '/products/confeitaria.png', label: 'Confeitaria' },
  { value: '/products/doces.png', label: 'Doces' },
  { value: '/products/salgados.png', label: 'Salgados' },
  { value: '/products/lanches.png', label: 'Lanches' },
  { value: '/products/tortas.png', label: 'Tortas' },
  { value: '/products/especiais.png', label: 'Especiais' },
  { value: '/products/cafe.png', label: 'Café' },
]

const round2 = (v: number) => Math.round(v * 100) / 100

function parseNum(value: string): number {
  const n = Number(value.replace(',', '.').trim())
  return Number.isFinite(n) ? n : 0
}

function marginOf(p: ProductDTO): number {
  return p.price > 0 ? ((p.price - p.cost) / p.price) * 100 : 0
}

function marginBadgeClass(margin: number): string {
  if (margin >= 60) return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
  if (margin >= 40) return 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
  return 'bg-destructive/15 text-destructive'
}

export default function ProductsView({ operator }: ViewProps) {
  const [products, setProducts] = useState<ProductDTO[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [loading, setLoading] = useState(true)

  // filtros
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('all')
  const [onlyActive, setOnlyActive] = useState(false)

  // dialog produto
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ProductDTO | null>(null)
  const [form, setForm] = useState<ProductForm>(EMPTY_PRODUCT)
  const [saving, setSaving] = useState(false)

  // exclusão
  const [deleteTarget, setDeleteTarget] = useState<ProductDTO | null>(null)
  const [deleting, setDeleting] = useState(false)

  // dialog categorias
  const [catOpen, setCatOpen] = useState(false)
  const [catForm, setCatForm] = useState<CategoryForm>({ name: '', emoji: '', imageUrl: 'none' })
  const [catSaving, setCatSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [prods, cats] = await Promise.all([
        apiGet<ProductDTO[]>('/api/products'),
        apiGet<CategoryRow[]>('/api/categories'),
      ])
      setProducts(prods)
      setCategories(cats)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao carregar produtos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter((p) => {
      if (onlyActive && !p.active) return false
      if (catFilter !== 'all' && p.categoryId !== catFilter) return false
      if (!q) return true
      return p.name.toLowerCase().includes(q) || (p.barcode ?? '').toLowerCase().includes(q)
    })
  }, [products, search, catFilter, onlyActive])

  const stats = useMemo(() => {
    const count = filtered.length
    const avgPrice = count > 0 ? filtered.reduce((acc, p) => acc + p.price, 0) / count : 0
    const withPrice = filtered.filter((p) => p.price > 0)
    const avgMargin =
      withPrice.length > 0
        ? withPrice.reduce((acc, p) => acc + marginOf(p), 0) / withPrice.length
        : 0
    return { count, avgPrice, avgMargin }
  }, [filtered])

  // ---- produto: criar/editar ----
  function openCreate() {
    setEditing(null)
    setForm(EMPTY_PRODUCT)
    setFormOpen(true)
  }

  function openEdit(p: ProductDTO) {
    setEditing(p)
    setForm({
      name: p.name,
      categoryId: p.categoryId ?? 'none',
      price: String(p.price),
      cost: String(p.cost),
      unit: p.unit === 'KG' ? 'KG' : 'UN',
      barcode: p.barcode ?? '',
      byWeight: p.byWeight,
      isKitchen: p.isKitchen,
      notes: p.notes ?? '',
    })
    setFormOpen(true)
  }

  async function saveProduct() {
    const name = form.name.trim()
    const price = parseNum(form.price)
    if (!name) {
      toast.error('Informe o nome do produto')
      return
    }
    if (price <= 0) {
      toast.error('Preço deve ser maior que zero')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name,
        categoryId: form.categoryId === 'none' ? null : form.categoryId,
        price: round2(price),
        cost: round2(parseNum(form.cost)),
        unit: form.unit,
        barcode: form.barcode.trim() || null,
        byWeight: form.byWeight,
        isKitchen: form.isKitchen,
        notes: form.notes.trim() || null,
      }
      if (editing) {
        await apiPatch<ProductDTO>(`/api/products/${editing.id}`, payload)
        toast.success('Produto atualizado')
      } else {
        await apiPost<ProductDTO>('/api/products', payload)
        toast.success('Produto criado')
      }
      setFormOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar produto')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(p: ProductDTO, active: boolean) {
    try {
      await apiPatch<ProductDTO>(`/api/products/${p.id}`, { active })
      setProducts((prev) => prev.map((item) => (item.id === p.id ? { ...item, active } : item)))
      toast.success(active ? 'Produto ativado' : 'Produto desativado')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar status')
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await apiDelete<ProductDeleteResult>(`/api/products/${deleteTarget.id}`)
      if (res.softDeleted) {
        toast.success('Produto desativado (possui vendas)')
      } else {
        toast.success('Produto excluído')
      }
      setDeleteTarget(null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao excluir produto')
    } finally {
      setDeleting(false)
    }
  }

  // ---- categorias ----
  async function createCategory() {
    const name = catForm.name.trim()
    if (!name) {
      toast.error('Informe o nome da categoria')
      return
    }
    setCatSaving(true)
    try {
      await apiPost<CategoryDTO>('/api/categories', {
        name,
        emoji: catForm.emoji.trim() || null,
        imageUrl: catForm.imageUrl === 'none' ? null : catForm.imageUrl,
      })
      toast.success('Categoria criada')
      setCatForm({ name: '', emoji: '', imageUrl: 'none' })
      const cats = await apiGet<CategoryRow[]>('/api/categories')
      setCategories(cats)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar categoria')
    } finally {
      setCatSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Package className="size-5 text-primary" />
          <h2 className="text-lg font-semibold">Produtos e Catálogo</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCatOpen(true)}>
            <Tag />
            Categorias
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus />
            Novo produto
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou código..."
            className="pl-9"
          />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch id="products-only-active" checked={onlyActive} onCheckedChange={setOnlyActive} />
          <Label htmlFor="products-only-active" className="text-sm text-muted-foreground">
            Somente ativos
          </Label>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Package className="size-3.5 text-primary" />
            Total de produtos
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{num(stats.count)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Coins className="size-3.5 text-primary" />
            Ticket médio dos preços
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{brl(stats.avgPrice)}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Percent className="size-3.5 text-primary" />
            Margem média
          </p>
          <p className="mt-1 text-2xl font-bold text-primary tabular-nums">{pct(stats.avgMargin)}</p>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-xl border bg-card">
        {loading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nenhum produto encontrado
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="text-right">Custo</TableHead>
                <TableHead>Margem</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const margin = marginOf(p)
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {p.name}
                        {p.unit === 'KG' ? <Badge variant="secondary">KG</Badge> : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.categoryName ?? '-'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{brl(p.price)}</TableCell>
                    <TableCell className="text-muted-foreground text-right tabular-nums">
                      {brl(p.cost)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={marginBadgeClass(margin)}>
                        {pct(margin, 0)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {p.barcode ?? '-'}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={p.active}
                        onCheckedChange={(v) => void toggleActive(p, v)}
                        aria-label={`Ativar ${p.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <EllipsisVertical />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(p)}>
                            <Pencil />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeleteTarget(p)}
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

      {/* Dialog criar/editar produto */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar produto' : 'Novo produto'}</DialogTitle>
            <DialogDescription>
              {editing ? `Editando ${editing.name}` : 'Cadastre um item do catálogo'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="p-name">Nome</Label>
              <Input
                id="p-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex.: Pão francês"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Categoria</Label>
                <Select
                  value={form.categoryId}
                  onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem categoria</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Unidade</Label>
                <Select
                  value={form.unit}
                  onValueChange={(v) => setForm((f) => ({ ...f, unit: v === 'KG' ? 'KG' : 'UN' }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UN">UN (unidade)</SelectItem>
                    <SelectItem value="KG">KG (peso)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="p-price">Preço (R$)</Label>
                <Input
                  id="p-price"
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  className="text-right tabular-nums"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="p-cost">Custo (R$)</Label>
                <Input
                  id="p-cost"
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.cost}
                  onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                  className="text-right tabular-nums"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-barcode">Código de barras</Label>
              <Input
                id="p-barcode"
                value={form.barcode}
                onChange={(e) => setForm((f) => ({ ...f, barcode: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Vendido por peso</p>
                <p className="text-xs text-muted-foreground">
                  Quantidade informada em kg no PDV
                </p>
              </div>
              <Switch
                checked={form.byWeight}
                onCheckedChange={(v) => setForm((f) => ({ ...f, byWeight: v }))}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Passa pelo painel de produção</p>
                <p className="text-xs text-muted-foreground">
                  Gera pedido na cozinha quando vendido
                </p>
              </div>
              <Switch
                checked={form.isKitchen}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isKitchen: v }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-notes">Observações</Label>
              <Textarea
                id="p-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder="Opcional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void saveProduct()} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog categorias */}
      <Dialog open={catOpen} onOpenChange={setCatOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="size-5 text-primary" />
              Categorias
            </DialogTitle>
            <DialogDescription>Organização do catálogo e do PDV</DialogDescription>
          </DialogHeader>
          <div className="max-h-56 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
            {categories.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  {c.emoji ? <span>{c.emoji}</span> : null}
                  {c.name}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {num(c.productCount ?? 0)} produto(s)
                </span>
              </div>
            ))}
          </div>
          <Separator />
          <div className="grid gap-3">
            <p className="text-xs font-medium text-muted-foreground">Nova categoria</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="c-name">Nome</Label>
                <Input
                  id="c-name"
                  value={catForm.name}
                  onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ex.: Confeitaria"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="c-emoji">Emoji (opcional)</Label>
                <Input
                  id="c-emoji"
                  value={catForm.emoji}
                  onChange={(e) => setCatForm((f) => ({ ...f, emoji: e.target.value }))}
                  placeholder="Ex.: 🎂"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Imagem (opcional)</Label>
              <Select
                value={catForm.imageUrl}
                onValueChange={(v) => setCatForm((f) => ({ ...f, imageUrl: v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem imagem</SelectItem>
                  {PRODUCT_IMAGES.map((img) => (
                    <SelectItem key={img.value} value={img.value}>
                      {img.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => void createCategory()} disabled={catSaving}>
              {catSaving ? 'Criando...' : 'Criar categoria'}
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
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `"${deleteTarget.name}" será removido do catálogo. Se houver histórico de vendas, ele apenas será desativado.`
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
