// BAKERY ERP - Motor de backup e restauração do banco de dados (SQLite)
// Estratégia: snapshot físico consistente via VACUUM INTO (roda com o servidor vivo),
// validação de integridade do arquivo gerado, regras de agendamento com retenção
// e restauração com backup de segurança prévio (PRE_RESTORE).
import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'
import { db } from '@/lib/db'

export const BACKUP_DIR = path.join(process.cwd(), 'db', 'backups')

const round2 = (v: number) => Math.round(v * 100) / 100

export type BackupType = 'MANUAL' | 'AUTOMATICO' | 'PRE_RESTORE'
export type BackupFrequencyType = 'MANUAL' | 'HOURLY' | 'DAILY' | 'WEEKLY'

export interface BackupSettingDTO {
  enabled: boolean
  frequencyType: BackupFrequencyType
  timeOfDay: string | null
  weekday: number | null
  retentionCount: number
  notifyOnFailure: boolean
  lastBackupAt: string | null
  lastStatus: string | null
  lastError: string | null
  lastRunBy: string | null
}

export interface BackupFileInfo {
  name: string
  sizeBytes: number
  createdAt: string
}

export interface BackupResult {
  ok: boolean
  filename?: string
  sizeBytes?: number
  durationMs?: number
  error?: string
}

/** Extrai o caminho do arquivo SQLite do DATABASE_URL (file:/...) */
function databaseFilePath(): string {
  const url = process.env.DATABASE_URL ?? 'file:./db/custom.db'
  const raw = url.startsWith('file:') ? url.slice('file:'.length) : url
  if (path.isAbsolute(raw)) return raw
  return path.join(process.cwd(), 'db', 'custom.db')
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function timestampName(prefix: string, date = new Date()): string {
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const h = pad(date.getHours())
  const min = pad(date.getMinutes())
  const s = pad(date.getSeconds())
  const ms = String(date.getMilliseconds()).padStart(3, '0')
  return `${prefix}-${y}${m}${d}_${h}-${min}-${s}-${ms}.db`
}

function ensureDir(): void {
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
}

/** Nome seguro: impede path traversal (aceita apenas o basename dentro da pasta de backups) */
function safeBackupPath(name: string): string | null {
  const base = path.basename(name)
  if (!base || base.startsWith('.') || base.includes('/') || base.includes('\\')) return null
  if (!/\.(db|sqlite|sqlite3)$/i.test(base)) return null
  const full = path.join(BACKUP_DIR, base)
  if (!full.startsWith(BACKUP_DIR)) return null
  return full
}

function withTempClient<T>(dbFile: string, fn: (client: PrismaClient) => Promise<T>): Promise<T> {
  const client = new PrismaClient({
    datasources: { db: { url: `file:${dbFile}` } },
    log: [{ level: 'error', emit: 'stdout' }],
  })
  return fn(client).finally(() => client.$disconnect())
}

/** Valida um arquivo de banco: integridade física + presença das tabelas centrais */
export async function validateBackupFile(dbFile: string): Promise<{ ok: boolean; error?: string; users?: number }> {
  try {
    return await withTempClient(dbFile, async (client) => {
      const integrity = (await client.$queryRawUnsafe<Array<{ integrity_check: string }>>('PRAGMA integrity_check')) as Array<{ integrity_check: string }>
      if (!integrity?.length || integrity[0].integrity_check !== 'ok') {
        return { ok: false, error: `Integridade inválida: ${integrity?.[0]?.integrity_check ?? 'desconhecida'}` }
      }
      const tables = (await client.$queryRawUnsafe<Array<{ name: string }>>(
        "SELECT name FROM sqlite_master WHERE type='table'",
      )) as Array<{ name: string }>
      const names = new Set(tables.map((t) => t.name))
      const required = ['User', 'Role', 'Company', 'Product', 'Sale']
      const missing = required.filter((t) => !names.has(t))
      if (missing.length > 0) {
        return { ok: false, error: `Arquivo não parece ser um backup do BAKERY-ERP (faltam tabelas: ${missing.join(', ')})` }
      }
      const users = await client.user.count()
      return { ok: true, users }
    })
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Falha ao abrir o arquivo de banco' }
  }
}

/** Cria um backup consistente (VACUUM INTO) com validação e retenção */
export async function runBackup(type: BackupType, operator?: string): Promise<BackupResult> {
  const startedAt = Date.now()
  ensureDir()
  const dbPath = databaseFilePath()
  // VACUUM INTO falha se o destino já existir: garante nome único mesmo em
  // operações rápidas consecutivas (mesmo milissegundo / mesmo segundo)
  let filename = timestampName('bakeryerp-backup')
  let target = path.join(BACKUP_DIR, filename)
  let attempt = 0
  while (fs.existsSync(target) && attempt < 50) {
    attempt++
    filename = timestampName('bakeryerp-backup').replace('.db', `-${attempt}.db`)
    target = path.join(BACKUP_DIR, filename)
  }

  try {
    // Consistência: força checkpoint do WAL antes do snapshot
    await db.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)')
    // VACUUM INTO produz cópia compactada e consistente em um único comando
    await db.$queryRawUnsafe(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
    fs.statSync(target)

    const stat = fs.statSync(target)
    if (!stat.isFile() || stat.size < 4096) {
      throw new Error('Arquivo de backup gerado está vazio ou inválido')
    }

    const validation = await validateBackupFile(target)
    if (!validation.ok) {
      fs.rmSync(target, { force: true })
      throw new Error(`Backup falhou na validação: ${validation.error}`)
    }

    const durationMs = Date.now() - startedAt
    await db.backupLog.create({
      data: {
        type,
        status: 'SUCESSO',
        filename,
        sizeBytes: stat.size,
        durationMs,
        message: `Backup ${type.toLowerCase()} concluído (${round2(stat.size / 1024)} KB)`,
        operator: operator ?? null,
      },
    })

    if (type !== 'PRE_RESTORE') {
      const setting = await ensureBackupSetting()
      await db.backupSetting.update({
        where: { id: setting.id },
        data: { lastBackupAt: new Date(), lastStatus: 'SUCESSO', lastError: null, lastRunBy: operator ?? 'sistema' },
      })
      await applyRetention(setting.retentionCount)
    }

    return { ok: true, filename, sizeBytes: stat.size, durationMs }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido no backup'
    const durationMs = Date.now() - startedAt
    try {
      await db.backupLog.create({
        data: {
          type,
          status: 'FALHA',
          durationMs,
          message,
          operator: operator ?? null,
        },
      })
      if (type !== 'PRE_RESTORE') {
        const setting = await ensureBackupSetting()
        await db.backupSetting.update({
          where: { id: setting.id },
          data: { lastBackupAt: new Date(), lastStatus: 'FALHA', lastError: message, lastRunBy: operator ?? 'sistema' },
        })
      }
    } catch {
      /* não mascara o erro original */
    }
    return { ok: false, error: message, durationMs }
  }
}

/** Regra de retenção: mantém apenas os N backups automáticos/manuais mais recentes */
async function applyRetention(retentionCount: number): Promise<void> {
  const keep = Math.max(1, Math.trunc(retentionCount || 10))
  const files = listBackupFiles()
  const removable = files.slice(keep)
  for (const file of removable) {
    const full = safeBackupPath(file.name)
    if (full) fs.rmSync(full, { force: true })
  }
}

export function listBackupFiles(): BackupFileInfo[] {
  ensureDir()
  const entries = fs.readdirSync(BACKUP_DIR)
  const files: BackupFileInfo[] = []
  for (const name of entries) {
    const full = path.join(BACKUP_DIR, name)
    try {
      const stat = fs.statSync(full)
      if (stat.isFile() && /\.(db|sqlite|sqlite3)$/i.test(name)) {
        files.push({ name, sizeBytes: stat.size, createdAt: stat.mtime.toISOString() })
      }
    } catch {
      /* ignora arquivos sumidos entre readdir e stat */
    }
  }
  return files.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function ensureBackupSetting() {
  return db.backupSetting.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default' },
  })
}

