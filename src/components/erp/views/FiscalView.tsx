'use client'

// BAKERY ERP - Motor Fiscal: documentos NFC-e/NF-e, configuração do emissor,
// tabelas tributárias versionadas (IBS/CBS), contingência e histórico de eventos.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  BadgeCheck,
  Ban,
  Building2,
  CalendarClock,
  Copy,
  FileText,
  Flame,
  Hash,
  Landmark,
  Loader2,
  Printer,
  RefreshCw,
  ScrollText,
  ShieldCheck,
  ShieldAlert,
  Send,
  Table2,
  XCircle,
} from 'lucide-react'

import type {
  DanfeMetaDTO,
  FiscalConfigDTO,
  FiscalDocumentDTO,
  FiscalDocumentDetailDTO,
  FiscalEventDTO,
  TaxTableDTO,
} from '@/lib/types'
import { apiGet, apiPatch, apiPost } from '@/lib/api'
import { brl, dthr } from '@/lib/format'
import type { ViewProps } from '@/components/erp/view-props'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

// ============ Helpers visuais ============

const STATUS_META: Record<string, { label: string; className: string }> = {
  TRANSMITIDA: { label: 'Autorizada', className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' },
  REJEITADA: { label: 'Rejeitada', className: 'border-red-500/40 bg-red-500/10 text-red-400' },
  CONTINGENCIA: { label: 'Contingência', className: 'border-amber-500/40 bg-amber-500/10 text-amber-400' },
  PENDENTE: { label: 'Pendente', className: 'border-amber-500/40 bg-amber-500/10 text-amber-400' },
  CANCELADA: { label: 'Cancelada', className: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-400' },
  INUTILIZADA: { label: 'Inutilizada', className: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-400' },
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, className: '' }
  return (
    <Badge variant="outline" className={meta.className}>
      {meta.label}
    </Badge>
  )
}

function TypeBadge({ type }: { type: string }) {
  return (
    <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
      {type === 'NFCE' ? 'NFC-e 65' : 'NF-e 55'}
    </Badge>
  )
}

const EVENT_META: Record<string, { label: string; className: string }> = {
  EMISSAO: { label: 'Emissão', className: 'text-primary' },
  AUTORIZACAO: { label: 'Autorização', className: 'text-emerald-400' },
  REJEICAO: { label: 'Rejeição', className: 'text-red-400' },
  REENVIO: { label: 'Reenvio', className: 'text-amber-400' },
  CANCELAMENTO: { label: 'Cancelamento', className: 'text-zinc-400' },
  INUTILIZACAO: { label: 'Inutilização', className: 'text-zinc-400' },
  CONTINGENCIA_ON: { label: 'Contingência ON', className: 'text-amber-400' },
  CONTINGENCIA_OFF: { label: 'Contingência OFF', className: 'text-emerald-400' },
}

async function copyText(text: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${label} copiado`)
  } catch {
    toast.error('Não foi possível copiar')
  }
}

function formatKey(key: string): string {
  return key.replace(/(.{4})(?=.)/g, '$1 ')
}

const CERT_META: Record<string, { label: string; className: string }> = {
  VALID: { label: 'Válido', className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' },
  EXPIRING: { label: 'Vence em breve', className: 'border-amber-500/40 bg-amber-500/10 text-amber-400' },
  EXPIRED: { label: 'Expirado', className: 'border-red-500/40 bg-red-500/10 text-red-400' },
  MISSING: { label: 'Não configurado', className: 'border-red-500/40 bg-red-500/10 text-red-400' },
}

// ============ View ============

export default function FiscalView({ operator }: ViewProps) {
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<FiscalConfigDTO | null>(null)
  const [documents, setDocuments] = useState<FiscalDocumentDTO[]>([])
  const [summary, setSummary] = useState<{ status: string; count: number }[]>([])
  const [events, setEvents] = useState<FiscalEventDTO[]>([])
  const [taxRows, setTaxRows] = useState<TaxTableDTO[]>([])
  const [taxVersion, setTaxVersion] = useState('2026.1')

  const can = (perm: string) => operator.isAbsolute || operator.permissions.includes(perm)

  // Diálogo de documento (XML + DANFE)
  const [docDetail, setDocDetail] = useState<FiscalDocumentDetailDTO | null>(null)
  const [docLoading, setDocLoading] = useState(false)
  const [danfeView, setDanfeView] = useState(false)

  // Cancelamento
  const [cancelDoc, setCancelDoc] = useState<FiscalDocumentDTO | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelBusy, setCancelBusy] = useState(false)

  // Inutilização
  const [inutOpen, setInutOpen] = useState(false)
  const [inutForm, setInutForm] = useState({ type: 'NFCE', serie: '1', from: '', to: '', reason: '' })
  const [inutBusy, setInutBusy] = useState(false)

  // Contingência
  const [contOpen, setContOpen] = useState(false)
  const [contEnabled, setContEnabled] = useState(false)
  const [contReason, setContReason] = useState('')
  const [contBusy, setContBusy] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [configData, docsData, eventsData, taxData] = await Promise.all([
        apiGet<FiscalConfigDTO>('/api/fiscal/config'),
        apiGet<{ documents: FiscalDocumentDTO[]; summary: { status: string; _count: { id: number } }[] }>('/api/fiscal/documents'),
        apiGet<FiscalEventDTO[]>('/api/fiscal/events?limit=120'),
        apiGet<{ version: string; rows: TaxTableDTO[]; versions: { version: string }[] }>('/api/fiscal/tax-tables'),
      ])
      setConfig(configData)
      setDocuments(docsData.documents)
      setSummary(docsData.summary.map((s) => ({ status: s.status, count: s._count.id })))
      setEvents(eventsData)
      setTaxRows(taxData.rows)
      setTaxVersion(taxData.version)
    } catch (err) {
      toast.error('Falha ao carregar dados fiscais', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const countOf = (status: string) => summary.find((s) => s.status === status)?.count ?? 0
  const authorized = countOf('TRANSMITIDA')
  const rejected = countOf('REJEITADA')
  const contingent = countOf('CONTINGENCIA')
  const totalIssued = summary.filter((s) => s.status !== 'INUTILIZADA' && s.status !== 'CANCELADA').reduce((acc, s) => acc + s.count, 0)
  const authorizedAmount = useMemo(
    () => documents.filter((d) => d.status === 'TRANSMITIDA').reduce((acc, d) => acc + d.total, 0),
    [documents]
  )

  // ---------- Ações ----------

  async function openDoc(doc: FiscalDocumentDTO) {
    setDocLoading(true)
    setDanfeView(false)
    try {
      const detail = await apiGet<FiscalDocumentDetailDTO>(`/api/fiscal/documents/${doc.id}`)
      setDocDetail(detail)
    } catch (err) {
      toast.error('Falha ao abrir documento', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setDocLoading(false)
    }
  }

  async function handleRetransmit(doc: FiscalDocumentDTO) {
    try {
      toast.loading('Reenviando documento...', { id: 'retransmit' })
      await apiPost(`/api/fiscal/documents/${doc.id}/retransmit`)
      toast.success('Documento reenviado', { id: 'retransmit' })
      void reload()
    } catch (err) {
      toast.error('Falha no reenvio', { id: 'retransmit', description: err instanceof Error ? err.message : undefined })
    }
  }

  async function handleCancel() {
    if (!cancelDoc) return
    setCancelBusy(true)
    try {
      await apiPost(`/api/fiscal/documents/${cancelDoc.id}/cancel`, { reason: cancelReason })
      toast.success('Nota cancelada', { description: 'Evento de cancelamento registrado na trilha fiscal.' })
      setCancelDoc(null)
      setCancelReason('')
      void reload()
    } catch (err) {
      toast.error('Falha ao cancelar', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setCancelBusy(false)
    }
  }

  async function handleContingency() {
    setContBusy(true)
    try {
      const updated = await apiPost<FiscalConfigDTO>('/api/fiscal/contingency', {
        enabled: contEnabled,
        reason: contReason,
      })
      setConfig(updated)
      toast.success(contEnabled ? 'Contingência ativada' : 'Contingência desativada')
      setContOpen(false)
      setContReason('')
      void reload()
    } catch (err) {
      toast.error('Falha ao alterar contingência', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setContBusy(false)
    }
  }

  async function handleInutilize() {
    setInutBusy(true)
    try {
      await apiPost('/api/fiscal/inutilize', {
        type: inutForm.type,
        serie: Number(inutForm.serie),
        from: Number(inutForm.from),
        to: Number(inutForm.to),
        reason: inutForm.reason,
      })
      toast.success('Faixa inutilizada', { description: 'Números reservados para o fisco e não aproveitáveis.' })
      setInutOpen(false)
      void reload()
    } catch (err) {
      toast.error('Falha na inutilização', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setInutBusy(false)
    }
  }

  // ---------- Tabelas tributárias ----------

  const [taxEditOpen, setTaxEditOpen] = useState(false)
  const [taxEditing, setTaxEditing] = useState<TaxTableDTO | null>(null)
  const [taxForm, setTaxForm] = useState({
    ncm: '', description: '', cfop: '5102', csosn: '102',
    icmsRate: '0', ibsRate: '0', cbsRate: '0', reducedIbs: false,
  })
  const [taxBusy, setTaxBusy] = useState(false)

  function openTaxNew() {
    setTaxEditing(null)
    setTaxForm({ ncm: '', description: '', cfop: '5102', csosn: '102', icmsRate: '0', ibsRate: '0', cbsRate: '0', reducedIbs: false })
    setTaxEditOpen(true)
  }

  function openTaxEdit(row: TaxTableDTO) {
    setTaxEditing(row)
    setTaxForm({
      ncm: row.ncm,
      description: row.description,
      cfop: row.cfop,
      csosn: row.csosn,
      icmsRate: String(row.icmsRate),
      ibsRate: String(row.ibsRate),
      cbsRate: String(row.cbsRate),
      reducedIbs: row.reducedIbs,
    })
    setTaxEditOpen(true)
  }

  async function handleTaxSave() {
    setTaxBusy(true)
    try {
      if (taxEditing) {
        await apiPatch(`/api/fiscal/tax-tables/${taxEditing.id}`, {
          description: taxForm.description,
          csosn: taxForm.csosn,
          icmsRate: Number(taxForm.icmsRate),
          ibsRate: Number(taxForm.ibsRate),
          cbsRate: Number(taxForm.cbsRate),
          reducedIbs: taxForm.reducedIbs,
        })
        toast.success('Linha tributária atualizada')
      } else {
        await apiPost('/api/fiscal/tax-tables', {
          version: taxVersion,
          ncm: taxForm.ncm,
          description: taxForm.description,
          cfop: taxForm.cfop,
          csosn: taxForm.csosn,
          icmsRate: Number(taxForm.icmsRate),
          ibsRate: Number(taxForm.ibsRate),
          cbsRate: Number(taxForm.cbsRate),
          reducedIbs: taxForm.reducedIbs,
        })
        toast.success('Linha tributária criada')
      }
      setTaxEditOpen(false)
      void reload()
    } catch (err) {
      toast.error('Falha ao salvar linha', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setTaxBusy(false)
    }
  }

  // ---------- Config form ----------

  const [configForm, setConfigForm] = useState<Partial<FiscalConfigDTO>>({})
  const [configBusy, setConfigBusy] = useState(false)

  useEffect(() => {
    if (config) {
      setConfigForm({
        companyName: config.companyName,
        cnpj: config.cnpj,
        ie: config.ie,
        uf: config.uf,
        crt: config.crt,
        environment: config.environment,
        nfceSeries: config.nfceSeries,
        nfceNextNumber: config.nfceNextNumber,
        nfeSeries: config.nfeSeries,
        nfeNextNumber: config.nfeNextNumber,
        autoEmit: config.autoEmit,
        certA1Name: config.certA1Name,
        certA1Expires: config.certA1Expires?.slice(0, 10) ?? '',
      })
    }
  }, [config])

  async function handleConfigSave() {
    setConfigBusy(true)
    try {
      const updated = await apiSendConfig(configForm)
      setConfig(updated)
      toast.success('Configuração fiscal salva')
      void reload()
    } catch (err) {
      toast.error('Falha ao salvar configuração', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setConfigBusy(false)
    }
  }

  async function apiSendConfig(form: Partial<FiscalConfigDTO>) {
    const payload: Record<string, unknown> = { ...form }
    if (typeof payload.certA1Expires === 'string' && payload.certA1Expires === '') {
      payload.certA1Expires = null
    }
    const res = await fetch('/api/fiscal/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => null)
      throw new Error(err?.error ?? `PUT /api/fiscal/config falhou (${res.status})`)
    }
    return res.json() as Promise<FiscalConfigDTO>
  }

  // ============ Render ============

  if (loading) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <Landmark className="size-5 text-primary" />
            Motor Fiscal
          </h1>
          <p className="text-sm text-muted-foreground">
            NFC-e 65 · NF-e 55 · tabelas tributárias versionadas (IBS/CBS) · contingência · inutilização
          </p>
        </div>
        {config && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={config.environment === 'PRODUCAO' ? 'border-red-500/40 bg-red-500/10 text-red-400' : 'border-amber-500/40 bg-amber-500/10 text-amber-400'}>
              {config.environment === 'PRODUCAO' ? 'Ambiente: Produção' : 'Ambiente: Homologação'}
            </Badge>
            <Badge variant="outline" className="border-border">
              Tabela {config.taxVersion}
            </Badge>
            {config.contingency && (
              <Badge variant="outline" className="animate-pulse border-amber-500/40 bg-amber-500/10 text-amber-400">
                <Flame className="size-3" /> Contingência ativa
              </Badge>
            )}
          </div>
        )}
      </header>

      {/* Contingência ativa - banner */}
      {config?.contingency && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 size-5 text-amber-400" />
              <div>
                <p className="font-medium text-amber-400">Emissão em contingência off-line</p>
                <p className="text-sm text-muted-foreground">
                  Motivo: {config.contingencyReason} · desde {dthr(config.contingencySince)}. Documentos NFC-e são
                  numerados localmente (tpEmis 9) e devem ser transmitidos ao retornar da SEFAZ.
                </p>
              </div>
            </div>
            {can('fiscal.config') && (
              <Button
                size="sm"
                variant="outline"
                className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                onClick={() => {
                  setContEnabled(false)
                  setContReason('')
                  setContOpen(true)
                }}
              >
                Encerrar contingência
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Autorizadas</p>
            <p className="text-2xl font-semibold text-emerald-400">{authorized}</p>
            <p className="text-xs text-muted-foreground">{brl(authorizedAmount)} emitidos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Rejeitadas</p>
            <p className="text-2xl font-semibold text-red-400">{rejected}</p>
            <p className="text-xs text-muted-foreground">aguardam reenvio</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Contingência</p>
            <p className="text-2xl font-semibold text-amber-400">{contingent}</p>
            <p className="text-xs text-muted-foreground">retidas p/ transmissão</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total emitidas</p>
            <p className="text-2xl font-semibold">{totalIssued}</p>
            <p className="text-xs text-muted-foreground">todas as situações</p>
          </CardContent>
        </Card>
        <Card className="col-span-2 lg:col-span-1">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Certificado A1</p>
            {(() => {
              const meta = CERT_META[config?.certStatus ?? 'MISSING']
              return (
                <div className="mt-1 flex items-center gap-2">
                  {config?.certStatus === 'VALID' && <BadgeCheck className="size-5 text-emerald-400" />}
                  {(config?.certStatus === 'EXPIRED' || config?.certStatus === 'MISSING') && <XCircle className="size-5 text-red-400" />}
                  {config?.certStatus === 'EXPIRING' && <CalendarClock className="size-5 text-amber-400" />}
                  <div>
                    <p className="text-sm font-medium">{meta?.label ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">
                      {config?.certA1Name ?? 'configure em Configuração'}
                    </p>
                  </div>
                </div>
              )
            })()}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="documents">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="documents"><ScrollText className="mr-1 size-4" /> Documentos</TabsTrigger>
          <TabsTrigger value="taxes"><Table2 className="mr-1 size-4" /> Tabelas tributárias</TabsTrigger>
          <TabsTrigger value="events"><Hash className="mr-1 size-4" /> Eventos</TabsTrigger>
          {can('fiscal.config') && (
            <TabsTrigger value="config"><Building2 className="mr-1 size-4" /> Configuração</TabsTrigger>
          )}
        </TabsList>

        {/* ============ DOCUMENTOS ============ */}
        <TabsContent value="documents" className="mt-4 grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Documentos armazenados com XML, protocolo e trilha de eventos
            </p>
            <div className="flex gap-2">
              {can('fiscal.emit') && (
                <Button size="sm" variant="outline" onClick={() => setInutOpen(true)} disabled={!can('fiscal.inutilize')}>
                  <Ban className="mr-1 size-4" /> Inutilizar faixa
                </Button>
              )}
              {can('fiscal.config') && !config?.contingency && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
                  onClick={() => {
                    setContEnabled(true)
                    setContReason('')
                    setContOpen(true)
                  }}
                >
                  <Flame className="mr-1 size-4" /> Entrar em contingência
                </Button>
              )}
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="max-h-[520px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Nº / Série</TableHead>
                      <TableHead className="hidden md:table-cell">Chave de acesso</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead className="hidden text-right lg:table-cell">IBS/CBS</TableHead>
                      <TableHead className="hidden lg:table-cell">Emissão</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                          Nenhum documento fiscal emitido ainda.
                        </TableCell>
                      </TableRow>
                    )}
                    {documents.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell><TypeBadge type={doc.type} /></TableCell>
                        <TableCell className="font-mono text-sm">
                          {String(doc.number).padStart(9, '0')}/{String(doc.serie).padStart(3, '0')}
                          {doc.saleCode && <span className="ml-2 text-xs text-muted-foreground">venda {doc.saleCode}</span>}
                        </TableCell>
                        <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                          {formatKey(doc.accessKey).slice(0, 29)}…
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <StatusBadge status={doc.status} />
                            {doc.rejectCode && (
                              <span className="text-xs text-red-400">
                                {doc.rejectCode}: {doc.rejectMessage?.slice(0, 40)}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">{brl(doc.total)}</TableCell>
                        <TableCell className="hidden text-right font-mono text-xs text-muted-foreground lg:table-cell">
                          {brl(doc.ibsTotal)} / {brl(doc.cbsTotal)}
                        </TableCell>
                        <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                          {dthr(doc.issuedAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" title="Abrir XML/DANFE" onClick={() => void openDoc(doc)}>
                              {docLoading && docDetail?.id === doc.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <FileText className="size-4" />
                              )}
                            </Button>
                            {(doc.status === 'REJEITADA' || doc.status === 'CONTINGENCIA' || doc.status === 'PENDENTE') && can('fiscal.emit') && (
                              <Button size="icon" variant="ghost" title="Reenviar" onClick={() => void handleRetransmit(doc)}>
                                <RefreshCw className="size-4" />
                              </Button>
                            )}
                            {doc.status === 'TRANSMITIDA' && can('fiscal.cancel') && (
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Cancelar nota"
                                className="text-red-400"
                                onClick={() => {
                                  setCancelDoc(doc)
                                  setCancelReason('')
                                }}
                              >
                                <XCircle className="size-4" />
                              </Button>
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

        {/* ============ TABELAS TRIBUTÁRIAS ============ */}
        <TabsContent value="taxes" className="mt-4 grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm text-muted-foreground">
                Versão corrente <span className="font-mono text-foreground">{taxVersion}</span> · atualizável
                independentemente das regras comerciais (Notas Técnicas / Reforma Tributária IBS/CBS)
              </p>
            </div>
            {can('fiscal.tables') && (
              <Button size="sm" onClick={openTaxNew}>
                <FileText className="mr-1 size-4" /> Nova linha
              </Button>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="max-h-[520px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>NCM</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>CFOP</TableHead>
                      <TableHead>CSOSN</TableHead>
                      <TableHead className="text-right">ICMS</TableHead>
                      <TableHead className="text-right">IBS</TableHead>
                      <TableHead className="text-right">CBS</TableHead>
                      <TableHead>Redutor</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {taxRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                          Nenhuma linha tributária na versão {taxVersion}.
                        </TableCell>
                      </TableRow>
                    )}
                    {taxRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-mono text-sm">{row.ncm}</TableCell>
                        <TableCell className="max-w-[220px] truncate text-sm" title={row.description}>
                          {row.description}
                          {row.reducedIbs && (
                            <Badge variant="outline" className="ml-2 border-emerald-500/40 bg-emerald-500/10 text-emerald-400">
                              cesta básica
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{row.cfop}</TableCell>
                        <TableCell className="font-mono text-sm">{row.csosn}</TableCell>
                        <TableCell className="text-right font-mono">{row.icmsRate.toFixed(2)}%</TableCell>
                        <TableCell className="text-right font-mono text-primary">{row.ibsRate.toFixed(2)}%</TableCell>
                        <TableCell className="text-right font-mono text-primary">{row.cbsRate.toFixed(2)}%</TableCell>
                        <TableCell>
                          {row.reducedIbs ? (
                            <BadgeCheck className="size-4 text-emerald-400" />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="icon" variant="ghost" title="Editar" onClick={() => openTaxEdit(row)} disabled={!can('fiscal.tables')}>
                            <FileText className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ EVENTOS ============ */}
        <TabsContent value="events" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="size-4 text-primary" />
                Trilha de eventos fiscais
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[480px] space-y-0 overflow-y-auto p-4">
                {events.length === 0 && (
                  <p className="py-8 text-center text-muted-foreground">Nenhum evento registrado.</p>
                )}
                {events.map((event) => {
                  const meta = EVENT_META[event.type] ?? { label: event.type, className: '' }
                  return (
                    <div key={event.id} className="flex items-start gap-3 border-b border-border/60 py-3 last:border-b-0">
                      <div className={`mt-1 size-2 shrink-0 rounded-full ${event.type === 'REJEICAO' ? 'bg-red-400' : event.type === 'AUTORIZACAO' ? 'bg-emerald-400' : event.type.includes('CONTINGENCIA') ? 'bg-amber-400' : 'bg-primary'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-sm font-medium ${meta.className}`}>{meta.label}</span>
                          {event.accessKey && (
                            <span className="font-mono text-xs text-muted-foreground">
                              {event.accessKey.slice(0, 10)}…
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">{dthr(event.createdAt)}</span>
                          {event.author && <span className="text-xs text-muted-foreground">· {event.author}</span>}
                        </div>
                        <p className="mt-0.5 text-sm text-muted-foreground">{event.description}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ CONFIGURAÇÃO ============ */}
        <TabsContent value="config" className="mt-4 grid gap-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="size-4 text-primary" /> Emitente
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="f-company">Razão social</Label>
                  <Input
                    id="f-company"
                    value={configForm.companyName ?? ''}
                    onChange={(e) => setConfigForm((f) => ({ ...f, companyName: e.target.value }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="f-cnpj">CNPJ</Label>
                    <Input
                      id="f-cnpj"
                      className="font-mono"
                      value={configForm.cnpj ?? ''}
                      onChange={(e) => setConfigForm((f) => ({ ...f, cnpj: e.target.value }))}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="f-ie">Inscrição estadual</Label>
                    <Input
                      id="f-ie"
                      value={configForm.ie ?? ''}
                      placeholder="ISENTO"
                      onChange={(e) => setConfigForm((f) => ({ ...f, ie: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="f-uf">UF</Label>
                    <Input
                      id="f-uf"
                      maxLength={2}
                      value={configForm.uf ?? ''}
                      onChange={(e) => setConfigForm((f) => ({ ...f, uf: e.target.value.toUpperCase() }))}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Regime tributário</Label>
                    <Select
                      value={configForm.crt ?? 'SIMPLES_NACIONAL'}
                      onValueChange={(v) => setConfigForm((f) => ({ ...f, crt: v }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SIMPLES_NACIONAL">Simples Nacional</SelectItem>
                        <SelectItem value="LUCRO_REAL">Lucro Real</SelectItem>
                        <SelectItem value="LUCRO_PRESUMIDO">Lucro Presumido</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Hash className="size-4 text-primary" /> Numeração e ambiente
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label>Série NFC-e</Label>
                    <Input
                      type="number"
                      min={1}
                      value={configForm.nfceSeries ?? 1}
                      onChange={(e) => setConfigForm((f) => ({ ...f, nfceSeries: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Próximo nº NFC-e</Label>
                    <Input
                      type="number"
                      min={1}
                      value={configForm.nfceNextNumber ?? 1}
                      onChange={(e) => setConfigForm((f) => ({ ...f, nfceNextNumber: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Série NF-e</Label>
                    <Input
                      type="number"
                      min={1}
                      value={configForm.nfeSeries ?? 1}
                      onChange={(e) => setConfigForm((f) => ({ ...f, nfeSeries: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Próximo nº NF-e</Label>
                    <Input
                      type="number"
                      min={1}
                      value={configForm.nfeNextNumber ?? 1}
                      onChange={(e) => setConfigForm((f) => ({ ...f, nfeNextNumber: Number(e.target.value) }))}
                    />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label>Ambiente de emissão</Label>
                  <Select
                    value={configForm.environment ?? 'HOMOLOGACAO'}
                    onValueChange={(v) => setConfigForm((f) => ({ ...f, environment: v }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HOMOLOGACAO">Homologação (sem valor fiscal)</SelectItem>
                      <SelectItem value="PRODUCAO">Produção</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium">Emissão automática no PDV</p>
                    <p className="text-xs text-muted-foreground">Gera NFC-e a cada venda concluída no caixa</p>
                  </div>
                  <Switch
                    checked={configForm.autoEmit ?? false}
                    onCheckedChange={(v) => setConfigForm((f) => ({ ...f, autoEmit: v }))}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BadgeCheck className="size-4 text-primary" /> Certificado digital A1
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="f-cert-name">Nome do titular / arquivo</Label>
                  <Input
                    id="f-cert-name"
                    value={configForm.certA1Name ?? ''}
                    placeholder="ex: certificado-a1-padaria.pfx"
                    onChange={(e) => setConfigForm((f) => ({ ...f, certA1Name: e.target.value }))}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="f-cert-exp">Validade</Label>
                  <Input
                    id="f-cert-exp"
                    type="date"
                    value={configForm.certA1Expires ?? ''}
                    onChange={(e) => setConfigForm((f) => ({ ...f, certA1Expires: e.target.value }))}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  O arquivo .pfx não é armazenado no banco; apenas os metadados de controle e a
                  validade, verificada antes de cada transmissão.
                </p>
              </CardContent>
            </Card>

            <Card className="self-start">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Printer className="size-4 text-primary" /> Provedor fiscal
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label>Comunicação com SEFAZ</Label>
                  <Select value="LOCAL_SIMULADO" onValueChange={() => undefined}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOCAL_SIMULADO">Simulado local (homologação)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  A camada de provedores é plugável: novos provedores (blocos API, NFe.io,
                  Focus NFe etc.) implementam a mesma interface sem alterar o ERP.
                </p>
                <Button onClick={() => void handleConfigSave()} disabled={configBusy}>
                  {configBusy && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Salvar configuração
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ============ DIALOG: documento (XML/DANFE) ============ */}
      <Dialog open={!!docDetail} onOpenChange={(open) => !open && setDocDetail(null)}>
        <DialogContent className="max-w-2xl">
          {docDetail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  <TypeBadge type={docDetail.type} />
                  {String(docDetail.number).padStart(9, '0')}/{String(docDetail.serie).padStart(3, '0')}
                  <StatusBadge status={docDetail.status} />
                </DialogTitle>
                <DialogDescription className="font-mono">{formatKey(docDetail.accessKey)}</DialogDescription>
              </DialogHeader>

              <div className="max-h-[420px] overflow-y-auto rounded-lg border border-border">
                {danfeView ? (
                  <DanfePreview meta={docDetail.danfeMeta ? (JSON.parse(docDetail.danfeMeta) as DanfeMetaDTO) : null} />
                ) : (
                  <pre className="whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed">{docDetail.xml}</pre>
                )}
              </div>

              <div className="grid gap-2 text-sm">
                {docDetail.protocol && (
                  <p className="text-muted-foreground">
                    Protocolo: <span className="font-mono text-foreground">{docDetail.protocol}</span> · autorizado em {dthr(docDetail.receivedAt)}
                  </p>
                )}
                {docDetail.rejectCode && (
                  <p className="text-red-400">
                    {docDetail.rejectCode}: {docDetail.rejectMessage}
                  </p>
                )}
                <p className="text-muted-foreground">
                  Tributos: ICMS {brl(docDetail.icmsTotal)} · IBS {brl(docDetail.ibsTotal)} · CBS {brl(docDetail.cbsTotal)} · Tentativas: {docDetail.attempts}
                </p>
                {docDetail.events.length > 0 && (
                  <div className="rounded-lg border border-border p-2">
                    {docDetail.events.map((event) => (
                      <p key={event.id} className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{dthr(event.createdAt)}</span>{' '}
                        · {EVENT_META[event.type]?.label ?? event.type}: {event.description}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" size="sm" onClick={() => setDanfeView((v) => !v)}>
                  {danfeView ? <ScrollText className="mr-1 size-4" /> : <Printer className="mr-1 size-4" />}
                  {danfeView ? 'Ver XML' : 'Ver DANFE'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void copyText(docDetail.xml ?? '', 'XML')}
                >
                  <Copy className="mr-1 size-4" /> Copiar XML
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setDocDetail(null)}>Fechar</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ============ DIALOG: cancelamento ============ */}
      <Dialog open={!!cancelDoc} onOpenChange={(open) => !open && setCancelDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar documento fiscal</DialogTitle>
            <DialogDescription>
              {cancelDoc && `${cancelDoc.type === 'NFCE' ? 'NFC-e' : 'NF-e'} nº ${cancelDoc.number}/${cancelDoc.serie} · chave ${cancelDoc.accessKey.slice(0, 10)}…`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="cancel-reason">Justificativa (mínimo 15 caracteres)</Label>
            <Textarea
              id="cancel-reason"
              rows={3}
              value={cancelReason}
              placeholder="ex: Operação não efetivada, comprador desistiu da compra"
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCancelDoc(null)}>Voltar</Button>
            <Button
              variant="destructive"
              disabled={cancelBusy || cancelReason.trim().length < 15}
              onClick={() => void handleCancel()}
            >
              {cancelBusy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ DIALOG: contingência ============ */}
      <Dialog open={contOpen} onOpenChange={(open) => !open && setContOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {contEnabled ? 'Entrar em contingência off-line' : 'Encerrar contingência'}
            </DialogTitle>
            <DialogDescription>
              {contEnabled
                ? 'As NFC-e serão numeradas localmente (tpEmis 9) e transmitidas quando a conexão com a SEFAZ voltar.'
                : 'Os documentos retidos poderão ser reenviados manualmente pela lista de documentos.'}
            </DialogDescription>
          </DialogHeader>
          {contEnabled && (
            <div className="grid gap-1.5">
              <Label htmlFor="cont-reason">Motivo da contingência (mínimo 10 caracteres)</Label>
              <Textarea
                id="cont-reason"
                rows={3}
                value={contReason}
                placeholder="ex: SEFAZ indisponível - falha de conexão do provedor"
                onChange={(e) => setContReason(e.target.value)}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setContOpen(false)}>Voltar</Button>
            <Button
              disabled={contBusy || (contEnabled && contReason.trim().length < 10)}
              onClick={() => void handleContingency()}
            >
              {contBusy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ DIALOG: inutilização ============ */}
      <Dialog open={inutOpen} onOpenChange={(open) => !open && setInutOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inutilizar faixa de numeração</DialogTitle>
            <DialogDescription>
              Reserva números não utilizados para o fisco. Não é permitido sobre documentos autorizados.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Tipo</Label>
              <Select value={inutForm.type} onValueChange={(v) => setInutForm((f) => ({ ...f, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NFCE">NFC-e (65)</SelectItem>
                  <SelectItem value="NFE">NF-e (55)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Série</Label>
              <Input
                type="number"
                min={1}
                value={inutForm.serie}
                onChange={(e) => setInutForm((f) => ({ ...f, serie: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Número inicial</Label>
              <Input
                type="number"
                min={1}
                value={inutForm.from}
                onChange={(e) => setInutForm((f) => ({ ...f, from: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Número final</Label>
              <Input
                type="number"
                min={1}
                value={inutForm.to}
                onChange={(e) => setInutForm((f) => ({ ...f, to: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="inut-reason">Justificativa (mínimo 15 caracteres)</Label>
            <Textarea
              id="inut-reason"
              rows={3}
              value={inutForm.reason}
              placeholder="ex: quebra de sequência por perda de energia durante o fechamento"
              onChange={(e) => setInutForm((f) => ({ ...f, reason: e.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setInutOpen(false)}>Voltar</Button>
            <Button
              disabled={
                inutBusy ||
                inutForm.reason.trim().length < 15 ||
                !inutForm.from ||
                !inutForm.to
              }
              onClick={() => void handleInutilize()}
            >
              {inutBusy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Inutilizar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ DIALOG: edição de tabela tributária ============ */}
      <Dialog open={taxEditOpen} onOpenChange={(open) => !open && setTaxEditOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{taxEditing ? 'Editar linha tributária' : 'Nova linha tributária'}</DialogTitle>
            <DialogDescription>
              Versão <span className="font-mono">{taxVersion}</span> · alíquotas aplicadas por NCM na emissão
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="tax-ncm">NCM (8 dígitos)</Label>
              <Input
                id="tax-ncm"
                className="font-mono"
                maxLength={8}
                disabled={!!taxEditing}
                value={taxForm.ncm}
                onChange={(e) => setTaxForm((f) => ({ ...f, ncm: e.target.value.replace(/\D/g, '') }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tax-desc">Descrição</Label>
              <Input
                id="tax-desc"
                value={taxForm.description}
                onChange={(e) => setTaxForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tax-cfop">CFOP</Label>
              <Input
                id="tax-cfop"
                className="font-mono"
                maxLength={4}
                disabled={!!taxEditing}
                value={taxForm.cfop}
                onChange={(e) => setTaxForm((f) => ({ ...f, cfop: e.target.value.replace(/\D/g, '') }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tax-csosn">CSOSN</Label>
              <Input
                id="tax-csosn"
                className="font-mono"
                maxLength={3}
                value={taxForm.csosn}
                onChange={(e) => setTaxForm((f) => ({ ...f, csosn: e.target.value.replace(/\D/g, '') }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tax-icms">ICMS %</Label>
              <Input
                id="tax-icms"
                type="number"
                step="0.01"
                value={taxForm.icmsRate}
                onChange={(e) => setTaxForm((f) => ({ ...f, icmsRate: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="tax-ibs">IBS %</Label>
                <Input
                  id="tax-ibs"
                  type="number"
                  step="0.01"
                  value={taxForm.ibsRate}
                  onChange={(e) => setTaxForm((f) => ({ ...f, ibsRate: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tax-cbs">CBS %</Label>
                <Input
                  id="tax-cbs"
                  type="number"
                  step="0.01"
                  value={taxForm.cbsRate}
                  onChange={(e) => setTaxForm((f) => ({ ...f, cbsRate: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3">
            <Checkbox
              checked={taxForm.reducedIbs}
              onCheckedChange={(v) => setTaxForm((f) => ({ ...f, reducedIbs: v === true }))}
            />
            <div>
              <p className="text-sm font-medium">Redutor da cesta básica nacional</p>
              <p className="text-xs text-muted-foreground">Aplica redução de 50% na base de cálculo do IBS/CBS</p>
            </div>
          </label>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setTaxEditOpen(false)}>Voltar</Button>
            <Button
              disabled={
                taxBusy ||
                taxForm.description.trim().length < 2 ||
                (!taxEditing && taxForm.ncm.length !== 8)
              }
              onClick={() => void handleTaxSave()}
            >
              {taxBusy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============ DANFE simplificado (NFC-e 80mm) ============

function DanfePreview({ meta }: { meta: DanfeMetaDTO | null }) {
  if (!meta) {
    return <p className="p-6 text-center text-sm text-muted-foreground">DANFE indisponível para este documento.</p>
  }
  const isNfce = meta.type === 'NFCE'
  return (
    <div className="flex justify-center bg-muted/30 p-4">
      <div
        className={`bg-white p-4 font-mono text-black ${isNfce ? 'w-[300px] text-[11px]' : 'w-full max-w-[560px] text-xs'}`}
      >
        <p className="text-center font-bold uppercase">{meta.emitente}</p>
        <p className="text-center">CNPJ: {meta.cnpj}</p>
        <div className="my-2 border-t border-dashed border-black" />
        <p className="text-center font-bold">
          DANFE NFC-e {meta.ambiente === 'PRODUCAO' ? '' : '(HOMOLOGAÇÃO - SEM VALOR FISCAL)'}
        </p>
        <p className="text-center">Nº {String(meta.numero).padStart(9, '0')} · Série {meta.serie}</p>
        {meta.contingencia && <p className="text-center font-bold">EMITIDA EM CONTINGÊNCIA</p>}
        <div className="my-2 border-t border-dashed border-black" />
        <table className="w-full">
          <thead>
            <tr className="border-b border-black">
              <th className="text-left">Item</th>
              <th className="text-right">Qtd</th>
              <th className="text-right">Vl unit</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {meta.itens.map((item, index) => (
              <tr key={index}>
                <td className="truncate pr-1">{item.name}</td>
                <td className="text-right">{item.qty}</td>
                <td className="text-right">{item.unitPrice.toFixed(2)}</td>
                <td className="text-right">{item.subtotal.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="my-2 border-t border-dashed border-black" />
        {meta.desconto > 0 && (
          <p className="flex justify-between"><span>Desconto</span><span>-{meta.desconto.toFixed(2)}</span></p>
        )}
        <p className="flex justify-between font-bold"><span>TOTAL</span><span>R$ {meta.total.toFixed(2)}</span></p>
        <div className="my-2 border-t border-dashed border-black" />
        {meta.pagamentos.map((payment, index) => (
          <p key={index} className="flex justify-between"><span>{payment.label}</span><span>{payment.amount.toFixed(2)}</span></p>
        ))}
        <div className="my-2 border-t border-dashed border-black" />
        <p className="flex justify-between text-[10px]">
          <span>ICMS</span><span>{meta.tributos.icms.toFixed(2)}</span>
        </p>
        <p className="flex justify-between text-[10px]">
          <span>IBS (Reforma 2026)</span><span>{meta.tributos.ibs.toFixed(2)}</span>
        </p>
        <p className="flex justify-between text-[10px]">
          <span>CBS (Reforma 2026)</span><span>{meta.tributos.cbs.toFixed(2)}</span>
        </p>
        <div className="my-2 border-t border-dashed border-black" />
        <p className="text-center text-[10px] leading-tight">Chave de acesso</p>
        <p className="text-center font-bold">{formatKey(meta.chave)}</p>
        <p className="mt-2 text-center text-[9px] leading-tight">{meta.consulta}</p>
        <p className="mt-2 text-center text-[9px]">Emitido por BAKERY-ERP</p>
      </div>
    </div>
  )
}
