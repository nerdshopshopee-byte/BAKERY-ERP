'use client'

// BAKERY ERP - Delivery (entregadores, taxas por região e controle de entregas)
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Bike,
  MapPin,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  Truck,
  XCircle,
} from 'lucide-react'

import type { DelivererDTO, DeliveryDTO, DeliveryZoneDTO } from '@/lib/types'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api'
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
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const STATUS_LABELS: Record<string, string> = {
  PENDENTE: 'Pendente',
  EM_ROTA: 'Em rota',
  ENTREGUE: 'Entregue',
  FALHOU: 'Falhou',
}

const STATUS_STYLES: Record<string, string> = {
  PENDENTE: 'border-muted-foreground/40 bg-muted-foreground/10 text-muted-foreground',
  EM_ROTA: 'border-sky-500/40 bg-sky-500/10 text-sky-400',
  ENTREGUE: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  FALHOU: 'border-destructive/40 bg-destructive/10 text-destructive',
}

function numField(v: string): number | null {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : null
}

// ============ View ============

export default function DeliveryView({ operator }: ViewProps) {
  const [loading, setLoading] = useState(true)
  const [deliveries, setDeliveries] = useState<DeliveryDTO[]>([])
  const [deliverers, setDeliverers] = useState<DelivererDTO[]>([])
  const [zones, setZones] = useState<DeliveryZoneDTO[]>([])

  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)

  // Nova entrega
  const [deliveryOpen, setDeliveryOpen] = useState(false)
  const [deliveryForm, setDeliveryForm] = useState({
    customerName: '',
    phone: '',
    address: '',
    zoneId: 'NONE',
    delivererId: 'NONE',
    notes: '',
  })
  const [savingDelivery, setSavingDelivery] = useState(false)

  // Entregador
  const [delivererOpen, setDelivererOpen] = useState(false)
  const [delivererForm, setDelivererForm] = useState({ name: '', phone: '', vehicle: '' })
  const [savingDeliverer, setSavingDeliverer] = useState(false)

  // Zona
  const [zoneOpen, setZoneOpen] = useState(false)
  const [zoneForm, setZoneForm] = useState({ name: '', fee: '' })
  const [savingZone, setSavingZone] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [d, r, z] = await Promise.all([
        apiGet<DeliveryDTO[]>('/api/deliveries'),
        apiGet<DelivererDTO[]>('/api/deliverers'),
        apiGet<DeliveryZoneDTO[]>('/api/delivery-zones'),
      ])
      setDeliveries(d)
      setDeliverers(r)
      setZones(z)
    } catch (err) {
      toast.error('Erro ao carregar dados de delivery', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const stats = useMemo(() => {
    const pending = deliveries.filter((d) => d.status === 'PENDENTE').length
    const route = deliveries.filter((d) => d.status === 'EM_ROTA').length
    const today = new Date().toDateString()
    const deliveredToday = deliveries.filter(
      (d) => d.status === 'ENTREGUE' && d.deliveredAt && new Date(d.deliveredAt).toDateString() === today,
    ).length
    return { pending, route, deliveredToday }
  }, [deliveries])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return deliveries
    return deliveries.filter(
      (d) =>
        d.code.toLowerCase().includes(q) ||
        (d.customerName ?? '').toLowerCase().includes(q) ||
        (d.address ?? '').toLowerCase().includes(q) ||
        (d.zoneName ?? '').toLowerCase().includes(q),
    )
  }, [deliveries, search])

  const activeDeliverers = useMemo(() => deliverers.filter((d) => d.active), [deliverers])
  const activeZones = useMemo(() => zones.filter((z) => z.active), [zones])

  // ---------- Nova entrega ----------
  async function submitDelivery() {
    if (!deliveryForm.customerName.trim()) {
      toast.error('Nome do cliente é obrigatório')
      return
    }
    if (!deliveryForm.address.trim()) {
      toast.error('Endereço de entrega é obrigatório')
      return
    }
    setSavingDelivery(true)
    try {
      const created = await apiPost<DeliveryDTO>('/api/deliveries', {
        customerName: deliveryForm.customerName.trim(),
        phone: deliveryForm.phone.trim() || undefined,
        address: deliveryForm.address.trim(),
        zoneId: deliveryForm.zoneId !== 'NONE' ? deliveryForm.zoneId : undefined,
        delivererId: deliveryForm.delivererId !== 'NONE' ? deliveryForm.delivererId : undefined,
        notes: deliveryForm.notes.trim() || undefined,
      })
      toast.success(`Entrega ${created.code} registrada`, {
        description: `${created.zoneName ? `${created.zoneName} · ` : ''}taxa ${brl(created.fee)}`,
      })
      setDeliveryOpen(false)
      setDeliveryForm({ customerName: '', phone: '', address: '', zoneId: 'NONE', delivererId: 'NONE', notes: '' })
      await load()
    } catch (err) {
      toast.error('Erro ao registrar entrega', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setSavingDelivery(false)
    }
  }

  // ---------- Ações de fluxo ----------
  async function assign(d: DeliveryDTO, delivererId: string) {
    setBusyId(d.id)
    try {
      await apiPatch<DeliveryDTO>(`/api/deliveries/${d.id}`, { action: 'assign', delivererId })
      toast.success('Entregador atribuído', { description: d.code })
      await load()
    } catch (err) {
      toast.error('Erro ao atribuir entregador', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setBusyId(null)
    }
  }

  async function runAction(d: DeliveryDTO, action: 'dispatch' | 'deliver' | 'fail') {
    setBusyId(d.id)
    try {
      const updated = await apiPatch<DeliveryDTO>(`/api/deliveries/${d.id}`, { action })
      toast.success(`Entrega ${d.code} · ${STATUS_LABELS[updated.status]}`)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro na ação')
    } finally {
      setBusyId(null)
    }
  }

  // ---------- Entregadores ----------
  async function submitDeliverer() {
    if (!delivererForm.name.trim()) {
      toast.error('Nome do entregador é obrigatório')
      return
    }
    setSavingDeliverer(true)
    try {
      await apiPost<DelivererDTO>('/api/deliverers', {
        name: delivererForm.name.trim(),
        phone: delivererForm.phone.trim() || undefined,
        vehicle: delivererForm.vehicle.trim() || undefined,
      })
      toast.success('Entregador cadastrado', { description: delivererForm.name })
      setDelivererOpen(false)
      setDelivererForm({ name: '', phone: '', vehicle: '' })
      await load()
    } catch (err) {
      toast.error('Erro ao salvar entregador', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setSavingDeliverer(false)
    }
  }

  async function toggleDeliverer(d: DelivererDTO) {
    try {
      await apiPatch<DelivererDTO>(`/api/deliverers/${d.id}`, { active: !d.active })
      toast.info(!d.active ? `${d.name} ativado` : `${d.name} desativado`)
      await load()
    } catch (err) {
      toast.error('Erro ao atualizar entregador', { description: err instanceof Error ? err.message : undefined })
    }
  }

  // ---------- Zonas ----------
  async function submitZone() {
    if (!zoneForm.name.trim()) {
      toast.error('Nome da região é obrigatório')
      return
    }
    const fee = numField(zoneForm.fee) ?? 0
    setSavingZone(true)
    try {
      await apiPost<DeliveryZoneDTO>('/api/delivery-zones', { name: zoneForm.name.trim(), fee })
      toast.success('Região cadastrada', { description: `${zoneForm.name} · taxa ${brl(fee)}` })
      setZoneOpen(false)
      setZoneForm({ name: '', fee: '' })
      await load()
    } catch (err) {
      toast.error('Erro ao salvar região', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setSavingZone(false)
    }
  }

  async function toggleZone(z: DeliveryZoneDTO) {
    try {
      await apiPatch<DeliveryZoneDTO>(`/api/delivery-zones/${z.id}`, { active: !z.active })
      toast.info(!z.active ? `${z.name} ativada` : `${z.name} desativada`)
      await load()
    } catch (err) {
      toast.error('Erro ao atualizar região', { description: err instanceof Error ? err.message : undefined })
    }
  }

  // ---------- Render ----------
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Truck className="text-primary size-5" />
            Delivery
          </h2>
          <p className="text-muted-foreground text-sm">
            Entregadores, taxas por região e controle de entregas · operador {operator.name}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente, código ou região"
              className="w-60 pl-8"
            />
          </div>
          <Button onClick={() => setDeliveryOpen(true)}>
            <Plus className="size-4" />
            Nova entrega
          </Button>
          <Button variant="outline" onClick={() => void load()} aria-label="Recarregar dados">
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-xl border bg-card p-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Pendentes</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{num(stats.pending)}</p>
            </div>
            <div className="bg-muted-foreground/10 flex size-9 items-center justify-center rounded-lg">
              <MapPin className="text-muted-foreground size-5" />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border bg-card p-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Em rota agora</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-sky-400">{num(stats.route)}</p>
            </div>
            <div className="bg-sky-500/10 flex size-9 items-center justify-center rounded-lg">
              <Bike className="size-5 text-sky-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-xl border bg-card p-4">
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-muted-foreground text-xs uppercase tracking-wide">Entregues hoje</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-emerald-400">{num(stats.deliveredToday)}</p>
            </div>
            <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500/10">
              <PackageCheck className="size-5 text-emerald-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (
        <Tabs defaultValue="deliveries" className="space-y-4">
          <TabsList>
            <TabsTrigger value="deliveries">Entregas</TabsTrigger>
            <TabsTrigger value="deliverers">Entregadores</TabsTrigger>
            <TabsTrigger value="zones">Regiões e taxas</TabsTrigger>
          </TabsList>

          {/* ---------------- ENTREGAS ---------------- */}
          <TabsContent value="deliveries" className="space-y-4">
            <Card className="rounded-xl border bg-card p-4">
              <CardContent className="px-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Endereço</TableHead>
                        <TableHead>Região</TableHead>
                        <TableHead>Entregador</TableHead>
                        <TableHead className="text-right">Taxa</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-muted-foreground py-6 text-center">
                            {search ? 'Nenhuma entrega encontrada para a busca.' : 'Nenhuma entrega registrada ainda.'}
                          </TableCell>
                        </TableRow>
                      )}
                      {filtered.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell>
                            <p className="font-mono text-xs font-medium">{d.code}</p>
                            <p className="text-muted-foreground text-xs">{dthr(d.createdAt)}</p>
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">{d.customerName ?? '-'}</p>
                            <p className="text-muted-foreground text-xs tabular-nums">{d.phone ?? '-'}</p>
                          </TableCell>
                          <TableCell className="text-muted-foreground max-w-44 truncate">{d.address ?? '-'}</TableCell>
                          <TableCell className="text-sm">{d.zoneName ?? '-'}</TableCell>
                          <TableCell>
                            {d.status === 'PENDENTE' ? (
                              <Select
                                value={d.delivererId ?? 'NONE'}
                                onValueChange={(v) => {
                                  if (v !== 'NONE') void assign(d, v)
                                }}
                              >
                                <SelectTrigger className="h-8 w-36 text-xs" aria-label={`Entregador da entrega ${d.code}`}>
                                  <SelectValue placeholder="Atribuir..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="NONE">Atribuir...</SelectItem>
                                  {activeDeliverers.map((r) => (
                                    <SelectItem key={r.id} value={r.id}>
                                      {r.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-sm">{d.delivererName ?? '-'}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{brl(d.fee)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={STATUS_STYLES[d.status] ?? ''}>
                              {STATUS_LABELS[d.status] ?? d.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              {d.status === 'PENDENTE' && d.delivererId && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-8"
                                  disabled={busyId === d.id}
                                  onClick={() => void runAction(d, 'dispatch')}
                                >
                                  Despachar
                                </Button>
                              )}
                              {d.status === 'EM_ROTA' && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-emerald-500/40 h-8 text-emerald-400 hover:bg-emerald-500/10"
                                    disabled={busyId === d.id}
                                    onClick={() => void runAction(d, 'deliver')}
                                  >
                                    Entregue
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive size-8"
                                    title="Marcar falha"
                                    disabled={busyId === d.id}
                                    onClick={() => void runAction(d, 'fail')}
                                  >
                                    <XCircle className="size-4" />
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
          </TabsContent>

          {/* ---------------- ENTREGADORES ---------------- */}
          <TabsContent value="deliverers" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setDelivererOpen(true)}>
                <Plus className="size-4" />
                Novo entregador
              </Button>
            </div>
            <Card className="rounded-xl border bg-card p-4">
              <CardContent className="px-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Telefone</TableHead>
                        <TableHead>Veículo</TableHead>
                        <TableHead>Ativo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deliverers.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-muted-foreground py-6 text-center">
                            Nenhum entregador cadastrado ainda.
                          </TableCell>
                        </TableRow>
                      )}
                      {deliverers.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell className="tabular-nums">{r.phone ?? '-'}</TableCell>
                          <TableCell className="text-sm">{r.vehicle ?? '-'}</TableCell>
                          <TableCell>
                            <Switch checked={r.active} onCheckedChange={() => void toggleDeliverer(r)} aria-label={`Ativar entregador ${r.name}`} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------- REGIÕES ---------------- */}
          <TabsContent value="zones" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setZoneOpen(true)}>
                <Plus className="size-4" />
                Nova região
              </Button>
            </div>
            <Card className="rounded-xl border bg-card p-4">
              <CardContent className="px-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Região</TableHead>
                        <TableHead className="text-right">Taxa de entrega</TableHead>
                        <TableHead>Ativa</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {zones.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={3} className="text-muted-foreground py-6 text-center">
                            Nenhuma região cadastrada ainda.
                          </TableCell>
                        </TableRow>
                      )}
                      {zones.map((z) => (
                        <TableRow key={z.id}>
                          <TableCell className="font-medium">
                            <span className="inline-flex items-center gap-1.5">
                              <MapPin className="text-primary size-4" />
                              {z.name}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{brl(z.fee)}</TableCell>
                          <TableCell>
                            <Switch checked={z.active} onCheckedChange={() => void toggleZone(z)} aria-label={`Ativar região ${z.name}`} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Dialog nova entrega */}
      <Dialog open={deliveryOpen} onOpenChange={setDeliveryOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nova entrega</DialogTitle>
            <DialogDescription>A taxa é aplicada automaticamente conforme a região escolhida.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="delivery-name">Cliente *</Label>
                <Input
                  id="delivery-name"
                  value={deliveryForm.customerName}
                  onChange={(e) => setDeliveryForm((f) => ({ ...f, customerName: e.target.value }))}
                  placeholder="Nome do cliente"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="delivery-phone">Telefone</Label>
                <Input
                  id="delivery-phone"
                  value={deliveryForm.phone}
                  onChange={(e) => setDeliveryForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="(11) 99999-0000"
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="delivery-address">Endereço *</Label>
              <Input
                id="delivery-address"
                value={deliveryForm.address}
                onChange={(e) => setDeliveryForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Rua, número, complemento"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="delivery-zone">Região</Label>
                <Select value={deliveryForm.zoneId} onValueChange={(v) => setDeliveryForm((f) => ({ ...f, zoneId: v }))}>
                  <SelectTrigger id="delivery-zone">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Sem região</SelectItem>
                    {activeZones.map((z) => (
                      <SelectItem key={z.id} value={z.id}>
                        {z.name} ({brl(z.fee)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="delivery-deliverer">Entregador</Label>
                <Select value={deliveryForm.delivererId} onValueChange={(v) => setDeliveryForm((f) => ({ ...f, delivererId: v }))}>
                  <SelectTrigger id="delivery-deliverer">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Definir depois</SelectItem>
                    {activeDeliverers.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="delivery-notes">Observações</Label>
              <Input
                id="delivery-notes"
                value={deliveryForm.notes}
                onChange={(e) => setDeliveryForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Ex.: entregar após 18h, portão azul"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeliveryOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitDelivery} disabled={savingDelivery}>
              <Plus className="size-4" />
              {savingDelivery ? 'Registrando...' : 'Registrar entrega'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog novo entregador */}
      <Dialog open={delivererOpen} onOpenChange={setDelivererOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo entregador</DialogTitle>
            <DialogDescription>Dados básicos do motorista/entregador.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="deliverer-name">Nome *</Label>
              <Input
                id="deliverer-name"
                value={delivererForm.name}
                onChange={(e) => setDelivererForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nome completo"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="deliverer-phone">Telefone</Label>
                <Input
                  id="deliverer-phone"
                  value={delivererForm.phone}
                  onChange={(e) => setDelivererForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="(11) 99999-0000"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="deliverer-vehicle">Veículo</Label>
                <Input
                  id="deliverer-vehicle"
                  value={delivererForm.vehicle}
                  onChange={(e) => setDelivererForm((f) => ({ ...f, vehicle: e.target.value }))}
                  placeholder="Moto / Bicicleta / Carro"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelivererOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitDeliverer} disabled={savingDeliverer}>
              <Plus className="size-4" />
              {savingDeliverer ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog nova região */}
      <Dialog open={zoneOpen} onOpenChange={setZoneOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova região</DialogTitle>
            <DialogDescription>Região ou bairro atendido com a taxa de entrega aplicada às entregas.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="zone-name">Região *</Label>
              <Input
                id="zone-name"
                value={zoneForm.name}
                onChange={(e) => setZoneForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex.: Centro, Jardim Paulista"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="zone-fee">Taxa de entrega (R$)</Label>
              <Input
                id="zone-fee"
                value={zoneForm.fee}
                onChange={(e) => setZoneForm((f) => ({ ...f, fee: e.target.value }))}
                placeholder="0,00"
                inputMode="decimal"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setZoneOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitZone} disabled={savingZone}>
              <Plus className="size-4" />
              {savingZone ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
