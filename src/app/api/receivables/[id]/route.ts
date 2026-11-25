// PATCH /api/receivables/[id] — ação: 'receive' (registrar recebimento)
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
  console.error('[api/receivables/[id]]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

interface ReceivableActionBody {
  action?: string
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await guardApi(request, 'finance.receivables.manage')
    if (!g.ok) return g.response

    const { id } = await params
    const body = (await request.json().catch(() => null)) as ReceivableActionBody | null
    if (body?.action !== 'receive') {
      return Response.json({ error: 'Ação inválida' }, { status: 400 })
    }

    const updated = await db.$transaction(async (tx) => {
      const receivable = await tx.receivable.findUnique({ where: { id } })
      if (!receivable) throw new HttpError(404, 'Conta a receber não encontrada')
      if (receivable.status !== 'PENDENTE') {
        throw new HttpError(400, 'Recebimento já realizado')
      }

      const result = await tx.receivable.update({
        where: { id: receivable.id },
        data: { status: 'RECEBIDO', paidAt: new Date() },
      })

      await tx.transaction.create({
        data: {
          type: 'RECEITA',
          category: 'VENDAS',
          description: `Recebimento - ${receivable.description}`,
          amount: round2(receivable.amount),
          refId: receivable.id,
        },
      })

      // Baixa no saldo fiado do cliente (não fica negativo)
      if (receivable.customerId) {
        const customer = await tx.customer.findUnique({
          where: { id: receivable.customerId },
        })
        if (customer) {
          await tx.customer.update({
            where: { id: customer.id },
            data: {
              creditBalance: Math.max(0, customer.creditBalance - receivable.amount),
            },
          })
        }
      }

      return result
    })

    return Response.json(updated)
  } catch (error) {
    return toErrorResponse(error)
  }
}
