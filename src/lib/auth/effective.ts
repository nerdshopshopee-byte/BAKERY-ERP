// BAKERY ERP - Cálculo de permissões efetivas (perfil + personalizações individuais)
// Precedência: restrições individuais prevalecem sobre permissões herdadas do perfil.
// Perfis absolutos (Proprietário) recebem todos os módulos do catálogo.

import { db } from '@/lib/db'
import { ALL_PERMISSION_KEYS, ALL_PERMISSION_SET } from './permissions'

export type EffectiveResult = {
  keys: string[]
  isAbsolute: boolean
}

export async function computeEffectivePermissions(userId: string): Promise<EffectiveResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      role: {
        select: { isAbsolute: true, permissions: { select: { permissionKey: true } } },
      },
      overrides: {
        select: { permissionKey: true, granted: true, origin: true, expiresAt: true },
      },
    },
  })

  if (!user) return { keys: [], isAbsolute: false }

  if (user.role.isAbsolute) {
    return { keys: [...ALL_PERMISSION_KEYS], isAbsolute: true }
  }

  const effective = new Set<string>(
    user.role.permissions
      .map((p) => p.permissionKey)
      .filter((k) => ALL_PERMISSION_SET.has(k))
  )

  const now = Date.now()
  for (const ov of user.overrides) {
    // Override temporário vencido é ignorado (permissão volta ao estado do perfil)
    if (ov.origin === 'TEMPORARY' && ov.expiresAt && ov.expiresAt.getTime() < now) continue
    if (!ALL_PERMISSION_SET.has(ov.permissionKey)) continue
    if (ov.granted) effective.add(ov.permissionKey)
    else effective.delete(ov.permissionKey)
  }

  return { keys: [...effective], isAbsolute: false }
}
