// POST /api/auth/login — autenticação individual (e-mail + senha, Argon2id)
import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword } from '@/lib/auth/password'
import { createSession, sessionCookieOptions, SESSION_COOKIE } from '@/lib/auth/session'
import { computeEffectivePermissions } from '@/lib/auth/effective'
import { clientIp, logAccess, userAgent } from '@/lib/auth/audit'

export const dynamic = 'force-dynamic'

type LoginBody = { email?: string; password?: string }

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as LoginBody | null
    const email = body?.email?.trim().toLowerCase() ?? ''
    const password = body?.password ?? ''
    const ip = clientIp(request)
    const ua = userAgent(request)

    if (!email || !password) {
      return NextResponse.json({ error: 'Informe e-mail e senha' }, { status: 400 })
    }

    const user = await db.user.findUnique({
      where: { email },
      include: { role: true },
    })

    // Mensagem genérica para não revelar existência de contas
    if (!user) {
      await logAccess({ action: 'LOGIN_FAILED', userEmail: email, result: 'FAILURE', detail: 'Usuário inexistente', ip })
      return NextResponse.json({ error: 'E-mail ou senha inválidos' }, { status: 401 })
    }

    if (user.status === 'BLOCKED') {
      await logAccess({ action: 'LOGIN_FAILED', actor: user.name, userId: user.id, userEmail: user.email, result: 'FAILURE', detail: 'Usuário bloqueado', ip })
      return NextResponse.json({ error: 'Usuário bloqueado. Contate o proprietário do sistema.' }, { status: 403 })
    }

    if (user.status === 'INACTIVE') {
      await logAccess({ action: 'LOGIN_FAILED', actor: user.name, userId: user.id, userEmail: user.email, result: 'FAILURE', detail: 'Usuário inativo', ip })
      return NextResponse.json({ error: 'Usuário inativo. Contate o proprietário do sistema.' }, { status: 403 })
    }

    const credential = await db.credential.findUnique({ where: { userId: user.id } })
    if (!credential || !verifyPassword(password, credential.passwordHash)) {
      await logAccess({ action: 'LOGIN_FAILED', actor: user.name, userId: user.id, userEmail: user.email, result: 'FAILURE', detail: 'Senha incorreta', ip })
      return NextResponse.json({ error: 'E-mail ou senha inválidos' }, { status: 401 })
    }

    const token = await createSession(user.id, ip, ua)

    const [memberships, branchAccess, effective] = await Promise.all([
      db.userMembership.findMany({
        where: { userId: user.id },
        include: { company: { select: { id: true, name: true, active: true } } },
      }),
      db.userBranchAccess.findMany({
        where: { userId: user.id },
        include: { branch: { select: { id: true, name: true, active: true } } },
      }),
      computeEffectivePermissions(user.id),
    ])

    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

    await logAccess({
      action: 'LOGIN_OK',
      actor: user.name,
      userId: user.id,
      userEmail: user.email,
      detail: `Perfil: ${user.role.name}${effective.keys.length > 0 ? ` · ${effective.keys.length} permissões efetivas` : ''}`,
      ip,
    })

    const activeCompany = memberships.find((m) => m.company.active)?.company ?? null
    const branches = branchAccess
      .filter((a) => a.branch.active)
      .map((a) => ({ id: a.branch.id, name: a.branch.name }))

    const response = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        status: user.status,
        mustChangePassword: user.mustChangePassword,
        lastLoginAt: new Date(),
        role: {
          id: user.role.id,
          name: user.role.name,
          description: user.role.description,
          isAbsolute: user.role.isAbsolute,
          isSystem: user.role.isSystem,
        },
        permissions: effective.keys,
        company: activeCompany ? { id: activeCompany.id, name: activeCompany.name } : null,
        branches,
      },
    })
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions())
    return response
  } catch (error) {
    console.error('[api/auth/login]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
