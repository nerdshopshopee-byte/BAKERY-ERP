// BAKERY ERP - Reenvio de documento (rejeitadas e contingência)
// POST /api/fiscal/documents/[id]/retransmit

import { type NextRequest } from 'next/server'
import { guardApi } from '@/lib/auth/guard'
import { retransmit, FiscalError } from '@/lib/fiscal/service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardApi(request, 'fiscal.emit')
  if (!g.ok) return g.response
  const { id } = await params

  try {
    const document = await retransmit(id, g.user.name)
    return Response.json(document)
  } catch (error) {
    if (error instanceof FiscalError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[api/fiscal/documents/[id]/retransmit]', error)
    return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
