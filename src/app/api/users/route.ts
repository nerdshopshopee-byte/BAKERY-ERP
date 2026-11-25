// GET /api/users — lista de usuários (Configurações → Usuários e Permissões)
// POST /api/users — cria usuário com perfil, senha inicial e unidades autorizadas
import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'
import { hashPassword, validatePasswordStrength } from '@/lib/auth/password'
import { logAccess, clientIp } from '@/lib/auth/audit'

export const dynamic = 'force-dynamic'

type Body = {
  name?: string
  email?: string
  phone?: string
  roleId?: string
  status?: string
  password?: string
  mustChangePassword?: boolean
  branchIds?: string[]
}

export async function GET(request: NextRequest) {
  const g = await guardApi(request, 'settings.users')
  if (!g.ok) return g.response

  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')?.trim().toLowerCase() ?? ''
    const roleId = searchParams.get('roleId') ?? ''
    const status = searchParams.get('status') ?? ''

    const users = await db.user.findMany({
      where: {
        AND: [
          search
            ? { OR: [{ name: { contains: search } }, { email: { contains: search } }] }
            : {},
          roleId ? { roleId } : {},
          status ? { status } : {},
        ],
      },
      include: {
        role: true,
        sessions: { where: { active: true }, select: { id: true } },
        branchAccess: { include: { branch: { select: { id: true, name: true } } } },
        overrides: { select: { id: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        status: u.status,
        mustChangePassword: u.mustChangePassword,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
        role: {
          id: u.role.id,
          name: u.role.name,
          description: u.role.description,
          isAbsolute: u.role.isAbsolute,
        },
        overridesCount: u.overrides.length,
        activeSessions: u.sessions.length,
        branches: u.branchAccess.map((a) => ({ id: a.branch.id, name: a.branch.name })),
      })),
    })
  } catch (error) {
    console.error('[api/users GET]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const g = await guardApi(request, 'settings.users')
  if (!g.ok) return g.response

  try {
    const body = (await request.json().catch(() => null)) as Body | null
    const name = body?.name?.trim() ?? ''
    const email = body?.email?.trim().toLowerCase() ?? ''
    const roleId = body?.roleId ?? ''
    const status = body?.status ?? 'ACTIVE'
    const password = body?.password?.trim() ?? ''
    const mustChangePassword = body?.mustChangePassword ?? false
    const branchIds = Array.isArray(body?.branchIds) ? body!.branchIds! : []

    if (!name || !email || !roleId) {
      return NextResponse.json({ error: 'Informe nome, e-mail e perfil' }, { status: 400 })
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 })
    }

    const role = await db.role.findUnique({ where: { id: roleId } })
    if (!role) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 400 })

    const exists = await db.user.findUnique({ where: { email } })
    if (exists) return NextResponse.json({ error: 'Já existe um usuário com este e-mail' }, { status: 409 })

    let initialPassword = password
    let forceChange = mustChangePassword
    if (!initialPassword) {
      // Senha inicial gerada automaticamente (entregue pelo proprietário ao funcionário)
      initialPassword = `padaria${Math.floor(1000 + Math.random() * 9000)}`
      forceChange = true
    }
    const strengthError = validatePasswordStrength(initialPassword)
    if (strengthError) return NextResponse.json({ error: strengthError }, { status: 400 })

    const user = await db.user.create({
      data: {
        name,
        email,
        phone: body?.phone?.trim() || null,
        status,
        roleId,
        mustChangePassword: forceChange,
        credential: { create: { passwordHash: hashPassword(initialPassword), algorithm: 'ARGON2ID' } },
        memberships: {
          create: await (async () => {
            const companies = await db.company.findMany({ take: 1 })
            return companies.map((c) => ({ companyId: c.id }))
          })(),
        },
        branchAccess: {
          create: branchIds.length > 0 ? branchIds.map((id) => ({ branchId: id })) : [],
        },
      },
      include: { role: true },
    })

    await logAccess({
      action: 'USER_CREATED',
      actor: g.user.name,
      userId: user.id,
      userEmail: user.email,
      detail: `Usuário criado com perfil ${role.name} · status ${status}`,
      ip: clientIp(request),
    })

    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email },
      initialPassword, // exibida uma única vez para o proprietário
    })
  } catch (error) {
    console.error('[api/users POST]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
