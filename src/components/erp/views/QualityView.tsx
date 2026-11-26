'use client'

// BAKERY ERP - Qualidade e Desperdício (registro de perdas com motivo, custo e responsável)
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  PackageX,
  Save,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react'

import type { IngredientDTO, ProductDTO, WasteRecordDTO } from '@/lib/types'
import { apiGet, apiPost } from '@/lib/api'
import { brl, dthr, num } from '@/lib/format'
import type { ViewProps } from '@/components/erp/view-props'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const REASON_LABELS: Record<string, string> = {
  VENCIDO: 'Vencido',
  QUEIMADO: 'Queimado / assado demais',
  ERRO_PRODUCAO: 'Erro de produção',
  DEVOLUCAO: 'Devolução do cliente',
  DANIFICADO: 'Danificado',
  SOBRA: 'Sobra de produção',
  DESCARTE: 'Descarte',
  OUTROS: 'Outros',
}

const REASON_STYLES: Record<string, string> = {
  VENCIDO: 'border-amber-500/40 bg-amber-500/10 text-amber-400',
  QUEIMADO: 'border-destructive/40 bg-destructive/10 text-destructive',
  ERRO_PRODUCAO: 'border-sky-500/40 bg-sky-500/10 text-sky-400',
  DEVOLUCAO: 'border-purple-500/40 bg-purple-500/10 text-purple-400',
  OUTROS: 'border-muted-foreground/40 bg-muted-foreground/10 text-muted-foreground',
}

