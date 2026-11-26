// GET /api/backup/download?file=nome.db — download do arquivo de backup
import { type NextRequest } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'
import { guardApi } from '@/lib/auth/guard'
import { BACKUP_DIR } from '@/lib/backup'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const g = await guardApi(request, 'settings.backup')
  if (!g.ok) return g.response

  const file = new URL(request.url).searchParams.get('file')?.trim()
  if (!file) {
    return Response.json({ error: 'Parâmetro file é obrigatório' }, { status: 400 })
  }

  const base = path.basename(file)
  if (!/\.(db|sqlite|sqlite3)$/i.test(base) || base.startsWith('.')) {
    return Response.json({ error: 'Nome de arquivo inválido' }, { status: 400 })
  }
  const full = path.join(BACKUP_DIR, base)
  if (!full.startsWith(BACKUP_DIR) || !fs.existsSync(full)) {
    return Response.json({ error: 'Backup não encontrado' }, { status: 404 })
  }

  const stat = fs.statSync(full)
  if (!stat.isFile()) {
    return Response.json({ error: 'Backup não encontrado' }, { status: 404 })
  }

  const data = fs.readFileSync(full)
  return new Response(data, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(stat.size),
      'Content-Disposition': `attachment; filename="${base}"`,
    },
  })
}
