// BAKERY ERP - Guard de autorização para as rotas de API
// Verifica identidade autenticada, situação da conta e permissão necessária.
// A segurança NÃO depende de esconder botões: toda rota checa permissão no backend.

import { NextResponse, type NextRequest } from 'next/server'
import { resolveSessionUser, type SessionUser } from './session'
import { clientIp, logAccess } from './audit'

export type GuardOk = { ok: true; user: SessionUser }
export type GuardFail = { ok: false; response: NextResponse }
export type GuardResult = GuardOk | GuardFail

function unauthorized(message = 'Não autenticado. Faça login para continuar.'): NextResponse {
  return NextResponse.json({ error: message, code: 'UNAUTHENTICATED' }, { status: 401 })
}

function forbidden(message: string, required?: string): NextResponse {
  return NextResponse.json(
    { error: message, code: 'FORBIDDEN', required: required ?? null },
    { status: 403 }
  )
}

/**
 * Protege um endpoint:
 * - guardApi(req)              -> exige apenas sessão ativa
 * - guardApi(req, 'sales.create') -> exige sessão + permissão específica
 * - guardApiAny(req, ['sales.view','inventory.view']) -> exige sessão + QUALQUER uma das permissões
 * Perfis absolutos (Proprietário) passam por qualquer permissão.
 */
export async function guardApi(req: NextRequest, permission?: string): Promise<GuardResult> {
  return guardApiAny(req, permission ? [permission] : [])
}

export async function guardApiAny(req: NextRequest, permissions: string[]): Promise<GuardResult> {
  const user = await resolveSessionUser(req)
  const ip = clientIp(req)

  if (!user) {
    return { ok: false, response: unauthorized() }
  }

  if (user.status !== 'ACTIVE') {
    return { ok: false, response: forbidden('Usuário bloqueado ou inativo. Contate o proprietário.') }
  }

  if (
    permissions.length > 0 &&
    !user.role.isAbsolute &&
    !permissions.some((p) => user.permissions.includes(p))
  ) {
    await logAccess({
      action: 'API_DENIED',
      actor: user.name,
      userId: user.id,
      userEmail: user.email,
      result: 'FAILURE',
      detail: `Nenhuma das permissões necessárias: ${permissions.join(', ')}`,
      ip,
    })
    return {
      ok: false,
      response: forbidden(`Acesso negado. Você não tem nenhuma das permissões necessárias (${permissions.join(', ')}) para esta operação.`, permissions[0]),
    }
  }

  return { ok: true, user }
}
