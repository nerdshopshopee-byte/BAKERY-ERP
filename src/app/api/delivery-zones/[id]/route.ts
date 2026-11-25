// PATCH /api/delivery-zones/[id] — editar taxa/ativo | DELETE — remove zona
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

function strField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function numField(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : typeof value === 'number' ? value : NaN
  return Number.isFinite(n) && n >= 0 ? n : null
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
  console.error('[api/delivery-zones/[id]]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

interface ZonePatchBody {
  name?: string
  fee?: number | string
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
    const body = (await request.json().catch(() => null)) as ZonePatchBody | null
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
    }

    const zone = await db.deliveryZone.findUnique({ where: { id } })
    if (!zone) throw new HttpError(404, 'Região não encontrada')

    const data: Record<string, unknown> = {}
    if (body.name !== undefined) {
      const name = strField(body.name)
      if (!name) throw new HttpError(400, 'Nome é obrigatório')
      data.name = name
    }
    if (body.fee !== undefined) {
      const fee = numField(body.fee)
      if (fee === null) throw new HttpError(400, 'Taxa inválida')
      data.fee = fee
    }
    if (typeof body.active === 'boolean') data.active = body.active

    const updated = await db.deliveryZone.update({ where: { id }, data })
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
    const zone = await db.deliveryZone.findUnique({ where: { id } })
    if (!zone) throw new HttpError(404, 'Região não encontrada')
    await db.deliveryZone.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}
