// BAKERY ERP - Cancelamento de documento fiscal
// POST /api/fiscal/documents/[id]/cancel { reason }  (mín. 15 caracteres)

import { type NextRequest } from 'next/server'
import { guardApi } from '@/lib/auth/guard'
import { cancelDocument, FiscalError } from '@/lib/fiscal/service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardApi(request, 'fiscal.cancel')
  if (!g.ok) return g.response
  const { id } = await params

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const reason = typeof body?.reason === 'string' ? body.reason : ''
    const document = await cancelDocument(id, reason, g.user.name)
    return Response.json(document)
  } catch (error) {
    if (error instanceof FiscalError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[api/fiscal/documents/[id]/cancel]', error)
    return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
