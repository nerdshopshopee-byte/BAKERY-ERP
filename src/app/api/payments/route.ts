// GET /api/payments — pagamentos (Mercado Pago simulado)
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (value.trim() !== '' && Number.isFinite(parsed)) return parsed
  }
  return null
}

function toErrorResponse(error: unknown): Response {
  console.error('[api/payments]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

// GET: query status | limit (default 100)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(Math.max(Math.trunc(num(searchParams.get('limit')) ?? 100), 1), 500)
    const status = searchParams.get('status')

    const payments = await db.payment.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
    return Response.json(payments)
  } catch (error) {
    return toErrorResponse(error)
  }
}
