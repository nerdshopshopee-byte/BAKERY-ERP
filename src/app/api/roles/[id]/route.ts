// PATCH  /api/roles/[id] — edita perfil (nome, descrição, permissões padrão)
// DELETE /api/roles/[id] — exclui perfil (somente se sem usuários e não-sistema)
import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'
import { isValidPermissionKey } from '@/lib/auth/permissions'
import { logAccess, clientIp } from '@/lib/auth/audit'

export const dynamic = 'force-dynamic'

type PatchBody = { name?: string; description?: string; permissionKeys?: string[] }

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardApi(request, 'settings.roles')
  if (!g.ok) return g.response

  try {
    const { id } = await params
    const body = (await request.json().catch(() => null)) as PatchBody | null
    const role = await db.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } })
    if (!role) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })

    const changes: string[] = []
    const data: Record<string, unknown> = {}

    if (body?.name !== undefined && body.name.trim() && body.name.trim() !== role.name) {
      const dupe = await db.role.findUnique({ where: { name: body.name.trim() } })
      if (dupe) return NextResponse.json({ error: 'Já existe um perfil com este nome' }, { status: 409 })
      data.name = body.name.trim()
      changes.push(`nome ${role.name} → ${body.name.trim()}`)
    }
    if (body?.description !== undefined) {
      data.description = body.description?.trim() || null
      changes.push('descrição')
    }

    if (Array.isArray(body?.permissionKeys)) {
      if (role.isAbsolute) {
        return NextResponse.json({ error: 'O perfil Proprietário tem privilégios absolutos e não pode ser alterado' }, { status: 400 })
      }
      for (const key of body.permissionKeys) {
        if (!isValidPermissionKey(key)) {
          return NextResponse.json({ error: `Permissão desconhecida: ${key}` }, { status: 400 })
        }
      }
      changes.push(`matriz de permissões (${body.permissionKeys.length} liberadas)`)
    }

    await db.$transaction(async (tx) => {
      if (Array.isArray(body?.permissionKeys)) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } })
        if (body.permissionKeys.length > 0) {
          await tx.rolePermission.createMany({
            data: body.permissionKeys.map((permissionKey) => ({ roleId: id, permissionKey })),
          })
        }
      }
      await tx.role.update({ where: { id }, data })
    })

    await logAccess({
      action: 'ROLE_UPDATED',
      actor: g.user.name,
      detail: `Perfil ${role.name}: ${changes.join(', ') || 'sem mudanças'}`,
      ip: clientIp(request),
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/roles/[id] PATCH]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardApi(request, 'settings.roles')
  if (!g.ok) return g.response

  try {
    const { id } = await params
    const role = await db.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } })
    if (!role) return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 })
    if (role.isSystem) return NextResponse.json({ error: 'Perfis de sistema não podem ser excluídos' }, { status: 400 })
    if (role._count.users > 0) {
      return NextResponse.json({ error: `Perfil possui ${role._count.users} usuário(s) vinculado(s)` }, { status: 400 })
    }

    await db.role.delete({ where: { id } })

    await logAccess({
      action: 'ROLE_DELETED',
      actor: g.user.name,
      detail: `Perfil "${role.name}" excluído`,
      ip: clientIp(request),
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[api/roles/[id] DELETE]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
