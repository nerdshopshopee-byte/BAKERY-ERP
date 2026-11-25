// GET  /api/roles — lista perfis com permissões e contagem de usuários
// POST /api/roles — cria novo modelo de perfil
import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'
import { isValidPermissionKey } from '@/lib/auth/permissions'
import { logAccess, clientIp } from '@/lib/auth/audit'

export const dynamic = 'force-dynamic'

type Body = { name?: string; description?: string; permissionKeys?: string[] }

export async function GET(request: NextRequest) {
  const g = await guardApi(request, 'settings.users')
  if (!g.ok) return g.response

  try {
    const roles = await db.role.findMany({
      include: {
        permissions: { select: { permissionKey: true } },
        users: { select: { id: true } },
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({
      roles: roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        isSystem: r.isSystem,
        isAbsolute: r.isAbsolute,
        permissionKeys: r.permissions.map((p) => p.permissionKey),
        usersCount: r.users.length,
        createdAt: r.createdAt,
      })),
    })
  } catch (error) {
    console.error('[api/roles GET]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const g = await guardApi(request, 'settings.roles')
  if (!g.ok) return g.response

  try {
    const body = (await request.json().catch(() => null)) as Body | null
    const name = body?.name?.trim() ?? ''
    if (!name) return NextResponse.json({ error: 'Informe o nome do perfil' }, { status: 400 })

    const exists = await db.role.findUnique({ where: { name } })
    if (exists) return NextResponse.json({ error: 'Já existe um perfil com este nome' }, { status: 409 })

    const keys = Array.isArray(body?.permissionKeys) ? body!.permissionKeys! : []
    for (const key of keys) {
      if (!isValidPermissionKey(key)) {
        return NextResponse.json({ error: `Permissão desconhecida: ${key}` }, { status: 400 })
      }
    }

    const role = await db.role.create({
      data: {
        name,
        description: body?.description?.trim() || null,
        isSystem: false,
        isAbsolute: false,
        permissions: { create: keys.map((permissionKey) => ({ permissionKey })) },
      },
      include: { permissions: true },
    })

    await logAccess({
      action: 'ROLE_CREATED',
      actor: g.user.name,
      detail: `Perfil "${name}" criado com ${keys.length} permissões`,
      ip: clientIp(request),
    })

    return NextResponse.json({ ok: true, role: { id: role.id, name: role.name } })
  } catch (error) {
    console.error('[api/roles POST]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