/** Verifica se o agendamento está vencido conforme as regras configuradas */
export function isBackupDue(
  setting: {
    enabled: boolean
    frequencyType: string
    timeOfDay: string | null
    weekday: number | null
    lastBackupAt: Date | null
  },
  now = new Date(),
): { due: boolean; reason: string } {
  if (!setting.enabled) return { due: false, reason: 'Agendamento desativado' }
  if (setting.frequencyType === 'MANUAL') return { due: false, reason: 'Modo manual' }

  const last = setting.lastBackupAt ? new Date(setting.lastBackupAt) : null
  if (!last) return { due: true, reason: 'Nenhum backup anterior registrado' }

  const elapsed = now.getTime() - last.getTime()

  if (setting.frequencyType === 'HOURLY') {
    return elapsed >= 60 * 60 * 1000
      ? { due: true, reason: 'Intervalo de 1 hora atingido' }
      : { due: false, reason: 'Intervalo ainda não atingido' }
  }

  const parseTime = (value: string | null): { h: number; m: number } | null => {
    if (!value) return null
    const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
    if (!match) return null
    const h = Number(match[1])
    const m = Number(match[2])
    if (h > 23 || m > 59) return null
    return { h, m }
  }
  const time = parseTime(setting.timeOfDay)

  if (setting.frequencyType === 'DAILY') {
    if (time) {
      const todayRun = new Date(now.getFullYear(), now.getMonth(), now.getDate(), time.h, time.m, 0, 0)
      return now >= todayRun && last < todayRun
        ? { due: true, reason: `Janela diária de ${setting.timeOfDay} atingida` }
        : { due: false, reason: 'Fora da janela diária' }
    }
    return elapsed >= 24 * 60 * 60 * 1000
      ? { due: true, reason: 'Intervalo de 24 horas atingido' }
      : { due: false, reason: 'Intervalo diário ainda não atingido' }
  }

  if (setting.frequencyType === 'WEEKLY') {
    const weekday = typeof setting.weekday === 'number' && setting.weekday >= 0 && setting.weekday <= 6 ? setting.weekday : 0
    const runTime = time ?? { h: 8, m: 0 }
    const thisWeekRun = new Date(now.getFullYear(), now.getMonth(), now.getDate(), runTime.h, runTime.m, 0, 0)
    const dayDiff = (now.getDay() - weekday + 7) % 7
    thisWeekRun.setDate(thisWeekRun.getDate() - dayDiff)
    return now >= thisWeekRun && last < thisWeekRun
      ? { due: true, reason: 'Janela semanal atingida' }
      : { due: false, reason: 'Fora da janela semanal' }
  }

  return { due: false, reason: 'Frequência desconhecida' }
}

