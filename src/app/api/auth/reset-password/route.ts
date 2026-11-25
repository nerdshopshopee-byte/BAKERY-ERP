// POST /api/auth/reset-password — redefine a senha usando token de recuperação (uso único)
import { NextResponse, type NextRequest } from 'next/server'
import { createHash } from 'crypto'
import { db } from '@/lib/db'
import { hashPassword, validatePasswordStrength } from '@/lib/auth/password'
import { revokeAllSessions } from '@/lib/auth/session'
import { clientIp, logAccess } from '@/lib/auth/audit'

export const dynamic = 'force-dynamic'

type Body = { token?: string; newPassword?: string }

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Body | null
    const token = body?.token?.trim() ?? ''
    const newPassword = body?.newPassword ?? ''

    if (!token || !newPassword) {
      return NextResponse.json({ error: 'Informe o token e a nova senha' }, { status: 400 })
    }

    const strengthError = validatePasswordStrength(newPassword)
    if (strengthError) {
      return NextResponse.json({ error: strengthError }, { status: 400 })
    }

    const record = await db.passwordResetToken.findUnique({
      where: { tokenHash: createHash('sha256').update(token).digest('hex') },
      include: { user: true },
    })

    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      await logAccess({
        action: 'PASSWORD_RESET_DONE',
        result: 'FAILURE',
        detail: 'Token inválido, expirado ou já utilizado',
        ip: clientIp(request),
      })
      return NextResponse.json({ error: 'Token inválido, expirado ou já utilizado' }, { status: 400 })
    }

    await db.credential.upsert({
      where: { userId: record.userId },
      update: { passwordHash: hashPassword(newPassword), algorithm: 'ARGON2ID', updatedAt: new Date() },
      create: { userId: record.userId, passwordHash: hashPassword(newPassword), algorithm: 'ARGON2ID' },
    })

    await db.$transaction([
      db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      db.user.update({ where: { id: record.userId }, data: { mustChangePassword: false } }),
    ])

    // Segurança: encerra todas as sessões ativas após troca de senha
    await revokeAllSessions(record.userId)

    await logAccess({
      action: 'PASSWORD_RESET_DONE',
      actor: record.user.name,
      userId: record.user.id,
      userEmail: record.user.email,
      detail: 'Senha redefinida via token + sessões revogadas',
      ip: clientIp(request),
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/auth/reset-password]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
