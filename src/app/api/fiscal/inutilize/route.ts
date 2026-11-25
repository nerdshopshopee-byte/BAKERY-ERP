// BAKERY ERP - Inutilização de faixa de numeração
// POST /api/fiscal/inutilize { type, serie, from, to, reason }

import { type NextRequest } from 'next/server'
import { guardApi } from '@/lib/auth/guard'
import { inutilizeRange, FiscalError } from '@/lib/fiscal/service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const g = await guardApi(request, 'fiscal.inutilize')
  if (!g.ok) return g.response

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const type = body?.type === 'NFE' ? 'NFE' : 'NFCE'
    const serie = Math.trunc(Number(body?.serie))
    const from = Math.trunc(Number(body?.from))
    const to = Math.trunc(Number(body?.to))
    const reason = typeof body?.reason === 'string' ? body.reason : ''
    if (!Number.isInteger(serie) || serie < 1) {
      return Response.json({ error: 'Série inválida' }, { status: 400 })
    }
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < 1) {
      return Response.json({ error: 'Faixa de números inválida' }, { status: 400 })
    }
    const document = await inutilizeRange(type, serie, from, to, reason, g.user.name)
    return Response.json(document)
  } catch (error) {
    if (error instanceof FiscalError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[api/fiscal/inutilize]', error)
    return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
