// GET /api/auth/session — retorna o usuário autenticado + permissões efetivas
// Fonte única para montar o menu dinâmico no frontend (sem expor dados não autorizados).

import { NextResponse, type NextRequest } from 'next/server'
import { resolveSessionUser } from '@/lib/auth/session'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const user = await resolveSessionUser(request)
    return NextResponse.json({ user: user ?? null })
  } catch (error) {
    console.error('[api/auth/session]', error)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
