// GET /api/backup — configurações + arquivos + histórico
// POST /api/backup — executa backup imediatamente
// PUT /api/backup — atualiza as regras de backup
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'
import {
  ensureBackupSetting,
  listBackupFiles,
  runBackup,
  type BackupFrequencyType,
} from '@/lib/backup'

export const dynamic = 'force-dynamic'

const VALID_FREQUENCIES: BackupFrequencyType[] = ['MANUAL', 'HOURLY', 'DAILY', 'WEEKLY']

export async function GET(request: NextRequest) {
  const g = await guardApi(request, 'settings.backup')
  if (!g.ok) return g.response

  try {
    const setting = await ensureBackupSetting()
    const [files, logs] = await Promise.all([
      Promise.resolve(listBackupFiles()),
      db.backupLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
    ])
    return Response.json({ setting, files, logs })
  } catch (err) {
    console.error('[api/backup]', err)
    return Response.json({ error: 'Erro ao carregar dados de backup' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const g = await guardApi(request, 'settings.backup')
  if (!g.ok) return g.response

  const result = await runBackup('MANUAL', g.user.name)
  if (!result.ok) {
    return Response.json({ error: result.error ?? 'Falha no backup' }, { status: 500 })
  }
  return Response.json(result)
}

export async function PUT(request: NextRequest) {
  const g = await guardApi(request, 'settings.backup')
  if (!g.ok) return g.response

  try {
    const body = (await request.json().catch(() => null)) as {
      enabled?: boolean
      frequencyType?: string
      timeOfDay?: string | null
      weekday?: number | null
      retentionCount?: number
      notifyOnFailure?: boolean
    } | null
    if (!body) return Response.json({ error: 'Corpo da requisição inválido' }, { status: 400 })

    const setting = await ensureBackupSetting()
    const data: Record<string, unknown> = {}

    if (typeof body.enabled === 'boolean') data.enabled = body.enabled

    if (typeof body.frequencyType === 'string') {
      const freq = body.frequencyType.toUpperCase()
      if (!VALID_FREQUENCIES.includes(freq as BackupFrequencyType)) {
        return Response.json({ error: 'Frequência inválida' }, { status: 400 })
      }
      data.frequencyType = freq
    }

    if (body.timeOfDay !== undefined) {
      const t = body.timeOfDay
      if (t === null || t === '') {
        data.timeOfDay = null
      } else if (typeof t === 'string' && /^([01]?\d|2[0-3]):([0-5]\d)$/.test(t.trim())) {
        data.timeOfDay = t.trim().padStart(5, '0')
      } else {
        return Response.json({ error: 'Horário inválido (use HH:MM)' }, { status: 400 })
      }
    }

    if (body.weekday !== undefined) {
      if (body.weekday === null) {
        data.weekday = null
      } else if (typeof body.weekday === 'number' && Number.isInteger(body.weekday) && body.weekday >= 0 && body.weekday <= 6) {
        data.weekday = body.weekday
      } else {
        return Response.json({ error: 'Dia da semana inválido' }, { status: 400 })
      }
    }

    if (body.retentionCount !== undefined) {
      const n = Number(body.retentionCount)
      if (!Number.isFinite(n) || n < 1 || n > 200) {
        return Response.json({ error: 'Retenção deve estar entre 1 e 200' }, { status: 400 })
      }
      data.retentionCount = Math.trunc(n)
    }

    if (typeof body.notifyOnFailure === 'boolean') data.notifyOnFailure = body.notifyOnFailure

    const updated = await db.backupSetting.update({ where: { id: setting.id }, data })
    return Response.json(updated)
  } catch (err) {
    console.error('[api/backup PUT]', err)
    return Response.json({ error: 'Erro ao salvar regras de backup' }, { status: 500 })
  }
}
