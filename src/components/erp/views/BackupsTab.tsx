'use client'

// BAKERY ERP - Aba Backups (Configurações): regras de backup, execução manual,
// download, restauração (do servidor ou arquivo enviado) e histórico de operações.
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  DatabaseBackup,
  Download,
  HardDriveDownload,
  Loader2,
  RotateCcw,
  Save,
  Upload,
  XCircle,
} from 'lucide-react'

import { apiGet, apiPost, apiPut } from '@/lib/api'
import { brl } from '@/lib/format'
import type { ViewProps } from '@/components/erp/view-props'
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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface BackupSettingResponse {
  id: string
  enabled: boolean
  frequencyType: string
  timeOfDay: string | null
  weekday: number | null
  retentionCount: number
  notifyOnFailure: boolean
  lastBackupAt: string | null
  lastStatus: string | null
  lastError: string | null
  lastRunBy: string | null
}

interface BackupFile {
  name: string
  sizeBytes: number
  createdAt: string
}

interface BackupLogRow {
  id: string
  type: string
  status: string
  filename: string | null
  sizeBytes: number | null
  durationMs: number | null
  message: string | null
  operator: string | null
  createdAt: string
}

const FREQUENCY_LABELS: Record<string, string> = {
  MANUAL: 'Manual (sem agendamento)',
  HOURLY: 'A cada hora',
  DAILY: 'Diário',
  WEEKLY: 'Semanal',
}

const WEEKDAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