function numField(v: string): number | null {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

type WasteForm = {
  itemType: 'PRODUCT' | 'INGREDIENT'
  itemId: string
  qty: string
  reason: string
  sector: string
  lot: string
  notes: string
}

const emptyForm: WasteForm = { itemType: 'PRODUCT', itemId: '', qty: '', reason: 'VENCIDO', sector: '', lot: '', notes: '' }

// ============ View ============

export default function QualityView({ operator }: ViewProps) {
  const [loading, setLoading] = useState(true)
  const [records, setRecords] = useState<WasteRecordDTO[]>([])
  const [products, setProducts] = useState<ProductDTO[]>([])
  const [ingredients, setIngredients] = useState<IngredientDTO[]>([])
  const [search, setSearch] = useState('')
  const [reasonFilter, setReasonFilter] = useState<string>('TODOS')

  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<WasteForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [w, p, i] = await Promise.all([
        apiGet<WasteRecordDTO[]>('/api/waste'),
        apiGet<ProductDTO[]>('/api/products'),
        apiGet<IngredientDTO[]>('/api/ingredients'),
      ])
      setRecords(w)
      setProducts(p)
      setIngredients(i)
    } catch (err) {
      toast.error('Erro ao carregar dados de qualidade', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // KPIs dos últimos 30 dias
  const stats = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
    const recent = records.filter((r) => new Date(r.createdAt).getTime() >= cutoff)
    const cost = recent.reduce((acc, r) => acc + r.cost, 0)
    const avg = recent.length > 0 ? cost / recent.length : 0
    const byReason = new Map<string, number>()
    for (const r of recent) byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + r.cost)
    const top = Array.from(byReason.entries()).sort((a, b) => b[1] - a[1])[0]
    return { count: recent.length, cost, avg, topReason: top ? top[0] : null, topCost: top ? top[1] : 0 }
  }, [records])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return records.filter((r) => {
      if (reasonFilter !== 'TODOS' && r.reason !== reasonFilter) return false
      if (!q) return true
      return r.name.toLowerCase().includes(q) || (r.actor ?? '').toLowerCase().includes(q)
    })
  }, [records, search, reasonFilter])

  const formItems = useMemo(() => {
    if (form.itemType === 'PRODUCT') {
      return products.map((p) => ({ id: p.id, name: p.name, unit: p.unit, extra: p.cost }))
    }
    return ingredients
      .filter((i) => i.stock > 0)
      .map((i) => ({ id: i.id, name: i.name, unit: i.unit, extra: i.costPerUnit }))
  }, [form.itemType, products, ingredients])

  const selectedItem = formItems.find((i) => i.id === form.itemId)
  const previewQty = numField(form.qty) ?? 0
  const previewCost = selectedItem ? selectedItem.extra * previewQty : 0

  async function submitForm() {
    if (!form.itemId) {
      toast.error('Selecione o item perdido')
      return
    }
    const qty = numField(form.qty)
    if (qty === null) {
      toast.error('Informe uma quantidade válida maior que zero')
      return
    }
    setSaving(true)
    try {
      const body =
        form.itemType === 'PRODUCT'
          ? { itemType: 'PRODUCT', productId: form.itemId, qty, reason: form.reason, actor: operator.name, sector: form.sector.trim() || undefined, lot: form.lot.trim() || undefined, notes: form.notes.trim() || undefined }
          : { itemType: 'INGREDIENT', ingredientId: form.itemId, qty, reason: form.reason, actor: operator.name, sector: form.sector.trim() || undefined, lot: form.lot.trim() || undefined, notes: form.notes.trim() || undefined }
      const created = await apiPost<WasteRecordDTO>('/api/waste', body)
      toast.success('Perda registrada', {
        description: `${created.name} · ${num(created.qty, 2)} ${created.unit ?? ''} · ${brl(created.cost)} em custo`,
      })
      setFormOpen(false)
      setForm(emptyForm)
      await load()
    } catch (err) {
      toast.error('Erro ao registrar perda', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  // ---------- Render ----------
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ShieldCheck className="text-primary size-5" />
            Qualidade e Desperdício
          </h2>
          <p className="text-muted-foreground text-sm">
            Descartes, motivos e custo das perdas · operador {operator.name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar item ou responsável"
              className="w-56 pl-8"
            />
          </div>
          <Button
            onClick={() => {
              setForm(emptyForm)
              setFormOpen(true)
            }}
          >
            <PackageX className="size-4" />
            Registrar perda
          </Button>
        </div>
      </div>

      {/* Resumo últimos 30 dias */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="rounded-xl border bg-card p-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Perdas em 30 dias</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{num(stats.count)}</p>
            </div>
            <div className="bg-muted-foreground/10 flex size-9 items-center justify-center rounded-lg">
              <PackageX className="text-muted-foreground size-5" />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border bg-card p-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Custo total do desperdício</p>
              <p className={`mt-1 text-2xl font-semibold tabular-nums ${stats.cost > 0 ? 'text-destructive' : ''}`}>
                {brl(stats.cost)}
              </p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-lg bg-destructive/10">
              <AlertTriangle className="size-5 text-destructive" />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border bg-card p-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Custo médio por perda</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{brl(stats.avg)}</p>
            </div>
            <div className="bg-primary/10 flex size-9 items-center justify-center rounded-lg">
              <ShieldCheck className="text-primary size-5" />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border bg-card p-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Principal motivo</p>
              {stats.topReason ? (
                <>
                  <p className="mt-1 text-lg font-semibold">{REASON_LABELS[stats.topReason] ?? stats.topReason}</p>
                  <p className="text-destructive text-xs tabular-nums">{brl(stats.topCost)}</p>
                </>
              ) : (
                <p className="text-muted-foreground mt-1 text-lg font-semibold">Sem perdas</p>
              )}
            </div>
            <div className="bg-amber-500/10 flex size-9 items-center justify-center rounded-lg">
              <AlertTriangle className="size-5 text-amber-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtro por motivo */}
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">Motivo:</span>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setReasonFilter('TODOS')}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              reasonFilter === 'TODOS'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            Todos
          </button>
          {Object.entries(REASON_LABELS).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setReasonFilter(value)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                reasonFilter === value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <Card className="rounded-xl border bg-card p-4">
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead>Motivo</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Observações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-muted-foreground py-6 text-center">
                        {search || reasonFilter !== 'TODOS'
                          ? 'Nenhum registro encontrado para os filtros.'
                          : 'Nenhuma perda registrada. Ótimo sinal!'}
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-muted-foreground text-xs tabular-nums">{dthr(r.createdAt)}</TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {r.itemType === 'PRODUCT' ? 'Produto' : 'Insumo'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {num(r.qty, 2)} <span className="text-muted-foreground text-xs">{r.unit ?? ''}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={REASON_STYLES[r.reason] ?? ''}>
                          {REASON_LABELS[r.reason] ?? r.reason}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-destructive text-right font-medium tabular-nums">{brl(r.cost)}</TableCell>
                      <TableCell className="text-sm">{r.actor ?? '-'}</TableCell>
                      <TableCell className="text-muted-foreground max-w-40 truncate">{r.notes ?? '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog registrar perda */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar perda</DialogTitle>
            <DialogDescription>
              O custo é calculado pelo valor do item e o estoque do insumo é dado como baixo automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="waste-type">Tipo de item</Label>
              <Select
                value={form.itemType}
                onValueChange={(v) => {
                  setForm((f) => ({ ...f, itemType: v as WasteForm['itemType'], itemId: '' }))
                }}
              >
                <SelectTrigger id="waste-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRODUCT">Produto acabado</SelectItem>
                  <SelectItem value="INGREDIENT">Insumo / matéria-prima</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="waste-item">Item *</Label>
              <Select value={form.itemId} onValueChange={(v) => setForm((f) => ({ ...f, itemId: v }))}>
                <SelectTrigger id="waste-item">
                  <SelectValue placeholder="Selecione o item" />
                </SelectTrigger>
                <SelectContent>
                  {formItems.length === 0 && (
                    <SelectItem value="EMPTY" disabled>
                      Nenhum item disponível
                    </SelectItem>
                  )}
                  {formItems.map((i) => (
                    <SelectItem key={i.id} value={i.id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="waste-qty">Quantidade *</Label>
                <Input
                  id="waste-qty"
                  value={form.qty}
                  onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))}
                  placeholder="Ex.: 3"
                  inputMode="decimal"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="waste-reason">Motivo *</Label>
                <Select value={form.reason} onValueChange={(v) => setForm((f) => ({ ...f, reason: v }))}>
                  <SelectTrigger id="waste-reason">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(REASON_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-2">
                <Label htmlFor="waste-sector">Setor</Label>
                <Input
                  id="waste-sector"
                  value={form.sector}
                  onChange={(e) => setForm((f) => ({ ...f, sector: e.target.value }))}
                  placeholder="Ex.: Padaria"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="waste-lot">Lote</Label>
                <Input
                  id="waste-lot"
                  value={form.lot}
                  onChange={(e) => setForm((f) => ({ ...f, lot: e.target.value }))}
                  placeholder="Ex.: L2026-0428"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="waste-notes">Observações</Label>
              <Textarea
                id="waste-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Detalhe o que ocorreu para análise do desperdício..."
              />
            </div>
            {selectedItem && previewQty > 0 && (
              <p className="text-muted-foreground text-sm">
                Custo estimado da perda: <span className="text-destructive font-medium tabular-nums">{brl(previewCost)}</span>
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitForm} disabled={saving}>
              <Save className="size-4" />
              {saving ? 'Registrando...' : 'Registrar perda'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
