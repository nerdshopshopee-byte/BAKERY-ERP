// POST /api/payments/pix — gera cobrança PIX simulada (payload no formato Mercado Pago)
import { randomUUID } from 'crypto'
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

const round2 = (value: number) => Math.round(value * 100) / 100

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (value.trim() !== '' && Number.isFinite(parsed)) return parsed
  }
  return null
}

function strField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function toErrorResponse(error: unknown): Response {
  console.error('[api/payments/pix]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

interface PixBody {
  amount?: number
  description?: string
  customerId?: string
  saleId?: string
  orderId?: string
}

export async function POST(request: NextRequest) {
  try {
    const g = await guardApi(request, 'sales.create')
    if (!g.ok) return g.response

    const body = (await request.json().catch(() => null)) as PixBody | null
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
    }

    const amount = num(body.amount)
    if (amount === null || amount <= 0) {
      return Response.json({ error: 'Valor deve ser maior que zero' }, { status: 400 })
    }

    const roundedAmount = round2(amount)
    const externalId = `MP-${Date.now()}`

    // BR Code (EMV) simulado — mesmo formato de payload do Mercado Pago
    const pixCode = `00020126580014BR.GOV.BCB.PIX0136${randomUUID()}520400005303986540${roundedAmount.toFixed(2)}5802BR5915PADARIA PAO DOURADO6009SAO PAULO62070503***6304ABCD`

    const payment = await db.payment.create({
      data: {
        provider: 'MERCADOPAGO',
        externalId,
        method: 'PIX',
        amount: roundedAmount,
        fee: 0,
        netAmount: roundedAmount,
        status: 'PENDENTE',
        pixCode,
        description: strField(body.description),
        customerId: strField(body.customerId),
        saleId: strField(body.saleId),
        orderId: strField(body.orderId),
      },
    })
    return Response.json(payment)
  } catch (error) {
    return toErrorResponse(error)
  }
}
