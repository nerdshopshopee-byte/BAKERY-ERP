// PATCH /api/sales/[id] — ações sobre a venda (action: 'cancel')
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
  console.error('[api/sales/[id]]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

interface CancelBody {
  action?: string
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = (await request.json().catch(() => null)) as CancelBody | null

    const g = await guardApi(request, 'sales.cancel')
    if (!g.ok) return g.response

    if (body?.action !== 'cancel') {
      return Response.json({ error: 'Ação inválida' }, { status: 400 })
    }

    const sale = await db.$transaction(async (tx) => {
      const existing = await tx.sale.findUnique({
        where: { id },
        include: { payments: true },
      })
      if (!existing) throw new HttpError(404, 'Venda não encontrada')
      if (existing.status !== 'CONCLUIDA') {
        throw new HttpError(400, 'Apenas vendas concluídas podem ser canceladas')
      }

      const updated = await tx.sale.update({
        where: { id: existing.id },
        data: { status: 'CANCELADA' },
      })

      // Estorno no caixa quando houve pagamento em dinheiro e há sessão do dia aberta
      const paidCash = existing.payments.some((payment) => payment.method === 'DINHEIRO')
      if (paidCash) {
        const openSession = await tx.cashSession.findFirst({ where: { status: 'ABERTO' } })
        if (openSession) {
          await tx.cashMovement.create({
            data: {
              sessionId: openSession.id,
              type: 'AJUSTE',
              amount: -existing.total,
              description: `Cancelamento venda ${existing.code}`,
              refId: existing.id,
            },
          })
        }
      }

      await tx.transaction.create({
        data: {
          type: 'DESPESA',
          category: 'OUTROS',
          description: `Cancelamento venda ${existing.code}`,
          amount: existing.total,
          refId: existing.id,
        },
      })

      // Cancela pedido vinculado que ainda não foi entregue
      const linkedOrders = await tx.order.findMany({
        where: { saleId: existing.id, status: { in: ['AGUARDANDO', 'PREPARANDO'] } },
      })
      for (const order of linkedOrders) {
        await tx.order.update({ where: { id: order.id }, data: { status: 'CANCELADO' } })
      }

      return updated
    })

    const fullSale = await db.sale.findUnique({
      where: { id: sale.id },
      include: { items: true, payments: true },
    })
    return Response.json(fullSale)
  } catch (error) {
    return toErrorResponse(error)
  }
}
