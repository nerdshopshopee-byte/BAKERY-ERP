// GET /api/users/[id]/permissions — permissões do perfil, overrides e efetivas
// PUT /api/users/[id]/permissions — substitui as personalizações individuais (matriz granular)
import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'
import { computeEffectivePermissions } from '@/lib/auth/effective'
import { isValidPermissionKey } from '@/lib/auth/permissions'
import { logAccess, clientIp } from '@/lib/auth/audit'

export const dynamic = 'force-dynamic'

type OverrideInput = { permissionKey: string; granted: boolean; expiresAt?: string | null; origin?: string }

type PutBody = { overrides?: OverrideInput[] }

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardApi(request, 'settings.users')
  if (!g.ok) return g.response

  try {
    const { id } = await params
    const user = await db.user.findUnique({
      where: { id },
      include: {
        role: { include: { permissions: { select: { permissionKey: true } } } },
        overrides: true,
      },
    })
    if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

    const effective = await computeEffectivePermissions(id)

    return NextResponse.json({
      role: { id: user.role.id, name: user.role.name, isAbsolute: user.role.isAbsolute },
      rolePermissions: user.role.permissions.map((p) => p.permissionKey),
      overrides: user.overrides.map((o) => ({
        permissionKey: o.permissionKey,
        granted: o.granted,
        origin: o.origin,
        grantedBy: o.grantedBy,
        expiresAt: o.expiresAt,
      })),
      effective: effective.keys,
    })
  } catch (error) {
    console.error('[api/users/[id]/permissions GET]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardApi(request, 'settings.permissions')
  if (!g.ok) return g.response

  try {
    const { id } = await params
    const body = (await request.json().catch(() => null)) as PutBody | null
    const user = await db.user.findUnique({ where: { id }, include: { role: true } })
    if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

    const inputs = Array.isArray(body?.overrides) ? body!.overrides! : []
    const seen = new Set<string>()
    for (const input of inputs) {
      if (!isValidPermissionKey(input.permissionKey)) {
        return NextResponse.json({ error: `Permissão desconhecida: ${input.permissionKey}` }, { status: 400 })
      }
      if (seen.has(input.permissionKey)) {
        return NextResponse.json({ error: `Permissão duplicada: ${input.permissionKey}` }, { status: 400 })
      }
      seen.add(input.permissionKey)
    }

    const validInputs = inputs
      .filter((i) => i.granted !== undefined && typeof i.granted === 'boolean')
      .map((i) => ({
        permissionKey: i.permissionKey,
        granted: i.granted,
        origin: i.expiresAt ? 'TEMPORARY' : 'INDIVIDUAL',
        expiresAt: i.expiresAt ? new Date(i.expiresAt) : null,
        grantedBy: g.user.name,
      }))

    const allowed = user.role.isAbsolute
      ? validInputs.filter((i) => !i.granted) // em perfis absolutos só restrições individuais são permitidas
      : validInputs

    await db.$transaction([
      db.userPermissionOverride.deleteMany({ where: { userId: id } }),
      ...allowed.map((o) =>
        db.userPermissionOverride.create({
          data: {
            userId: id,
            permissionKey: o.permissionKey,
            granted: o.granted,
            origin: o.origin,
            expiresAt: o.expiresAt,
            grantedBy: o.grantedBy,
          },
        })
      ),
    ])

    const effective = await computeEffectivePermissions(id)

    await logAccess({
      action: 'PERMISSIONS_UPDATED',
      actor: g.user.name,
      userId: user.id,
      userEmail: user.email,
      detail: `Perfil: ${user.role.name} · ${allowed.filter((o) => o.granted).length} concessões · ${allowed.filter((o) => !o.granted).length} restrições · ${effective.keys.length} permissões efetivas`,
      ip: clientIp(request),
    })

    return NextResponse.json({ ok: true, effective: effective.keys })
  } catch (error) {
    console.error('[api/users/[id]/permissions PUT]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
