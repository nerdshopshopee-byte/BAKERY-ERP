// GET /api/audit-logs — histórico de acessos e operações administrativas
// Ex.: /api/audit-logs?action=LOGIN_OK&search=joao&limit=100
import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const g = await guardApi(request, 'settings.audit')
  if (!g.ok) return g.response

  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') ?? ''
    const search = searchParams.get('search')?.trim().toLowerCase() ?? ''
    const limit = Math.min(Number(searchParams.get('limit') ?? 100) || 100, 300)

    const logs = await db.accessLog.findMany({
      where: {
        AND: [
          action ? { action } : {},
          search
            ? {
                OR: [
                  { actor: { contains: search } },
                  { userEmail: { contains: search } },
                  { detail: { contains: search } },
                ],
              }
            : {},
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })

    return NextResponse.json({ logs })
  } catch (error) {
    console.error('[api/audit-logs GET]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
