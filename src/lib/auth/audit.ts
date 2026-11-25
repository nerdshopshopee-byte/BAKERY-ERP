// BAKERY ERP - Auditoria de acessos e operações administrativas
// Nunca registrar senhas, tokens ou segredos nos logs.

import { db } from '@/lib/db'

export type AuditAction =
  | 'LOGIN_OK'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET_DONE'
  | 'PASSWORD_ADMIN_RESET'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_BLOCKED'
  | 'USER_UNBLOCKED'
  | 'USER_ACTIVATED'
  | 'USER_DEACTIVATED'
  | 'SESSIONS_REVOKED'
  | 'PERMISSIONS_UPDATED'
  | 'ROLE_CREATED'
  | 'ROLE_UPDATED'
  | 'ROLE_DELETED'
  | 'API_DENIED'

export async function logAccess(input: {
  action: AuditAction
  actor?: string | null
  userId?: string | null
  userEmail?: string | null
  result?: 'SUCCESS' | 'FAILURE'
  detail?: string | null
  ip?: string | null
}): Promise<void> {
  try {
    await db.accessLog.create({
      data: {
        action: input.action,
        actor: input.actor ?? null,
        userId: input.userId ?? null,
        userEmail: input.userEmail ?? null,
        result: input.result ?? 'SUCCESS',
        detail: input.detail ?? null,
        ip: input.ip ?? null,
      },
    })
  } catch {
    // Auditoria nunca deve quebrar o fluxo principal
  }
}

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'local'
}

export function userAgent(req: Request): string {
  return req.headers.get('user-agent')?.slice(0, 250) ?? 'desconhecido'
}
