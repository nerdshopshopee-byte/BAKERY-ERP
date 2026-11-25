// POST /api/users/[id]/password — redefinição administrativa de senha
import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'
import { hashPassword, validatePasswordStrength } from '@/lib/auth/password'
import { revokeAllSessions } from '@/lib/auth/session'
import { logAccess, clientIp } from '@/lib/auth/audit'

export const dynamic = 'force-dynamic'

type Body = { newPassword?: string; mustChangePassword?: boolean }

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardApi(request, 'settings.users')
  if (!g.ok) return g.response

  try {
    const { id } = await params
    const body = (await request.json().catch(() => null)) as Body | null
    const newPassword = body?.newPassword?.trim() ?? ''
    const mustChangePassword = body?.mustChangePassword ?? true

    if (!newPassword) return NextResponse.json({ error: 'Informe a nova senha' }, { status: 400 })

    const strengthError = validatePasswordStrength(newPassword)
    if (strengthError) return NextResponse.json({ error: strengthError }, { status: 400 })

    const user = await db.user.findUnique({ where: { id } })
    if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

    await db.credential.upsert({
      where: { userId: id },
      update: { passwordHash: hashPassword(newPassword), algorithm: 'ARGON2ID', updatedAt: new Date() },
      create: { userId: id, passwordHash: hashPassword(newPassword), algorithm: 'ARGON2ID' },
    })

    await db.user.update({ where: { id }, data: { mustChangePassword } })
    await revokeAllSessions(id)

    await logAccess({
      action: 'PASSWORD_ADMIN_RESET',
      actor: g.user.name,
      userId: id,
      userEmail: user.email,
      detail: `Senha redefinida pelo proprietário · sessões revogadas · exige troca no próximo acesso: ${mustChangePassword ? 'sim' : 'não'}`,
      ip: clientIp(request),
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/users/[id]/password POST]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
