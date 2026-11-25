// POST /api/auth/change-password — alteração de senha pelo próprio usuário
import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'
import { hashPassword, validatePasswordStrength, verifyPassword } from '@/lib/auth/password'
import { logAccess, clientIp } from '@/lib/auth/audit'

export const dynamic = 'force-dynamic'

type Body = { currentPassword?: string; newPassword?: string }

export async function POST(request: NextRequest) {
  const g = await guardApi(request)
  if (!g.ok) return g.response

  try {
    const body = (await request.json().catch(() => null)) as Body | null
    const current = body?.currentPassword ?? ''
    const next = body?.newPassword ?? ''

    if (!current || !next) {
      return NextResponse.json({ error: 'Informe a senha atual e a nova senha' }, { status: 400 })
    }

    const credential = await db.credential.findUnique({ where: { userId: g.user.id } })
    if (!credential || !verifyPassword(current, credential.passwordHash)) {
      await logAccess({
        action: 'PASSWORD_CHANGED',
        actor: g.user.name,
        userId: g.user.id,
        userEmail: g.user.email,
        result: 'FAILURE',
        detail: 'Senha atual incorreta',
        ip: clientIp(request),
      })
      return NextResponse.json({ error: 'Senha atual incorreta' }, { status: 401 })
    }

    const strengthError = validatePasswordStrength(next)
    if (strengthError) {
      return NextResponse.json({ error: strengthError }, { status: 400 })
    }
    if (verifyPassword(next, credential.passwordHash)) {
      return NextResponse.json({ error: 'A nova senha deve ser diferente da atual' }, { status: 400 })
    }

    await db.credential.update({
      where: { userId: g.user.id },
      data: { passwordHash: hashPassword(next), algorithm: 'ARGON2ID', updatedAt: new Date() },
    })
    await db.user.update({ where: { id: g.user.id }, data: { mustChangePassword: false } })

    await logAccess({
      action: 'PASSWORD_CHANGED',
      actor: g.user.name,
      userId: g.user.id,
      userEmail: g.user.email,
      ip: clientIp(request),
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/auth/change-password]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
