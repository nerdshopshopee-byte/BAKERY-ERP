// GET  /api/users/[id] — detalhe do usuário (perfil, overrides, unidades, logs)
// PATCH /api/users/[id] — edita dados, perfil e situação da conta
import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'
import { revokeAllSessions } from '@/lib/auth/session'
import { logAccess, clientIp, type AuditAction } from '@/lib/auth/audit'

export const dynamic = 'force-dynamic'

type PatchBody = {
  name?: string
  email?: string
  phone?: string | null
  roleId?: string
  status?: string
  branchIds?: string[]
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardApi(request, 'settings.users')
  if (!g.ok) return g.response

  try {
    const { id } = await params
    const user = await db.user.findUnique({
      where: { id },
      include: {
        role: true,
        branchAccess: { include: { branch: { select: { id: true, name: true } } } },
        sessions: { where: { active: true }, select: { id: true, createdAt: true, ip: true, lastSeenAt: true } },
      },
    })
    if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

    const logs = await db.accessLog.findMany({
      where: { OR: [{ userId: id }, { userEmail: user.email }] },
      orderBy: { createdAt: 'desc' },
      take: 20,
    })

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        status: user.status,
        mustChangePassword: user.mustChangePassword,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        role: {
          id: user.role.id,
          name: user.role.name,
          description: user.role.description,
          isAbsolute: user.role.isAbsolute,
        },
        branches: user.branchAccess.map((a) => ({ id: a.branch.id, name: a.branch.name })),
        activeSessions: user.sessions.length,
      },
      logs,
    })
  } catch (error) {
    console.error('[api/users/[id] GET]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardApi(request, 'settings.users')
  if (!g.ok) return g.response

  try {
    const { id } = await params
    const body = (await request.json().catch(() => null)) as PatchBody | null
    const existing = await db.user.findUnique({ where: { id }, include: { role: true } })
    if (!existing) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

    const changes: string[] = []
    const data: Record<string, unknown> = {}

    if (body?.name !== undefined && body.name.trim() && body.name.trim() !== existing.name) {
      data.name = body.name.trim()
      changes.push('nome')
    }
    if (body?.email !== undefined) {
      const email = body.email.trim().toLowerCase()
      if (email && email !== existing.email) {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          return NextResponse.json({ error: 'E-mail inválido' }, { status: 400 })
        }
        const dupe = await db.user.findUnique({ where: { email } })
        if (dupe) return NextResponse.json({ error: 'Já existe um usuário com este e-mail' }, { status: 409 })
        data.email = email
        changes.push('e-mail')
      }
    }
    if (body?.phone !== undefined) {
      data.phone = body.phone?.trim() || null
      changes.push('telefone')
    }
    if (body?.roleId && body.roleId !== existing.roleId) {
      const role = await db.role.findUnique({ where: { id: body.roleId } })
      if (!role) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 400 })
      data.roleId = body.roleId
      changes.push(`perfil ${existing.role.name} → ${role.name}`)
    }
    if (body?.status && body.status !== existing.status) {
      if (!['ACTIVE', 'INACTIVE', 'BLOCKED'].includes(body.status)) {
        return NextResponse.json({ error: 'Situação inválida' }, { status: 400 })
      }
      data.status = body.status
      changes.push(`situação ${existing.status} → ${body.status}`)
    }

    const user = await db.user.update({ where: { id }, data, include: { role: true } })

    // Situação não-ACTIVE revoga sessões imediatamente
    if (data.status && data.status !== 'ACTIVE') {
      await revokeAllSessions(id)
    }

    if (Array.isArray(body?.branchIds)) {
      await db.userBranchAccess.deleteMany({ where: { userId: id } })
      if (body.branchIds.length > 0) {
        await db.userBranchAccess.createMany({
          data: body.branchIds.map((branchId) => ({ userId: id, branchId })),
        })
        changes.push('unidades autorizadas')
      }
    }

    let auditAction: AuditAction = 'USER_UPDATED'
    if (data.status === 'BLOCKED') auditAction = 'USER_BLOCKED'
    else if (data.status === 'ACTIVE' && existing.status !== 'ACTIVE') auditAction = 'USER_UNBLOCKED'

    await logAccess({
      action: auditAction,
      actor: g.user.name,
      userId: user.id,
      userEmail: user.email,
      detail: changes.length > 0 ? `Alterações: ${changes.join(', ')}` : 'Atualização sem mudanças',
      ip: clientIp(request),
    })

    return NextResponse.json({
      ok: true,
      user: { id: user.id, name: user.name, email: user.email, status: user.status, role: user.role.name },
    })
  } catch (error) {
    console.error('[api/users/[id] PATCH]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
