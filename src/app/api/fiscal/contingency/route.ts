// BAKERY ERP - Contingência off-line
// POST /api/fiscal/contingency { enabled, reason? }

import { type NextRequest } from 'next/server'
import { guardApi } from '@/lib/auth/guard'
import { setContingency, FiscalError } from '@/lib/fiscal/service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const g = await guardApi(request, 'fiscal.config')
  if (!g.ok) return g.response

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const enabled = body?.enabled === true
    const reason = typeof body?.reason === 'string' ? body.reason : null
    const config = await setContingency(enabled, reason, g.user.name)
    return Response.json(config)
  } catch (error) {
    if (error instanceof FiscalError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[api/fiscal/contingency]', error)
    return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
