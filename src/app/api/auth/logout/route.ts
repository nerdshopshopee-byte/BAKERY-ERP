// POST /api/auth/logout — encerra a sessão atual (revogação + limpeza do cookie)
import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { hashToken, SESSION_COOKIE } from '@/lib/auth/session'
import { logAccess } from '@/lib/auth/audit'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value
    if (token) {
      const session = await db.session.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { user: true },
      })
      if (session) {
        await db.session.update({
          where: { id: session.id },
          data: { active: false, revokedAt: new Date() },
        })
        await logAccess({
          action: 'LOGOUT',
          actor: session.user.name,
          userId: session.user.id,
          userEmail: session.user.email,
        })
      }
    }

    const response = NextResponse.json({ ok: true })
    response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
    return response
  } catch (error) {
    console.error('[api/auth/logout]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
