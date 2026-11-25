// PATCH /api/payments/[id] — ações: 'confirm' | 'cancel'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

const round2 = (value: number) => Math.round(value * 100) / 100

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
  console.error('[api/payments/[id]]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

interface PaymentActionBody {
  action?: string
}

// Taxa: PIX 0%; outros métodos 5,2% do valor
function computeFee(method: string, amount: number): number {
  return method === 'PIX' ? 0 : round2(amount * 0.052)
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = (await request.json().catch(() => null)) as PaymentActionBody | null
    if (body?.action !== 'confirm' && body?.action !== 'cancel') {
      return Response.json({ error: 'Ação inválida' }, { status: 400 })
    }
    const action = body.action

    if (action === 'cancel') {
      const payment = await db.payment.findUnique({ where: { id } })
      if (!payment) throw new HttpError(404, 'Pagamento não encontrado')
      if (payment.status !== 'PENDENTE') {
        throw new HttpError(400, 'Pagamento não está pendente')
      }
      const updated = await db.payment.update({
        where: { id: payment.id },
        data: { status: 'CANCELADO' },
      })
      return Response.json(updated)
    }

    // action === 'confirm'
    const updated = await db.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id } })
      if (!payment) throw new HttpError(404, 'Pagamento não encontrado')
      if (payment.status !== 'PENDENTE') {
        throw new HttpError(400, 'Pagamento não está pendente')
      }

      const fee = computeFee(payment.method, payment.amount)
      const netAmount = round2(payment.amount - fee)

      const result = await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'PAGO', paidAt: new Date(), fee, netAmount },
      })

      // Pagamento avulso (sem venda vinculada) entra como receita
      if (!payment.saleId) {
        await tx.transaction.create({
          data: {
            type: 'RECEITA',
            category: 'VENDAS',
            description: `Recebimento PIX ${payment.externalId ?? payment.id}`,
            amount: netAmount,
            refId: payment.id,
          },
        })
      }

      return result
    })

    return Response.json(updated)
  } catch (error) {
    return toErrorResponse(error)
  }
}
