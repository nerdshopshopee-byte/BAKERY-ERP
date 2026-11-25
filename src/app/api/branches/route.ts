// GET /api/branches — unidades autorizadas para associação de usuários
import { NextResponse, type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const g = await guardApi(request, 'settings.users')
  if (!g.ok) return g.response

  try {
    const branches = await db.branch.findMany({
      where: { active: true },
      select: { id: true, name: true, address: true, companyId: true },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json({ branches })
  } catch (error) {
    console.error('[api/branches GET]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
