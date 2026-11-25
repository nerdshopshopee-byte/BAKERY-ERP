// POST /api/users/[id]/revoke-sessions — encerra todas as sessões ativas do usuário
import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'
import { revokeAllSessions } from '@/lib/auth/session'
import { logAccess, clientIp } from '@/lib/auth/audit'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardApi(request, 'settings.users')
  if (!g.ok) return g.response

  try {
    const { id } = await params
    const user = await db.user.findUnique({ where: { id } })
    if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

    const count = await revokeAllSessions(id)

    await logAccess({
      action: 'SESSIONS_REVOKED',
      actor: g.user.name,
      userId: id,
      userEmail: user.email,
      detail: `${count} sessão(ões) encerrada(s) pelo administrador`,
      ip: clientIp(request),
    })

    return NextResponse.json({ ok: true, revoked: count })
  } catch (error) {
    console.error('[api/users/[id]/revoke-sessions POST]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
