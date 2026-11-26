// BAKERY ERP - Auto-bootstrap das contas de autenticação
// Garante que o sistema nunca fique sem contas de acesso: se a tabela de
// usuários estiver vazia (banco recriado via db:push, seed não executado etc.),
// recria automaticamente empresa, unidades, perfis e usuários de demonstração
// na primeira tentativa de login. Idempotente e seguro contra concorrência.

import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth/password'
import { DEFAULT_ROLES } from '@/lib/auth/default-roles'

const DAY = 24 * 60 * 60 * 1000

let bootstrapPromise: Promise<boolean> | null = null

/**
 * Executa o bootstrap apenas uma vez por processo. Retorna true se os dados
 * de autenticação foram criados agora, false se o banco já possui usuários.
 */
export function ensureDemoAuthData(): Promise<boolean> {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrap().catch((error) => {
      // Libera para nova tentativa em caso de falha transitória (ex.: lock do SQLite)
      bootstrapPromise = null
      throw error
    })
  }
  return bootstrapPromise
}

async function bootstrap(): Promise<boolean> {
  const existing = await db.user.count()
  if (existing > 0) return false

  console.log('[auth/bootstrap] Banco sem usuários — criando perfis e contas de demonstração...')

  // Empresa e unidades
  const companyCount = await db.company.count()
  const company =
    companyCount > 0
      ? await db.company.findFirst()
      : await db.company.create({
          data: {
            name: 'Padaria Pão Dourado',
            legalName: 'Pão Dourado Panificadora LTDA',
            cnpj: '12.345.678/0001-95',
          },
        })

  let branches = await db.branch.findMany({ where: { companyId: company!.id } })
  if (branches.length === 0) {
    await db.branch.create({
      data: {
        companyId: company!.id,
        name: 'Unidade Centro',
        address: 'Rua das Flores, 120 - Centro',
        phone: '(11) 3333-1200',
      },
    })
    await db.branch.create({
      data: {
        companyId: company!.id,
        name: 'Unidade Jardim América',
        address: 'Av. Brasil, 1450 - Jardim América',
        phone: '(11) 3333-1450',
      },
    })
    branches = await db.branch.findMany({ where: { companyId: company!.id } })
  }
  const branchCentro = branches[0]!
  const branchJardim = branches[1] ?? branchCentro

  // Perfis de sistema
  const roleIds = new Map<string, string>()
  for (const def of DEFAULT_ROLES) {
    const existingRole = await db.role.findFirst({ where: { name: def.name } })
    if (existingRole) {
      roleIds.set(def.name, existingRole.id)
      continue
    }
    const role = await db.role.create({
      data: {
        name: def.name,
        description: def.description,
        isSystem: def.isSystem,
        isAbsolute: def.isAbsolute,
        permissions: { create: def.permissionKeys.map((permissionKey) => ({ permissionKey })) },
      },
    })
    roleIds.set(def.name, role.id)
  }

  const grantBranches = async (userId: string, branchIds: string[]) => {
    await db.userBranchAccess.createMany({ data: branchIds.map((branchId) => ({ userId, branchId })) })
    await db.userMembership.create({ data: { userId, companyId: company!.id } })
  }

  const createUser = (
    name: string,
    email: string,
    phone: string | null,
    status: 'ACTIVE' | 'BLOCKED',
    roleName: string,
    password: string,
  ) =>
    db.user.create({
      data: {
        name,
        email,
        phone,
        status,
        roleId: roleIds.get(roleName)!,
        credential: { create: { passwordHash: hashPassword(password), algorithm: 'ARGON2ID' } },
      },
    })

  const owner = await createUser('Ricardo Alves', 'owner@bakeryerp.com.br', '(11) 98888-0001', 'ACTIVE', 'PROPRIETARIO', 'bakery2026')
  await grantBranches(owner.id, [branchCentro.id, branchJardim.id])

  const gerente = await createUser('Marcia Souza', 'gerente@bakeryerp.com.br', '(11) 98888-0002', 'ACTIVE', 'GERENTE', 'padaria123')
  await grantBranches(gerente.id, [branchCentro.id, branchJardim.id])

  const joao = await createUser('João da Silva', 'joao@padaria.com.br', '(11) 98888-0003', 'ACTIVE', 'ATENDENTE', 'padaria123')
  await grantBranches(joao.id, [branchCentro.id])
  const weekAhead = new Date(Date.now() + 7 * DAY)
  await db.userPermissionOverride.createMany({
    data: [
      { userId: joao.id, permissionKey: 'sales.revenue', granted: true, origin: 'INDIVIDUAL', grantedBy: 'Ricardo Alves' },
      { userId: joao.id, permissionKey: 'orders.create', granted: false, origin: 'INDIVIDUAL', grantedBy: 'Ricardo Alves' },
      { userId: joao.id, permissionKey: 'sales.cancel', granted: true, origin: 'TEMPORARY', grantedBy: 'Ricardo Alves', expiresAt: weekAhead },
    ],
  })

  const padeiro = await createUser('Pedro Rocha', 'padeiro@bakeryerp.com.br', null, 'ACTIVE', 'PADEIRO', 'padaria123')
  await grantBranches(padeiro.id, [branchCentro.id])

  const estoquista = await createUser('Ana Lima', 'estoquista@bakeryerp.com.br', null, 'ACTIVE', 'ESTOQUISTA', 'padaria123')
  await grantBranches(estoquista.id, [branchCentro.id, branchJardim.id])

  const financeiro = await createUser('Bruno Dias', 'financeiro@bakeryerp.com.br', null, 'ACTIVE', 'FINANCEIRO', 'padaria123')
  await grantBranches(financeiro.id, [branchCentro.id])

  const entregador = await createUser('Tiago Melo', 'entregador@bakeryerp.com.br', null, 'ACTIVE', 'ENTREGADOR', 'padaria123')
  await grantBranches(entregador.id, [branchCentro.id])

  await createUser('Deusimar Costa', 'bloqueado@bakeryerp.com.br', null, 'BLOCKED', 'ATENDENTE', 'padaria123')

  await db.accessLog.createMany({
    data: [
      { action: 'BOOTSTRAP', actor: 'Sistema', detail: 'Contas de demonstração recriadas automaticamente (banco sem usuários)', ip: 'internal' },
    ],
  })

  console.log('[auth/bootstrap] Contas de demonstração criadas: owner@bakeryerp.com.br (bakery2026) e demais (padaria123)')
  return true
}
