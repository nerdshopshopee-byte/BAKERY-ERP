// POST /api/payments/webhook — notificação do provedor (formato Mercado Pago: { data: { id } })
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

const round2 = (value: number) => Math.round(value * 100) / 100

function toErrorResponse(error: unknown): Response {
  console.error('[api/payments/webhook]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

interface WebhookBody {
  data?: {
    id?: string
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as WebhookBody | null
    const externalId = body?.data?.id
    if (!externalId || typeof externalId !== 'string') {
      // Webhook sempre responde 200 para evitar reentregas do provedor
      return Response.json({ received: true })
    }

    const payment = await db.payment.findFirst({
      where: { externalId },
    })

    if (payment && payment.status === 'PENDENTE') {
      await db.$transaction(async (tx) => {
        const fee = payment.method === 'PIX' ? 0 : round2(payment.amount * 0.052)
        const netAmount = round2(payment.amount - fee)

        await tx.payment.update({
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
      })
    }

    return Response.json({ received: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}
