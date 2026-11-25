// PATCH /api/orders/[id] — transições de status do pedido (fluxo KDS)
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

function toErrorResponse(error: unknown): Response {
  console.error('[api/orders/[id]]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

const VALID_STATUSES = ['AGUARDANDO', 'PREPARANDO', 'PRONTO', 'ENTREGUE', 'CANCELADO']

// Transições válidas: qualquer status pode ir para CANCELADO
const TRANSITIONS: Record<string, string[]> = {
  AGUARDANDO: ['PREPARANDO', 'CANCELADO'],
  PREPARANDO: ['PRONTO', 'CANCELADO'],
  PRONTO: ['ENTREGUE', 'CANCELADO'],
  ENTREGUE: ['CANCELADO'],
  CANCELADO: [],
}

interface StatusBody {
  status?: string
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = (await request.json().catch(() => null)) as StatusBody | null
    const status = body?.status
    if (!status || typeof status !== 'string' || !VALID_STATUSES.includes(status)) {
      return Response.json({ error: 'Status inválido' }, { status: 400 })
    }

    const order = await db.order.findUnique({ where: { id } })
    if (!order) {
      return Response.json({ error: 'Pedido não encontrado' }, { status: 404 })
    }

    const allowedTransitions = TRANSITIONS[order.status] ?? []
    if (!allowedTransitions.includes(status)) {
      return Response.json(
        { error: `Transição inválida: ${order.status} → ${status}` },
        { status: 400 }
      )
    }

    const now = new Date()
    const data: { status: string; startedAt?: Date; readyAt?: Date; deliveredAt?: Date } = {
      status,
    }
    if (status === 'PREPARANDO') data.startedAt = now
    if (status === 'PRONTO') data.readyAt = now
    if (status === 'ENTREGUE') data.deliveredAt = now

    const updated = await db.order.update({
      where: { id: order.id },
      data,
      include: { items: true },
    })
    return Response.json(updated)
  } catch (error) {
    return toErrorResponse(error)
  }
}
