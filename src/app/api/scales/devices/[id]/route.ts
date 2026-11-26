// PATCH  /api/scales/devices/[id] — atualiza equipamento (guard: scales.manage)
// DELETE /api/scales/devices/[id] — remove equipamento (guard: scales.manage)
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guardApi(request, 'scales.manage')
  if (!g.ok) return g.response

  const { id } = await ctx.params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  const existing = await db.scaleDevice.findUnique({ where: { id } })
  if (!existing) return Response.json({ error: 'Equipamento não encontrado' }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
  if (typeof body.model === 'string') data.model = body.model.trim() || null
  if (typeof body.brand === 'string' && body.brand.trim()) data.brand = body.brand.trim().toUpperCase()
  if (typeof body.connectionType === 'string' && body.connectionType.trim()) {
    data.connectionType = body.connectionType.trim().toUpperCase()
  }
  if (body.connectionConfig !== undefined) {
    data.connectionConfig =
      body.connectionConfig && typeof body.connectionConfig === 'object'
        ? JSON.stringify(body.connectionConfig)
        : null
  }
  if (body.profileId !== undefined) data.profileId = typeof body.profileId === 'string' && body.profileId ? body.profileId : null
  if (body.branchId !== undefined) data.branchId = typeof body.branchId === 'string' && body.branchId ? body.branchId : null
  if (typeof body.department === 'string') data.department = body.department.trim() || null
  if (typeof body.notes === 'string') data.notes = body.notes.trim() || null
  if (typeof body.active === 'boolean') {
    data.active = body.active
    data.status = body.active ? existing.status : 'DISABLED'
  }

  const updated = await db.scaleDevice.update({ where: { id }, data, include: { profile: true } })
  return Response.json(updated)
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guardApi(request, 'scales.manage')
  if (!g.ok) return g.response

  const { id } = await ctx.params
  const existing = await db.scaleDevice.findUnique({ where: { id } })
  if (!existing) return Response.json({ error: 'Equipamento não encontrado' }, { status: 404 })

  await db.scaleDevice.delete({ where: { id } })
  return Response.json({ ok: true })
}