const TYPE_LABELS: Record<string, string> = {
  MANUAL: 'Manual',
  AUTOMATICO: 'Automático',
  PRE_RESTORE: 'Segurança pré-restauração',
  RESTAURACAO: 'Restauração',
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${brl(bytes / 1024).replace('R$', '').trim()} KB`
  return `${brl(bytes / (1024 * 1024)).replace('R$', '').trim()} MB`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })
}

export default function BackupsTab({ operator }: ViewProps) {
  const [setting, setSetting] = useState<BackupSettingResponse | null>(null)
  const [files, setFiles] = useState<BackupFile[]>([])
  const [logs, setLogs] = useState<BackupLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingRules, setSavingRules] = useState(false)
  const [running, setRunning] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<BackupFile | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Formulário de regras (derivado da configuração carregada)
  const [form, setForm] = useState({
    enabled: true,
    frequencyType: 'DAILY',
    timeOfDay: '22:00',
    weekday: 0,
    retentionCount: 10,
    notifyOnFailure: true,
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiGet<{ setting: BackupSettingResponse; files: BackupFile[]; logs: BackupLogRow[] }>('/api/backup')
      setSetting(data.setting)
      setFiles(data.files)
      setLogs(data.logs)
      setForm({
        enabled: data.setting.enabled,
        frequencyType: data.setting.frequencyType,
        timeOfDay: data.setting.timeOfDay ?? '22:00',
        weekday: data.setting.weekday ?? 0,
        retentionCount: data.setting.retentionCount,
        notifyOnFailure: data.setting.notifyOnFailure,
      })
    } catch (err) {
      toast.error('Erro ao carregar backups', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function saveRules() {
    setSavingRules(true)
    try {
      await apiPut<BackupSettingResponse>('/api/backup', {
        enabled: form.enabled,
        frequencyType: form.frequencyType,
        timeOfDay: form.frequencyType === 'DAILY' || form.frequencyType === 'WEEKLY' ? form.timeOfDay : null,
        weekday: form.frequencyType === 'WEEKLY' ? form.weekday : null,
        retentionCount: form.retentionCount,
        notifyOnFailure: form.notifyOnFailure,
      })
      toast.success('Regras de backup salvas')
      await load()
    } catch (err) {
      toast.error('Erro ao salvar regras', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setSavingRules(false)
    }
  }

  async function runNow() {
    setRunning(true)
    try {
      const result = await apiPost<{ filename: string; sizeBytes: number; durationMs: number }>('/api/backup')
      toast.success(`Backup criado: ${result.filename}`, {
        description: `${fmtSize(result.sizeBytes)} em ${(result.durationMs / 1000).toFixed(1)}s`,
      })
      await load()
    } catch (err) {
      toast.error('Falha no backup', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setRunning(false)
    }
  }

  async function confirmRestore() {
    if (!restoreTarget) return
    setRestoring(true)
    try {
      const result = await apiPost<{ restoredFrom: string; safetyBackup: string }>('/api/backup/restore', {
        filename: restoreTarget.name,
      })
      toast.success('Sistema restaurado com sucesso', {
        description: `Restaurado de ${result.restoredFrom}. Backup de segurança criado: ${result.safetyBackup}. Recomendamos recarregar a página.`,
      })
      setRestoreTarget(null)
      await load()
    } catch (err) {
      toast.error('Falha na restauração', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setRestoring(false)
    }
  }

  async function restoreFromUpload(file: File) {
    setUploading(true)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/backup/restore', { method: 'POST', body })
      const data = (await res.json().catch(() => null)) as { restoredFrom?: string; safetyBackup?: string; error?: string } | null
      if (!res.ok) throw new Error(data?.error ?? `Falha na restauração (${res.status})`)
      toast.success('Sistema restaurado a partir do arquivo enviado', {
        description: `Restaurado de ${data?.restoredFrom}. Segurança prévia: ${data?.safetyBackup}. Recomendamos recarregar a página.`,
      })
      await load()
    } catch (err) {
      toast.error('Falha na restauração', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function download(file: BackupFile) {
    const url = `/api/backup/download?file=${encodeURIComponent(file.name)}`
    const a = document.createElement('a')
    a.href = url
    a.download = file.name
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const canRestore = operator.isAbsolute || operator.permissions.includes('settings.backup')
  const showScheduleFields = form.frequencyType === 'DAILY' || form.frequencyType === 'WEEKLY'

  return (
    <div className="space-y-4">
      <Alert>
        <DatabaseBackup className="size-4" />
        <AlertDescription>
          O backup captura <strong>todo o banco do sistema</strong> (produtos, vendas, estoque, financeiro, fiscal e acessos).
          A restauração substitui <strong>todos os dados atuais</strong> — antes disso, um backup de segurança do estado atual é criado automaticamente.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* ===================== Regras ===================== */}
        <Card className="rounded-xl border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4 text-primary" />
              Regras de backup (agendamento)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Backup automático</p>
                <p className="text-xs text-muted-foreground">Executa conforme a frequência abaixo</p>
              </div>
              <Switch
                checked={form.enabled}
                onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
                aria-label="Ativar backup automático"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Frequência</Label>
                <Select value={form.frequencyType} onValueChange={(v) => setForm((f) => ({ ...f, frequencyType: v }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FREQUENCY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {showScheduleFields ? (
                <div className="space-y-1.5">
                  <Label>Horário (HH:MM)</Label>
                  <Input
                    type="time"
                    value={form.timeOfDay}
                    onChange={(e) => setForm((f) => ({ ...f, timeOfDay: e.target.value }))}
                  />
                </div>
              ) : null}

              {form.frequencyType === 'WEEKLY' ? (
                <div className="space-y-1.5">
                  <Label>Dia da semana</Label>
                  <Select
                    value={String(form.weekday)}
                    onValueChange={(v) => setForm((f) => ({ ...f, weekday: Number(v) }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAY_LABELS.map((label, i) => (
                        <SelectItem key={i} value={String(i)}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <Label>Retenção (quantidade mantida)</Label>
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={form.retentionCount}
                  onChange={(e) => setForm((f) => ({ ...f, retentionCount: Number(e.target.value) }))}
                />
              </div>
            </div>

            {setting?.lastBackupAt ? (
              <p className="text-xs text-muted-foreground">
                Último backup: {fmtDate(setting.lastBackupAt)}
                {setting.lastStatus ? (
                  <Badge
                    variant="outline"
                    className={`ml-2 ${
                      setting.lastStatus === 'SUCESSO'
                        ? 'border-emerald-500/40 text-emerald-500'
                        : 'border-destructive/40 text-destructive'
                    }`}
                  >
                    {setting.lastStatus}
                  </Badge>
                ) : null}
                {setting.lastError ? <span className="block text-destructive">{setting.lastError}</span> : null}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={saveRules} disabled={savingRules}>
                {savingRules ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Salvar regras
              </Button>
              <Button variant="outline" onClick={runNow} disabled={running}>
                {running ? <Loader2 className="size-4 animate-spin" /> : <DatabaseBackup className="size-4" />}
                Fazer backup agora
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ===================== Arquivos ===================== */}
        <Card className="rounded-xl border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between gap-2 text-base">
              <span className="flex items-center gap-2">
                <HardDriveDownload className="size-4 text-primary" />
                Backups no servidor ({files.length})
              </span>
              {canRestore ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={uploading || restoring}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                  Restaurar de arquivo
                </Button>
              ) : null}
              <input
                ref={fileInputRef}
                type="file"
                accept=".db,.sqlite,.sqlite3"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void restoreFromUpload(file)
                }}
              />
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-10 animate-pulse rounded bg-muted" />
                ))}
              </div>
            ) : files.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
                <Database className="size-8" />
                <p className="text-sm">Nenhum backup ainda. Use “Fazer backup agora”.</p>
              </div>
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
                {files.map((file) => (
                  <div
                    key={file.name}
                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs">{file.name}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {fmtDate(file.createdAt)} · {fmtSize(file.sizeBytes)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="icon" className="size-8" title="Baixar" onClick={() => download(file)}>
                        <Download className="size-4" />
                      </Button>
                      {canRestore ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive"
                          disabled={restoring || uploading}
                          onClick={() => setRestoreTarget(file)}
                        >
                          <RotateCcw className="size-3.5" />
                          Restaurar
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ===================== Histórico ===================== */}
      <Card className="rounded-xl border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Histórico de operações</CardTitle>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma operação registrada</p>
          ) : (
            <div className="max-h-96 overflow-y-auto scrollbar-thin">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Operador</TableHead>
                    <TableHead>Detalhe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-xs tabular-nums">{fmtDate(log.createdAt)}</TableCell>
                      <TableCell className="text-xs">{TYPE_LABELS[log.type] ?? log.type}</TableCell>
                      <TableCell>
                        {log.status === 'SUCESSO' ? (
                          <CheckCircle2 className="size-4 text-emerald-500" />
                        ) : (
                          <XCircle className="size-4 text-destructive" />
                        )}
                      </TableCell>
                      <TableCell className="max-w-40 truncate font-mono text-xs">{log.filename ?? '—'}</TableCell>
                      <TableCell className="text-xs">{log.operator ?? '—'}</TableCell>
                      <TableCell className="max-w-72 truncate text-xs text-muted-foreground" title={log.message ?? ''}>
                        {log.message ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===================== Confirmação de restauração ===================== */}
      <AlertDialog open={restoreTarget !== null} onOpenChange={(open) => !open && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-destructive" />
              Restaurar backup?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left">
                <p>
                  <strong>Todos os dados atuais serão substituídos</strong> pelo conteúdo do backup{' '}
                  <span className="font-mono">{restoreTarget?.name}</span>.
                </p>
                <p>
                  Um backup de segurança do estado atual será criado automaticamente antes da restauração.
                </p>
                <p className="text-xs">Usuários conectados devem recarregar a página após a operação.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={restoring}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault()
                void confirmRestore()
              }}
            >
              {restoring ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Restaurando...
                </>
              ) : (
                'Confirmar restauração'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