/** Tick do agendamento: executa o backup automático quando as regras indicam */
export async function checkScheduledBackup(operator?: string): Promise<{ ran: boolean; result?: BackupResult; reason: string }> {
  const setting = await ensureBackupSetting()
  const { due, reason } = isBackupDue(setting)
  if (!due) return { ran: false, reason }
  const result = await runBackup('AUTOMATICO', operator ?? 'agendamento')
  return { ran: result.ok, result, reason }
}

/** Restauração: valida o arquivo, cria backup de segurança e substitui o banco ativo */
export async function restoreFromBackup(
  filename: string,
  operator?: string,
): Promise<{ ok: boolean; safetyBackup?: string; error?: string }> {
  ensureDir()
  const source = safeBackupPath(filename)
  if (!source || !fs.existsSync(source)) {
    return { ok: false, error: 'Arquivo de backup não encontrado' }
  }

  const validation = await validateBackupFile(source)
  if (!validation.ok) {
    await db.backupLog.create({
      data: {
        type: 'RESTAURACAO',
        status: 'FALHA',
        filename: path.basename(source),
        message: `Arquivo rejeitado: ${validation.error}`,
        operator: operator ?? null,
      },
    })
    return { ok: false, error: validation.error }
  }

  // Backup de segurança do estado atual antes de sobrescrever
  const safety = await runBackup('PRE_RESTORE', operator)
  if (!safety.ok) {
    return { ok: false, error: `Não foi possível criar o backup de segurança pré-restauração: ${safety.error}` }
  }

  const dbPath = databaseFilePath()
  try {
    await db.$queryRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)')
    await db.$disconnect()
    fs.copyFileSync(source, dbPath)
    // Limpa WAL/SHM antigos: o novo banco já vem compactado (VACUUM INTO)
    for (const suffix of ['-wal', '-shm']) {
      fs.rmSync(dbPath + suffix, { force: true })
    }
    await db.$connect()

    await db.backupLog.create({
      data: {
        type: 'RESTAURACAO',
        status: 'SUCESSO',
        filename: path.basename(source),
        sizeBytes: fs.statSync(dbPath).size,
        message: `Banco restaurado de ${path.basename(source)} (usuários: ${validation.users ?? '?'}). Segurança prévia: ${safety.filename}`,
        operator: operator ?? null,
      },
    })
    return { ok: true, safetyBackup: safety.filename }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao substituir o banco de dados'
    await db.backupLog
      .create({
        data: {
          type: 'RESTAURACAO',
          status: 'FALHA',
          filename: path.basename(source),
          message,
          operator: operator ?? null,
        },
      })
      .catch(() => undefined)
    return { ok: false, error: message }
  }
}

/** Registra um arquivo de backup enviado por upload (validado antes da restauração) */
export async function stageUploadedBackup(originalName: string, data: Buffer, operator?: string): Promise<{ ok: boolean; filename?: string; error?: string }> {
  ensureDir()
  if (data.length < 4096) return { ok: false, error: 'Arquivo muito pequeno para ser um backup válido' }
  const filename = timestampName('bakeryerp-upload')
  const target = path.join(BACKUP_DIR, filename)
  fs.writeFileSync(target, data)
  const validation = await validateBackupFile(target)
  if (!validation.ok) {
    fs.rmSync(target, { force: true })
    return { ok: false, error: validation.error }
  }
  await db.backupLog.create({
    data: {
      type: 'MANUAL',
      status: 'SUCESSO',
      filename,
      sizeBytes: data.length,
      message: `Arquivo enviado (${originalName}) validado e pronto para restauração`,
      operator: operator ?? null,
    },
  })
  return { ok: true, filename }
}
