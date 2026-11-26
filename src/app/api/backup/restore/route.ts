// POST /api/backup/restore — restaura o banco a partir de um backup existente (filename)
// ou de um arquivo enviado (multipart 'file'). Cria backup de segurança prévio.
import { type NextRequest } from 'next/server'
import { guardApi } from '@/lib/auth/guard'
import { restoreFromBackup, stageUploadedBackup } from '@/lib/backup'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const g = await guardApi(request, 'settings.backup')
  if (!g.ok) return g.response

  const contentType = request.headers.get('content-type') ?? ''

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('file')
      if (!(file instanceof File)) {
        return Response.json({ error: 'Envie o arquivo de backup no campo "file"' }, { status: 400 })
      }
      if (file.size > 100 * 1024 * 1024) {
        return Response.json({ error: 'Arquivo muito grande (limite de 100 MB)' }, { status: 400 })
      }
      const buffer = Buffer.from(await file.arrayBuffer())
      const staged = await stageUploadedBackup(file.name, buffer, g.user.name)
      if (!staged.ok) {
        return Response.json({ error: staged.error ?? 'Arquivo de backup inválido' }, { status: 400 })
      }
      const result = await restoreFromBackup(staged.filename!, g.user.name)
      if (!result.ok) {
        return Response.json({ error: result.error ?? 'Falha na restauração' }, { status: 500 })
      }
      return Response.json({ ok: true, restoredFrom: staged.filename, safetyBackup: result.safetyBackup })
    }

    const body = (await request.json().catch(() => null)) as { filename?: string } | null
    const filename = body?.filename?.trim()
    if (!filename) {
      return Response.json({ error: 'filename é obrigatório' }, { status: 400 })
    }

    const result = await restoreFromBackup(filename, g.user.name)
    if (!result.ok) {
      return Response.json({ error: result.error ?? 'Falha na restauração' }, { status: 500 })
    }
    return Response.json({ ok: true, restoredFrom: filename, safetyBackup: result.safetyBackup })
  } catch (err) {
    console.error('[api/backup/restore]', err)
    return Response.json({ error: 'Erro interno na restauração' }, { status: 500 })
  }
}
