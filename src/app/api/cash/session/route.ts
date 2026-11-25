// GET /api/cash/session — sessão atual e última sessão | POST — abrir/fechar caixa
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
  console.error('[api/cash/session]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

interface SessionBody {
  action?: string
  operatorName?: string
  openingBalance?: number
  sessionId?: string
  closingBalance?: number
  expectedBalance?: number
}

// GET: { current: sessão ABERTO mais recente ou null, last: última FECHADO ou null }
export async function GET() {
  try {
    const current = await db.cashSession.findFirst({
      where: { status: 'ABERTO' },
      orderBy: { openedAt: 'desc' },
    })
    const last = await db.cashSession.findFirst({
      where: { status: 'FECHADO' },
      orderBy: { closedAt: 'desc' },
    })
    return Response.json({ current, last })
  } catch (error) {
    return toErrorResponse(error)
  }
}

// POST: action 'open' | 'close'
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as SessionBody | null
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
    }

    if (body.action === 'open') {
      const operatorName = strField(body.operatorName)
      if (!operatorName) {
        return Response.json({ error: 'Nome do operador é obrigatório' }, { status: 400 })
      }
      const openingBalance = num(body.openingBalance)
      if (openingBalance === null || openingBalance < 0) {
        return Response.json(
          { error: 'Saldo de abertura deve ser um número maior ou igual a zero' },
          { status: 400 }
        )
      }

      const openSession = await db.cashSession.findFirst({ where: { status: 'ABERTO' } })
      if (openSession) {
        return Response.json({ error: 'Já existe uma sessão de caixa aberta' }, { status: 400 })
      }

      const session = await db.cashSession.create({
        data: {
          operatorName,
          openingBalance: round2(openingBalance),
          status: 'ABERTO',
        },
      })
      return Response.json(session)
    }

    if (body.action === 'close') {
      const sessionId = strField(body.sessionId)
      if (!sessionId) {
        return Response.json({ error: 'sessionId é obrigatório' }, { status: 400 })
      }
      const session = await db.cashSession.findUnique({ where: { id: sessionId } })
      if (!session) {
        return Response.json({ error: 'Sessão não encontrada' }, { status: 404 })
      }
      if (session.status !== 'ABERTO') {
        return Response.json({ error: 'Sessão já está fechada' }, { status: 400 })
      }

      const closingBalance = num(body.closingBalance)
      if (closingBalance === null) {
        return Response.json({ error: 'closingBalance é obrigatório' }, { status: 400 })
      }
      const expectedBalance = num(body.expectedBalance)
      if (expectedBalance === null) {
        return Response.json({ error: 'expectedBalance é obrigatório' }, { status: 400 })
      }

      const updated = await db.cashSession.update({
        where: { id: session.id },
        data: {
          status: 'FECHADO',
          closedAt: new Date(),
          closingBalance: round2(closingBalance),
          expectedBalance: round2(expectedBalance),
        },
      })
      return Response.json(updated)
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
