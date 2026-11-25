// GET /api/permissions — catálogo central de permissões (módulos → ações)
import { NextResponse, type NextRequest } from 'next/server'
import { guardApi } from '@/lib/auth/guard'
import { PERMISSION_MODULES, ALL_PERMISSION_KEYS } from '@/lib/auth/permissions'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const g = await guardApi(request)
  if (!g.ok) return g.response

  return NextResponse.json({ modules: PERMISSION_MODULES, allKeys: ALL_PERMISSION_KEYS })
}
