// BAKERY ERP - Gestão de sessões (token opaco + cookie httpOnly)
// O banco guarda apenas o hash SHA-256 do token; o cookie nunca expõe ids internos.

import { createHash, randomBytes } from 'crypto'
import type { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { computeEffectivePermissions } from './effective'

export const SESSION_COOKIE = 'bakery_session'
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 dias

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export type SessionUser = {
  id: string
  name: string
  email: string
  phone: string | null
  status: string
  mustChangePassword: boolean
  lastLoginAt: Date | null
  role: { id: string; name: string; description: string | null; isAbsolute: boolean; isSystem: boolean }
  permissions: string[]
  company: { id: string; name: string } | null
  branches: { id: string; name: string }[]
}

/** Cria uma nova sessão revogando as anteriores do usuário (sessão única). */
export async function createSession(userId: string, ip?: string, userAgent?: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  await db.session.updateMany({
    where: { userId, active: true },
    data: { active: false, revokedAt: new Date() },
  })
  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      ip: ip ?? null,
      userAgent: userAgent ?? null,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  })
  return token
}

/** Cookie de sessão seguro (httpOnly, sameSite lax, path raiz). */
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: false, // sandbox sem TLS; cookies secure exigiriam HTTPS
    path: '/',
    maxAge: SESSION_TTL_MS / 1000,
  }
}

/** Resolve o usuário da sessão a partir do cookie da requisição (ou null). */
export async function resolveSessionUser(req: NextRequest): Promise<SessionUser | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return null

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { role: true } } },
  })

  if (!session || !session.active || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
    return null
  }

  const user = session.user
  if (user.status !== 'ACTIVE') return null

  const [{ keys }, memberships, branchAccess] = await Promise.all([
    computeEffectivePermissions(user.id),
    db.userMembership.findMany({
      where: { userId: user.id },
      include: { company: { select: { id: true, name: true, active: true } } },
    }),
    db.userBranchAccess.findMany({
      where: { userId: user.id },
      include: { branch: { select: { id: true, name: true, active: true } } },
    }),
  ])

  // Atualiza heartbeat da sessão (best effort)
  db.session
    .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
    .catch(() => undefined)

  const activeCompany = memberships.find((m) => m.company.active)?.company ?? null
  const branches = branchAccess
    .filter((a) => a.branch.active)
    .map((a) => ({ id: a.branch.id, name: a.branch.name }))

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    role: {
      id: user.roleId,
      name: user.role.name,
      description: user.role.description,
      isAbsolute: user.role.isAbsolute,
      isSystem: user.role.isSystem,
    },
    permissions: keys,
    company: activeCompany ? { id: activeCompany.id, name: activeCompany.name } : null,
    branches,
  }
}

/** Revoga todas as sessões ativas do usuário. */
export async function revokeAllSessions(userId: string): Promise<number> {
  const res = await db.session.updateMany({
    where: { userId, active: true },
    data: { active: false, revokedAt: new Date() },
  })
  return res.count
}
