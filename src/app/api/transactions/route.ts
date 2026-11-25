// GET /api/transactions — fluxo financeiro | POST — lançamento manual
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
  console.error('[api/transactions]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

interface TransactionBody {
  type?: string
  category?: string
  description?: string
  amount?: number
  date?: string
}

// GET: query type ('RECEITA' | 'DESPESA') | limit (default 100) — ordenado por date desc
export async function GET(request: NextRequest) {
  try {
    const g = await guardApi(request, 'finance.cashflow')
    if (!g.ok) return g.response

    const { searchParams } = new URL(request.url)
    const limit = Math.min(Math.max(Math.trunc(num(searchParams.get('limit')) ?? 100), 1), 500)
    const type = searchParams.get('type')

    const where =
      type === 'RECEITA' || type === 'DESPESA' ? { type } : undefined

    const transactions = await db.transaction.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: limit,
    })
    return Response.json(transactions)
  } catch (error) {
    return toErrorResponse(error)
  }
}

// POST: { type: 'RECEITA' | 'DESPESA', category?, description, amount > 0, date? }
export async function POST(request: NextRequest) {
  try {
    const g = await guardApi(request, 'finance.cashflow')
    if (!g.ok) return g.response

    const body = (await request.json().catch(() => null)) as TransactionBody | null
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
    }

    if (body.type !== 'RECEITA' && body.type !== 'DESPESA') {
      return Response.json({ error: 'Tipo deve ser RECEITA ou DESPESA' }, { status: 400 })
    }

    const description = strField(body.description)
    if (!description) {
      return Response.json({ error: 'Descrição é obrigatória' }, { status: 400 })
    }

    const amount = num(body.amount)
    if (amount === null || amount <= 0) {
      return Response.json({ error: 'Valor deve ser maior que zero' }, { status: 400 })
    }

    let date = new Date()
    if (body.date) {
      const parsed = new Date(body.date)
      if (!Number.isNaN(parsed.getTime())) date = parsed
    }

    const transaction = await db.transaction.create({
      data: {
        type: body.type,
        category: strField(body.category),
        description,
        amount: round2(amount),
        date,
      },
    })
    return Response.json(transaction)
  } catch (error) {
    return toErrorResponse(error)
  }
}
