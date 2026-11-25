// GET /api/cash/movements?sessionId= — movimentos do caixa | POST — sangria/suprimento/ajuste
import { db } from '@/lib/db'

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
  console.error('[api/cash/movements]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

interface MovementBody {
  sessionId?: string
  type?: string
  amount?: number
  description?: string
}

// GET: query sessionId (obrigatório) | limit (default 100)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')
    if (!sessionId) {
      return Response.json({ error: 'sessionId é obrigatório' }, { status: 400 })
    }
    const limit = Math.min(Math.max(Math.trunc(num(searchParams.get('limit')) ?? 100), 1), 500)

    const movements = await db.cashMovement.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    return Response.json(movements)
  } catch (error) {
    return toErrorResponse(error)
  }
}

// POST: { sessionId, type: 'SANGRIA' | 'SUPRIMENTO' | 'AJUSTE', amount > 0, description }
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as MovementBody | null
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
    }

    const sessionId = strField(body.sessionId)
    if (!sessionId) {
      return Response.json({ error: 'sessionId é obrigatório' }, { status: 400 })
    }

    const session = await db.cashSession.findUnique({ where: { id: sessionId } })
    if (!session) {
      return Response.json({ error: 'Sessão não encontrada' }, { status: 404 })
    }
    if (session.status !== 'ABERTO') {
      return Response.json({ error: 'Sessão de caixa não está aberta' }, { status: 400 })
    }

    const type = body.type
    if (type !== 'SANGRIA' && type !== 'SUPRIMENTO' && type !== 'AJUSTE') {
      return Response.json({ error: 'Tipo de movimento inválido' }, { status: 400 })
    }

    const amount = num(body.amount)
    if (amount === null || amount <= 0) {
      return Response.json({ error: 'Valor deve ser maior que zero' }, { status: 400 })
    }

    const description = strField(body.description)

    // SANGRIA não pode deixar o caixa negativo:
    // saldo = abertura + vendas DINHEIRO + suprimentos + sangrias (negativas) + ajustes
    if (type === 'SANGRIA') {
      const movements = await db.cashMovement.findMany({ where: { sessionId: session.id } })
      let balance = session.openingBalance
      for (const movement of movements) {
        if (movement.type === 'VENDA') {
          if (movement.method === 'DINHEIRO') balance += movement.amount
        } else if (movement.type === 'SUPRIMENTO') {
          balance += movement.amount
        } else if (movement.type === 'SANGRIA') {
          balance -= Math.abs(movement.amount)
        } else if (movement.type === 'AJUSTE') {
          balance += movement.amount
        }
      }
      if (balance < amount) {
        return Response.json({ error: 'Saldo insuficiente em caixa' }, { status: 400 })
      }
    }

    // SANGRIA armazenada como negativa; SUPRIMENTO positivo; AJUSTE como enviado
    let storedAmount = amount
    if (type === 'SANGRIA') {
      storedAmount = -Math.abs(amount)
    } else if (type === 'SUPRIMENTO') {
      storedAmount = Math.abs(amount)
    }

    const movement = await db.cashMovement.create({
      data: {
        sessionId: session.id,
        type,
        amount: round2(storedAmount),
        description,
      },
    })
    return Response.json(movement)
  } catch (error) {
    return toErrorResponse(error)
  }
}
