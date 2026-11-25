// PATCH /api/deliveries/[id] — ações: dispatch (em rota), deliver (entregue), fail, assign (entregador)
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

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
  console.error('[api/deliveries/[id]]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

interface DeliveryPatchBody {
  action?: 'dispatch' | 'deliver' | 'fail' | 'assign'
  delivererId?: string
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await guardApi(request, 'orders.delivery')
    if (!g.ok) return g.response

    const { id } = await params
    const body = (await request.json().catch(() => null)) as DeliveryPatchBody | null
    const action = body?.action
    if (action !== 'dispatch' && action !== 'deliver' && action !== 'fail' && action !== 'assign') {
      throw new HttpError(400, 'Ação inválida')
    }

    const delivery = await db.delivery.findUnique({ where: { id } })
    if (!delivery) throw new HttpError(404, 'Entrega não encontrada')

    if (action === 'assign') {
      const delivererId = typeof body?.delivererId === 'string' ? body.delivererId : null
      if (!delivererId) throw new HttpError(400, 'Entregador é obrigatório')
      const deliverer = await db.deliverer.findUnique({ where: { id: delivererId } })
      if (!deliverer) throw new HttpError(404, 'Entregador não encontrado')
      if (!deliverer.active) throw new HttpError(400, 'Entregador está inativo')
      const updated = await db.delivery.update({
        where: { id: delivery.id },
        data: { delivererId: deliverer.id, delivererName: deliverer.name },
      })
      return Response.json(updated)
    }

    if (action === 'dispatch') {
      if (delivery.status !== 'PENDENTE') throw new HttpError(400, 'Só é possível despachar entregas pendentes')
      if (!delivery.delivererId) throw new HttpError(400, 'Atribua um entregador antes de despachar')
      const updated = await db.delivery.update({
        where: { id: delivery.id },
        data: { status: 'EM_ROTA', dispatchedAt: new Date() },
      })
      return Response.json(updated)
    }

    if (action === 'deliver') {
      if (delivery.status !== 'EM_ROTA') throw new HttpError(400, 'A entrega precisa estar em rota para ser concluída')
      const updated = await db.delivery.update({
        where: { id: delivery.id },
        data: { status: 'ENTREGUE', deliveredAt: new Date() },
      })
      return Response.json(updated)
    }

    // action === 'fail'
    if (delivery.status === 'ENTREGUE') throw new HttpError(400, 'Entrega já foi concluída')
    const updated = await db.delivery.update({
      where: { id: delivery.id },
      data: { status: 'FALHOU' },
    })
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
    const delivery = await db.delivery.findUnique({ where: { id } })
    if (!delivery) throw new HttpError(404, 'Entrega não encontrada')
    if (delivery.status === 'EM_ROTA') throw new HttpError(400, 'Não é possível excluir entrega em rota')
    await db.delivery.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}
