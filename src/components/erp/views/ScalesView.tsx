// BAKERY ERP - Central de Equipamentos: Balanças
// Gerenciador de equipamentos, perfis de etiqueta, PLUs, sincronização,
// exportação de arquivos por fabricante e simulador de pesagem.
'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, PackageCheck, RefreshCw, Scale, Trash2, WifiOff } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api'
import type { ViewProps } from '../view-props'

// ---------------- tipos ----------------

interface ProfileDTO {
  id: string
  name: string
  brand: string
  symbology: string
  payloadType: 'WEIGHT' | 'PRICE'
  prefix: string
  pluDigits: number
  payloadDigits: number
  payloadDecimals: number
  checkDigit: boolean
  description: string | null
  active: boolean
}

interface DeviceDTO {
  id: string
  name: string
  brand: string
  model: string | null
  connectionType: string
  connectionConfig: string | null
  connectionConfigParsed: Record<string, unknown> | null
  profileId: string | null
  profile: ProfileDTO | null
  department: string | null
  status: string
  lastSyncAt: string | null
  lastCommunicationAt: string | null
  lastError: string | null
  homologationStatus: string
  active: boolean
  notes: string | null
}

interface MappingDTO {
  id: string
  deviceId: string
  productId: string
  plu: string
  description: string | null
  lastSentPrice: number | null
  lastSentAt: string | null
  productName: string | null
  currentPrice: number | null
  priceDivergence: boolean
}

interface SyncJobDTO {
  id: string
  deviceId: string
  status: string
  total: number
  ok: number
  failed: number
  detail: string | null
  startedAt: string
  finishedAt: string | null
}

interface ReadingDTO {
  id: string
  deviceId: string | null
  productId: string | null
  plu: string | null
  weight: number
  unitPrice: number
  total: number
  raw: string | null
  source: string
  createdAt: string
}

interface AdapterDTO {
  id: string
  brand: string
  label: string
  homologation: string
  capabilities: { fileExport: boolean; directSend: boolean; realtimeWeight: boolean; labelPrinting: boolean }
  notes: string
}

interface ProductLite {
  id: string
  name: string
  plu: string | null
  saleUnit: string
  price: number
  byWeight: boolean
  isWeighable: boolean
}

interface ScalesPayload {
  devices: DeviceDTO[]
  profiles: ProfileDTO[]
  mappings: MappingDTO[]
  syncJobs: SyncJobDTO[]
  readings: ReadingDTO[]
  products: ProductLite[]
  adapters: AdapterDTO[]
}

interface SimulateResult {
  label: string
  profile: { name: string; payloadType: string }
  device: { name: string }
  product: { name: string; unitPrice: number }
  qty: number
  total: number
  stable: boolean
}

const BRANDS = ['SIMULADOR', 'TOLEDO', 'FILIZOLA', 'URANO', 'BALMAK', 'RAMUZA', 'GENERIC']
const CONNECTIONS = ['SIMULATED', 'ETHERNET', 'SERIAL', 'FILE', 'BRIDGE']

const HOMOLOGATION_BADGE: Record<string, string> = {
  HOMOLOGADO: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  TESTADO: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  EM_DESENVOLVIMENTO: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  PLANEJADO: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400',
  INCOMPATIVEL: 'bg-destructive/15 text-destructive',
}

function fmtDateTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function money(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function ScalesView({ operator }: ViewProps) {
  const [data, setData] = useState<ScalesPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const canManage = operator.isAbsolute || operator.permissions.includes('scales.manage')
  const canSync = operator.isAbsolute || operator.permissions.includes('scales.sync')

  // diálogo de equipamento
  const [deviceOpen, setDeviceOpen] = useState(false)
  const [editingDevice, setEditingDevice] = useState<DeviceDTO | null>(null)
  const [deviceForm, setDeviceForm] = useState({
    name: '',
    brand: 'SIMULADOR',
    model: '',
    connectionType: 'SIMULATED',
    profileId: 'none',
    department: '',
    notes: '',
    ip: '',
    port: '',
    serialPort: '',
    baudRate: '9600',
  })

  // diálogo de PLU
  const [pluOpen, setPluOpen] = useState(false)
  const [pluForm, setPluForm] = useState({ deviceId: '', productId: '', plu: '' })

  // simulador
  const [simDeviceId, setSimDeviceId] = useState('')
  const [simProductId, setSimProductId] = useState('')
  const [simWeight, setSimWeight] = useState('')
  const [simResult, setSimResult] = useState<SimulateResult | null>(null)
  const [simBusy, setSimBusy] = useState(false)

  // teste de etiqueta
  const [testCode, setTestCode] = useState('')
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [testBusy, setTestBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const payload = await apiGet<ScalesPayload>('/api/scales')
      setData(payload)
      setSimDeviceId((current) => current || payload.devices[0]?.id || '')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao carregar balanças')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const weighableProducts = useMemo(
    () => (data?.products ?? []).filter((p) => p.byWeight || p.isWeighable || p.plu),
    [data],
  )

  function openCreateDevice() {
    setEditingDevice(null)
    setDeviceForm({
      name: '',
      brand: 'SIMULADOR',
      model: '',
      connectionType: 'SIMULATED',
      profileId: data?.profiles[0]?.id ?? 'none',
      department: '',
      notes: '',
      ip: '',
      port: '',
      serialPort: '',
      baudRate: '9600',
    })
    setDeviceOpen(true)
  }

  function openEditDevice(device: DeviceDTO) {
    setEditingDevice(device)
    const cfg = device.connectionConfigParsed ?? {}
    setDeviceForm({
      name: device.name,
      brand: device.brand,
      model: device.model ?? '',
      connectionType: device.connectionType,
      profileId: device.profileId ?? 'none',
      department: device.department ?? '',
      notes: device.notes ?? '',
      ip: typeof cfg.ip === 'string' ? cfg.ip : '',
      port: typeof cfg.port === 'string' || typeof cfg.port === 'number' ? String(cfg.port) : '',
      serialPort: typeof cfg.serialPort === 'string' ? cfg.serialPort : '',
      baudRate: typeof cfg.baudRate === 'string' || typeof cfg.baudRate === 'number' ? String(cfg.baudRate) : '9600',
    })
    setDeviceOpen(true)
  }

  async function saveDevice() {
    if (!deviceForm.name.trim()) {
      toast.error('Informe o nome do equipamento')
      return
    }
    setBusy('device')
    try {
      const connectionConfig: Record<string, string> = {}
      if (deviceForm.ip) connectionConfig.ip = deviceForm.ip
      if (deviceForm.port) connectionConfig.port = deviceForm.port
      if (deviceForm.serialPort) connectionConfig.serialPort = deviceForm.serialPort
      if (deviceForm.baudRate) connectionConfig.baudRate = deviceForm.baudRate

      const payload = {
        name: deviceForm.name.trim(),
        brand: deviceForm.brand,
        model: deviceForm.model.trim() || null,
        connectionType: deviceForm.connectionType,
        profileId: deviceForm.profileId === 'none' ? null : deviceForm.profileId,
        department: deviceForm.department.trim() || null,
        notes: deviceForm.notes.trim() || null,
        connectionConfig,
      }
      if (editingDevice) {
        await apiPatch(`/api/scales/devices/${editingDevice.id}`, payload)
        toast.success('Equipamento atualizado')
      } else {
        await apiPost('/api/scales', payload)
        toast.success('Equipamento cadastrado')
      }
      setDeviceOpen(false)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar equipamento')
    } finally {
      setBusy(null)
    }
  }

  async function removeDevice(device: DeviceDTO) {
    setBusy(device.id)
    try {
      await apiDelete(`/api/scales/devices/${device.id}`)
      toast.success('Equipamento removido')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover')
    } finally {
      setBusy(null)
    }
  }

  async function syncDevice(device: DeviceDTO) {
    setBusy(device.id)
    try {
      const result = await apiPost<{ status: string; job: SyncJobDTO }>(`/api/scales/devices/${device.id}/sync`, {})
      if (result.status === 'SUCCESS') toast.success(`Sincronização concluída: ${result.job.ok} produto(s)`)
      else if (result.status === 'PARTIAL') toast.warning(`Parcial: ${result.job.ok} ok, ${result.job.failed} falha(s)`)
      else toast.error('Falha na sincronização')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao sincronizar')
    } finally {
      setBusy(null)
    }
  }

  async function exportDevice(device: DeviceDTO) {
    setBusy(device.id)
    try {
      const res = await fetch(`/api/scales/devices/${device.id}/export`)
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? 'Falha na exportação')
      }
      const content = await res.text()
      const filename = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'produtos.txt'
      const blob = new Blob([content], { type: res.headers.get('Content-Type') ?? 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      toast.success(`Arquivo ${filename} gerado (${content.split('\n').filter(Boolean).length} produtos)`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao exportar')
    } finally {
      setBusy(null)
    }
  }

  async function savePlu() {
    if (!pluForm.deviceId || !pluForm.productId || !pluForm.plu.trim()) {
      toast.error('Selecione equipamento, produto e informe o PLU')
      return
    }
    setBusy('plu')
    try {
      await apiPost('/api/scales/mappings', pluForm)
      toast.success('PLU associado')
      setPluOpen(false)
      setPluForm({ deviceId: '', productId: '', plu: '' })
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao associar PLU')
    } finally {
      setBusy(null)
    }
  }

  async function removeMapping(mapping: MappingDTO) {
    setBusy(mapping.id)
    try {
      await apiDelete(`/api/scales/mappings?id=${mapping.id}`)
      toast.success('Associação removida')
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao remover')
    } finally {
      setBusy(null)
    }
  }

  async function runSimulate() {
    if (!simProductId) {
      toast.error('Selecione um produto pesável')
      return
    }
    setSimBusy(true)
    setSimResult(null)
    try {
      const result = await apiPost<SimulateResult>('/api/scales/simulate', {
        deviceId: simDeviceId || undefined,
        productId: simProductId,
        weight: simWeight.trim() ? Number(simWeight.replace(',', '.')) : undefined,
      })
      setSimResult(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro na simulação')
    } finally {
      setSimBusy(false)
    }
  }

  async function runTestLabel() {
    if (!testCode.trim()) return
    setTestBusy(true)
    setTestResult(null)
    try {
      const result = await apiPost<{
        kind: string
        product?: { name: string }
        qty?: number
        unitPrice?: number
        total?: number
        error?: string
      }>('/api/scales/decode', { code: testCode.trim() })
      if (result.product) {
        setTestResult({
          ok: true,
          message: `Interpretado: ${result.product.name} — ${result.qty} × ${money(result.unitPrice ?? 0)} = ${money(result.total ?? 0)}`,
        })
      } else {
        setTestResult({ ok: false, message: result.error ?? 'Código não interpretado' })
      }
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : 'Código não interpretado' })
    } finally {
      setTestBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Equipamentos - Balanças</h2>
          <p className="text-sm text-muted-foreground">
            Integração com balanças comerciais por adaptadores: perfis de etiqueta, PLUs e sincronização
          </p>
        </div>
        {canManage && (
          <Button onClick={openCreateDevice}>
            <Scale className="size-4" />
            Novo equipamento
          </Button>
        )}
      </div>

      <Alert className="border-amber-500/40 bg-amber-500/5">
        <AlertTriangle className="size-4 text-amber-500" />
        <AlertTitle>Status de homologação dos fabricantes</AlertTitle>
        <AlertDescription>
          O simulador BAKERY SCALE é homologado para testes das regras de negócio. Layouts de arquivo
          Toledo/Filizola/Urano estão em desenvolvimento (requerem equipamento físico para homologação final);
          Balmak e Ramuza seguem planejados. Nenhuma marca é declarada homologada sem teste real.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="devices">
        <TabsList>
          <TabsTrigger value="devices">Equipamentos</TabsTrigger>
          <TabsTrigger value="plus">PLUs e sincronização</TabsTrigger>
          <TabsTrigger value="simulator">Simulador e teste</TabsTrigger>
          <TabsTrigger value="adapters">Adaptadores</TabsTrigger>
        </TabsList>

        {/* ---------- EQUIPAMENTOS ---------- */}
        <TabsContent value="devices" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Equipamentos cadastrados</CardTitle>
              <CardDescription>
                Cada balança tem marca, modelo, conexão e perfil de etiqueta próprios
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Equipamento</TableHead>
                    <TableHead>Marca / Modelo</TableHead>
                    <TableHead>Conexão</TableHead>
                    <TableHead>Perfil de etiqueta</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Última sincronização</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.devices ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                        Nenhum equipamento cadastrado
                      </TableCell>
                    </TableRow>
                  )}
                  {(data?.devices ?? []).map((device) => (
                    <TableRow key={device.id}>
                      <TableCell>
                        <p className="font-medium">{device.name}</p>
                        {device.department && (
                          <p className="text-xs text-muted-foreground">Setor: {device.department}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{device.brand}</Badge>
                        {device.model && <p className="mt-1 text-xs text-muted-foreground">{device.model}</p>}
                      </TableCell>
                      <TableCell className="text-sm">{device.connectionType}</TableCell>
                      <TableCell className="text-sm">{device.profile?.name ?? '—'}</TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1.5 text-sm">
                          {device.status === 'ONLINE' ? (
                            <CheckCircle2 className="size-4 text-emerald-500" />
                          ) : (
                            <WifiOff className="size-4 text-muted-foreground" />
                          )}
                          {device.status}
                        </span>
                        <Badge className={`mt-1 ${HOMOLOGATION_BADGE[device.homologationStatus] ?? ''}`}>
                          {device.homologationStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{fmtDateTime(device.lastSyncAt)}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {canSync && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy === device.id}
                                onClick={() => void syncDevice(device)}
                              >
                                {busy === device.id ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                                Sincronizar
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy === device.id}
                                onClick={() => void exportDevice(device)}
                              >
                                <PackageCheck className="size-4" />
                                Exportar
                              </Button>
                            </>
                          )}
                          {canManage && (
                            <>
                              <Button variant="outline" size="sm" onClick={() => openEditDevice(device)}>
                                Editar
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={busy === device.id}
                                onClick={() => void removeDevice(device)}
                              >
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Últimas leituras de peso</CardTitle>
              <CardDescription>Auditoria de pesagens e etiquetas interpretadas</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead>PLU</TableHead>
                    <TableHead>Peso</TableHead>
                    <TableHead>Preço/kg</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Etiqueta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.readings ?? []).slice(0, 15).map((reading) => (
                    <TableRow key={reading.id}>
                      <TableCell className="text-sm">{fmtDateTime(reading.createdAt)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{reading.source}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">{reading.plu ?? '—'}</TableCell>
                      <TableCell className="tabular-nums">{reading.weight.toFixed(3)} kg</TableCell>
                      <TableCell className="tabular-nums">{money(reading.unitPrice)}</TableCell>
                      <TableCell className="tabular-nums font-medium">{money(reading.total)}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{reading.raw ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                  {(data?.readings ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                        Nenhuma leitura registrada
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- PLUs ---------- */}
        <TabsContent value="plus" className="space-y-4">
          <div className="flex justify-end">
            {canManage && (
              <Button
                variant="outline"
                onClick={() => {
                  setPluForm({ deviceId: data?.devices[0]?.id ?? '', productId: '', plu: '' })
                  setPluOpen(true)
                }}
              >
                <PackageCheck className="size-4" />
                Associar PLU
              </Button>
            )}
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Produtos x PLUs por equipamento</CardTitle>
              <CardDescription>
                Divergência de preço é marcada quando o preço do ERP difere do último enviado à balança
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>PLU</TableHead>
                    <TableHead>Preço ERP</TableHead>
                    <TableHead>Último enviado</TableHead>
                    <TableHead>Enviado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.mappings ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        Nenhum PLU associado
                      </TableCell>
                    </TableRow>
                  )}
                  {(data?.mappings ?? []).map((mapping) => (
                    <TableRow key={mapping.id}>
                      <TableCell>
                        <p className="font-medium">{mapping.productName ?? mapping.productId}</p>
                        {mapping.description && (
                          <p className="text-xs text-muted-foreground">{mapping.description}</p>
                        )}
                      </TableCell>
                      <TableCell className="font-mono">{mapping.plu}</TableCell>
                      <TableCell className="tabular-nums">{money(mapping.currentPrice ?? 0)}</TableCell>
                      <TableCell className="tabular-nums">
                        {mapping.lastSentPrice !== null ? money(mapping.lastSentPrice) : '—'}
                        {mapping.priceDivergence && (
                          <Badge className="ml-2 bg-amber-500/15 text-amber-600 dark:text-amber-400">
                            divergente
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{fmtDateTime(mapping.lastSentAt)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          {canManage && (
                            <Button variant="outline" size="sm" onClick={() => void removeMapping(mapping)}>
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Histórico de sincronizações</CardTitle>
              <CardDescription>Envios de cadastro de produtos aos equipamentos</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Início</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>OK</TableHead>
                    <TableHead>Falhas</TableHead>
                    <TableHead>Detalhe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.syncJobs ?? []).map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="text-sm">{fmtDateTime(job.startedAt)}</TableCell>
                      <TableCell>
                        <Badge
                          className={
                            job.status === 'SUCCESS'
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : job.status === 'PARTIAL'
                                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                : 'bg-destructive/15 text-destructive'
                          }
                        >
                          {job.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">{job.total}</TableCell>
                      <TableCell className="tabular-nums">{job.ok}</TableCell>
                      <TableCell className="tabular-nums">{job.failed}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{job.detail ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                  {(data?.syncJobs ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                        Nenhuma sincronização executada
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- SIMULADOR ---------- */}
        <TabsContent value="simulator" className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Simulador de pesagem</CardTitle>
              <CardDescription>
                Gera etiqueta EAN-13 no perfil do equipamento e registra a leitura — para testar o ciclo
                balança → etiqueta → PDV sem hardware
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-1.5">
                <Label>Equipamento</Label>
                <Select value={simDeviceId} onValueChange={setSimDeviceId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {(data?.devices ?? []).map((device) => (
                      <SelectItem key={device.id} value={device.id}>
                        {device.name} ({device.brand})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Produto pesável</Label>
                <Select value={simProductId} onValueChange={setSimProductId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {weighableProducts.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} — {money(product.price)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="sim-weight">Peso (kg) — vazio gera peso aleatório</Label>
                <Input
                  id="sim-weight"
                  inputMode="decimal"
                  value={simWeight}
                  onChange={(e) => setSimWeight(e.target.value)}
                  placeholder="Ex.: 0,450"
                />
              </div>
              <Button onClick={() => void runSimulate()} disabled={simBusy || !canSync}>
                {simBusy ? <Loader2 className="size-4 animate-spin" /> : <Scale className="size-4" />}
                Pesar e gerar etiqueta
              </Button>

              {simResult && (
                <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
                  <p className="font-mono text-lg font-semibold tracking-wider">{simResult.label}</p>
                  <Separator />
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">Produto</span>
                    <span className="font-medium">{simResult.product.name}</span>
                    <span className="text-muted-foreground">Peso</span>
                    <span className="tabular-nums">{simResult.qty.toFixed(3)} kg</span>
                    <span className="text-muted-foreground">Preço/kg</span>
                    <span className="tabular-nums">{money(simResult.product.unitPrice)}</span>
                    <span className="text-muted-foreground">Total</span>
                    <span className="tabular-nums font-semibold">{money(simResult.total)}</span>
                    <span className="text-muted-foreground">Leitura</span>
                    <span>
                      {simResult.stable ? 'Estável' : 'Instável'} · perfil {simResult.profile.name}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Use este código no PDV (campo de busca) ou no teste ao lado para concluir o ciclo.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Teste do interpretador de etiquetas</CardTitle>
              <CardDescription>
                Cole um código lido pelo leitor e veja como o PDV vai interpretá-lo
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-1.5">
                <Label htmlFor="test-code">Código de barras</Label>
                <Input
                  id="test-code"
                  value={testCode}
                  onChange={(e) => setTestCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="Ex.: 2001234004507"
                  className="font-mono"
                />
              </div>
              <Button variant="outline" onClick={() => void runTestLabel()} disabled={testBusy || !testCode}>
                {testBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                Interpretar
              </Button>
              {testResult && (
                <Alert className={testResult.ok ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-destructive/40 bg-destructive/5'}>
                  {testResult.ok ? (
                    <CheckCircle2 className="size-4 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="size-4 text-destructive" />
                  )}
                  <AlertDescription>{testResult.message}</AlertDescription>
                </Alert>
              )}
              <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Formatos suportados (configuráveis por perfil):</p>
                <p>
                  Peso: <span className="font-mono">2</span> + PLU(5) + peso(5, 3 dec.) + DV — ex.{' '}
                  <span className="font-mono">2001234004507</span>
                </p>
                <p>
                  Preço: <span className="font-mono">22</span> + PLU(5) + valor(5, 2 dec.) + DV — ex.{' '}
                  <span className="font-mono">2200123006705</span>
                </p>
                <p>Dígitos, prefixo, casas decimais e DV são definidos por perfil de etiqueta.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- ADAPTADORES ---------- */}
        <TabsContent value="adapters">
          <Card>
            <CardHeader>
              <CardTitle>Adaptadores de fabricantes (Scale Drivers)</CardTitle>
              <CardDescription>
                Arquitetura extensível: novos fabricantes são adicionados como adaptadores independentes
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {(data?.adapters ?? []).map((adapter) => (
                <div key={adapter.id} className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{adapter.label}</p>
                    <Badge className={HOMOLOGATION_BADGE[adapter.homologation] ?? ''}>
                      {adapter.homologation}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {adapter.capabilities.fileExport && <Badge variant="outline">Arquivo</Badge>}
                    {adapter.capabilities.directSend && <Badge variant="outline">Envio direto</Badge>}
                    {adapter.capabilities.realtimeWeight && <Badge variant="outline">Peso em tempo real</Badge>}
                    {adapter.capabilities.labelPrinting && <Badge variant="outline">Etiqueta</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{adapter.notes}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ---------- diálogo equipamento ---------- */}
      <Dialog open={deviceOpen} onOpenChange={setDeviceOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingDevice ? 'Editar equipamento' : 'Novo equipamento'}</DialogTitle>
            <DialogDescription>
              Cadastro da balança: marca, conexão e perfil de etiqueta para interpretação dos códigos
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label htmlFor="d-name">Nome</Label>
              <Input
                id="d-name"
                value={deviceForm.name}
                onChange={(e) => setDeviceForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ex.: Balança Balcão 1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Fabricante</Label>
                <Select
                  value={deviceForm.brand}
                  onValueChange={(v) => setDeviceForm((f) => ({ ...f, brand: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BRANDS.map((brand) => (
                      <SelectItem key={brand} value={brand}>
                        {brand}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="d-model">Modelo</Label>
                <Input
                  id="d-model"
                  value={deviceForm.model}
                  onChange={(e) => setDeviceForm((f) => ({ ...f, model: e.target.value }))}
                  placeholder="Ex.: Prix 4 Uno"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Conexão</Label>
                <Select
                  value={deviceForm.connectionType}
                  onValueChange={(v) => setDeviceForm((f) => ({ ...f, connectionType: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONNECTIONS.map((connection) => (
                      <SelectItem key={connection} value={connection}>
                        {connection}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Perfil de etiqueta</Label>
                <Select
                  value={deviceForm.profileId}
                  onValueChange={(v) => setDeviceForm((f) => ({ ...f, profileId: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem perfil</SelectItem>
                    {(data?.profiles ?? []).map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="d-dept">Setor de pesagem</Label>
              <Input
                id="d-dept"
                value={deviceForm.department}
                onChange={(e) => setDeviceForm((f) => ({ ...f, department: e.target.value }))}
                placeholder="Ex.: PADARIA"
              />
            </div>
            {deviceForm.connectionType === 'ETHERNET' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="d-ip">IP</Label>
                  <Input
                    id="d-ip"
                    value={deviceForm.ip}
                    onChange={(e) => setDeviceForm((f) => ({ ...f, ip: e.target.value }))}
                    placeholder="192.168.0.10"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="d-port">Porta</Label>
                  <Input
                    id="d-port"
                    value={deviceForm.port}
                    onChange={(e) => setDeviceForm((f) => ({ ...f, port: e.target.value.replace(/\D/g, '') }))}
                    placeholder="4001"
                  />
                </div>
              </div>
            )}
            {deviceForm.connectionType === 'SERIAL' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="d-serial">Porta serial</Label>
                  <Input
                    id="d-serial"
                    value={deviceForm.serialPort}
                    onChange={(e) => setDeviceForm((f) => ({ ...f, serialPort: e.target.value }))}
                    placeholder="COM1 ou /dev/ttyUSB0"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="d-baud">Baud rate</Label>
                  <Input
                    id="d-baud"
                    value={deviceForm.baudRate}
                    onChange={(e) => setDeviceForm((f) => ({ ...f, baudRate: e.target.value.replace(/\D/g, '') }))}
                  />
                </div>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="d-notes">Observações</Label>
              <Textarea
                id="d-notes"
                rows={2}
                value={deviceForm.notes}
                onChange={(e) => setDeviceForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Opcional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeviceOpen(false)} disabled={busy === 'device'}>
              Cancelar
            </Button>
            <Button onClick={() => void saveDevice()} disabled={busy === 'device'}>
              {busy === 'device' ? <Loader2 className="size-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- diálogo PLU ---------- */}
      <Dialog open={pluOpen} onOpenChange={setPluOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Associar PLU ao equipamento</DialogTitle>
            <DialogDescription>
              Código do produto dentro da balança (por equipamento)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label>Equipamento</Label>
              <Select
                value={pluForm.deviceId}
                onValueChange={(v) => setPluForm((f) => ({ ...f, deviceId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(data?.devices ?? []).map((device) => (
                    <SelectItem key={device.id} value={device.id}>
                      {device.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Produto</Label>
              <Select
                value={pluForm.productId}
                onValueChange={(v) => setPluForm((f) => ({ ...f, productId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(data?.products ?? []).map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="plu-code">PLU</Label>
              <Input
                id="plu-code"
                value={pluForm.plu}
                onChange={(e) => setPluForm((f) => ({ ...f, plu: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                placeholder="Ex.: 00123"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPluOpen(false)} disabled={busy === 'plu'}>
              Cancelar
            </Button>
            <Button onClick={() => void savePlu()} disabled={busy === 'plu'}>
              {busy === 'plu' ? <Loader2 className="size-4 animate-spin" /> : null}
              Associar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
