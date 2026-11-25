// PATCH /api/deliverers/[id] — editar/ativar/desativar | DELETE — remove entregador
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

function strField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

function toErrorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status })
  }
  console.error('[api/deliverers/[id]]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

interface DelivererPatchBody {
  name?: string
  phone?: string
  vehicle?: string
  active?: boolean
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await guardApi(request, 'orders.delivery')
    if (!g.ok) return g.response

    const { id } = await params
    const body = (await request.json().catch(() => null)) as DelivererPatchBody | null
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
    }

    const deliverer = await db.deliverer.findUnique({ where: { id } })
    if (!deliverer) throw new HttpError(404, 'Entregador não encontrado')

    const data: Record<string, unknown> = {}
    if (body.name !== undefined) {
      const name = strField(body.name)
      if (!name) throw new HttpError(400, 'Nome é obrigatório')
      data.name = name
    }
    if (body.phone !== undefined) data.phone = strField(body.phone)
    if (body.vehicle !== undefined) data.vehicle = strField(body.vehicle)
    if (typeof body.active === 'boolean') data.active = body.active

    const updated = await db.deliverer.update({ where: { id }, data })
    return Response.json(updated)
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await guardApi(_request, 'orders.delivery')
    if (!g.ok) return g.response

    const { id } = await params
    const deliverer = await db.deliverer.findUnique({ where: { id } })
    if (!deliverer) throw new HttpError(404, 'Entregador não encontrado')
    await db.deliverer.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}
