// BAKERY ERP - Histórico de eventos fiscais (rejeições, reenvios, cancelamentos)
// GET /api/fiscal/events?limit=

import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const g = await guardApi(request, 'fiscal.view')
  if (!g.ok) return g.response

  const { searchParams } = new URL(request.url)
  const limit = Math.min(Math.max(Math.trunc(Number(searchParams.get('limit')) || 100), 1), 300)
  const events = await db.fiscalEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return Response.json(events)
}
