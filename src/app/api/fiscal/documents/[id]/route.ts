// BAKERY ERP - Documento fiscal individual (XML + eventos + DANFE)
// GET /api/fiscal/documents/[id]

import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardApi(request, 'fiscal.view')
  if (!g.ok) return g.response
  const { id } = await params

  const document = await db.fiscalDocument.findUnique({
    where: { id },
    include: { events: { orderBy: { createdAt: 'asc' } } },
  })
  if (!document) return Response.json({ error: 'Documento fiscal não encontrado' }, { status: 404 })
  return Response.json(document)
}
