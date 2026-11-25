// PATCH /api/payables/[id] — ação: 'pay' (registrar pagamento da conta)
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

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
  console.error('[api/payables/[id]]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

interface PayableActionBody {
  action?: string
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await guardApi(request, 'finance.payables.manage')
    if (!g.ok) return g.response

    const { id } = await params
    const body = (await request.json().catch(() => null)) as PayableActionBody | null
    if (body?.action !== 'pay') {
      return Response.json({ error: 'Ação inválida' }, { status: 400 })
    }

    const updated = await db.$transaction(async (tx) => {
      const payable = await tx.payable.findUnique({ where: { id } })
      if (!payable) throw new HttpError(404, 'Conta a pagar não encontrada')
      if (payable.status !== 'PENDENTE') {
        throw new HttpError(400, 'Conta já está paga')
      }

      const result = await tx.payable.update({
        where: { id: payable.id },
        data: { status: 'PAGO', paidAt: new Date() },
      })

      // A despesa entra no fluxo de caixa somente no momento do pagamento
      await tx.transaction.create({
        data: {
          type: 'DESPESA',
          category: payable.category ?? 'OUTROS',
          description: payable.description,
          amount: round2(payable.amount),
          refId: payable.id,
        },
      })

      return result
    })

    return Response.json(updated)
  } catch (error) {
    return toErrorResponse(error)
  }
}
