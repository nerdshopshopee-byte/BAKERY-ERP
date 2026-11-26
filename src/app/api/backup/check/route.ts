// POST /api/backup/check — tick do agendamento: verifica as regras de backup e
// executa o backup automático quando a janela configurada está vencida.
// Chamado periodicamente pelo cliente autenticado (qualquer usuário logado basta).
import { type NextRequest } from 'next/server'
import { guardApi } from '@/lib/auth/guard'
import { checkScheduledBackup } from '@/lib/backup'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const g = await guardApi(request)
  if (!g.ok) return g.response

  try {
    const outcome = await checkScheduledBackup(`agendamento (${g.user.name})`)
    return Response.json(outcome)
  } catch (err) {
    console.error('[api/backup/check]', err)
    return Response.json({ ran: false, reason: 'Erro na verificação do agendamento' }, { status: 500 })
  }
}
