// POST /api/auth/forgot-password — gera token de recuperação (validade 30 min, uso único)
// Nota: sem serviço de e-mail configurado, o token é retornado para entrega manual
// pelo proprietário (em produção seria enviado por e-mail e nunca exposto na resposta).

import { NextResponse, type NextRequest } from 'next/server'
import { createHash, randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { clientIp, logAccess } from '@/lib/auth/audit'

export const dynamic = 'force-dynamic'

type Body = { email?: string }

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as Body | null
    const email = body?.email?.trim().toLowerCase() ?? ''
    if (!email) {
      return NextResponse.json({ error: 'Informe o e-mail cadastrado' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { email } })

    if (!user || user.status !== 'ACTIVE') {
      await logAccess({
        action: 'PASSWORD_RESET_REQUESTED',
        userEmail: email,
        result: 'FAILURE',
        detail: 'E-mail não encontrado ou usuário inativo',
        ip: clientIp(request),
      })
      return NextResponse.json({ error: 'E-mail não encontrado ou usuário sem acesso ativo' }, { status: 404 })
    }

    // Invalida tokens anteriores ainda válidos
    await db.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } })

    const token = randomBytes(24).toString('hex')
    await db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    })

    await logAccess({
      action: 'PASSWORD_RESET_REQUESTED',
      actor: user.name,
      userId: user.id,
      userEmail: user.email,
      detail: 'Token de recuperação gerado (validade 30 min)',
      ip: clientIp(request),
    })

    return NextResponse.json({
      ok: true,
      message: 'Token gerado. Em produção ele seria enviado por e-mail.',
      resetToken: token, // sandbox: entrega manual
    })
  } catch (error) {
    console.error('[api/auth/forgot-password]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
