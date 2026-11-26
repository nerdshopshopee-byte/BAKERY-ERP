// BAKERY ERP - Definições padrão dos perfis de sistema (usadas no seed)
// Chaves referenciam o catálogo em src/lib/auth/permissions.ts

export type DefaultRole = {
  name: string
  description: string
  isSystem: boolean
  isAbsolute: boolean
  permissionKeys: string[]
}

const SALES_BASIC = ['sales.view', 'sales.create', 'sales.discount', 'sales.history']

export const DEFAULT_ROLES: DefaultRole[] = [
  {
    name: 'PROPRIETARIO',
    description: 'Privilégios administrativos absolutos: todo o sistema',
    isSystem: true,
    isAbsolute: true,
    permissionKeys: [], // absoluto = catálogo completo em runtime
  },
  {
    name: 'ADMINISTRADOR',
    description: 'Acesso total ao sistema com gestão de usuários',
    isSystem: false,
    isAbsolute: false,
    permissionKeys: [
      'dashboard.view',
      ...SALES_BASIC, 'sales.cancel', 'sales.revenue', 'sales.returns',
      'orders.view', 'orders.create', 'orders.edit', 'orders.status', 'orders.cancel', 'orders.bookings', 'orders.delivery',
      'production.view', 'production.recipes.view', 'production.recipes.edit', 'production.orders.create', 'production.orders.execute', 'production.losses', 'production.costs',
      'inventory.view', 'inventory.products', 'inventory.products_delete', 'inventory.ingredients', 'inventory.entries', 'inventory.exits', 'inventory.adjust', 'inventory.costs',
      'purchases.view', 'purchases.create', 'purchases.receive', 'purchases.cancel', 'purchases.suppliers',
      'cash.view', 'cash.open', 'cash.close', 'cash.movements',
      'finance.view', 'finance.cashflow', 'finance.payables.view', 'finance.payables.manage', 'finance.receivables.view', 'finance.receivables.manage', 'finance.revenue', 'finance.profit', 'finance.dre', 'finance.payments',
      'fiscal.view', 'fiscal.emit', 'fiscal.cancel', 'fiscal.inutilize', 'fiscal.config', 'fiscal.tables',
      'scales.view', 'scales.manage', 'scales.sync',
      'reports.view', 'reports.export',
      'customers.view', 'customers.manage',
      'employees.view', 'employees.manage', 'employees.timelog', 'employees.schedules',
      'settings.view', 'settings.users', 'settings.roles', 'settings.permissions', 'settings.audit',
    ],
  },
  {
    name: 'GERENTE',
    description: 'Gestão operacional autorizada (sem administração de acessos)',
    isSystem: false,
    isAbsolute: false,
    permissionKeys: [
      'dashboard.view',
      ...SALES_BASIC, 'sales.cancel', 'sales.revenue', 'sales.returns',
      'orders.view', 'orders.create', 'orders.edit', 'orders.status', 'orders.cancel', 'orders.bookings', 'orders.delivery',
      'production.view', 'production.recipes.view', 'production.recipes.edit', 'production.orders.create', 'production.orders.execute', 'production.losses', 'production.costs',
      'inventory.view', 'inventory.products', 'inventory.ingredients', 'inventory.entries', 'inventory.exits', 'inventory.adjust', 'inventory.costs',
      'purchases.view', 'purchases.create', 'purchases.receive', 'purchases.suppliers',
      'cash.view', 'cash.open', 'cash.close', 'cash.movements',
      'finance.view', 'finance.cashflow', 'finance.payables.view', 'finance.payables.manage', 'finance.receivables.view', 'finance.receivables.manage', 'finance.revenue', 'finance.profit', 'finance.dre', 'finance.payments',
      'fiscal.view', 'fiscal.emit', 'fiscal.cancel',
      'scales.view', 'scales.sync',
      'reports.view', 'reports.export',
      'customers.view', 'customers.manage',
      'employees.view', 'employees.manage', 'employees.timelog', 'employees.schedules',
      'settings.view',
    ],
  },
  {
    name: 'ATENDENTE',
    description: 'PDV, pedidos, encomendas e clientes',
    isSystem: false,
    isAbsolute: false,
    permissionKeys: [
      'dashboard.view',
      ...SALES_BASIC,
      'orders.view', 'orders.create', 'orders.edit', 'orders.status', 'orders.bookings', 'orders.delivery',
      'cash.view',
      'customers.view', 'customers.manage',
    ],
  },
  {
    name: 'PADEIRO',
    description: 'Produção, KDS e controle de qualidade',
    isSystem: false,
    isAbsolute: false,
    permissionKeys: [
      'orders.view', 'orders.status',
      'production.view', 'production.recipes.view', 'production.orders.create', 'production.orders.execute', 'production.losses',
      'inventory.view', 'inventory.entries', 'inventory.exits', 'inventory.adjust',
      'scales.view', 'scales.sync',
    ],
  },
  {
    name: 'ESTOQUISTA',
    description: 'Estoque, produtos e compras',
    isSystem: false,
    isAbsolute: false,
    permissionKeys: [
      'production.view', 'production.orders.create',
      'inventory.view', 'inventory.products', 'inventory.ingredients', 'inventory.entries', 'inventory.exits', 'inventory.adjust', 'inventory.costs',
      'purchases.view', 'purchases.create', 'purchases.receive', 'purchases.suppliers',
    ],
  },
  {
    name: 'FINANCEIRO',
    description: 'Financeiro, caixa e relatórios autorizados',
    isSystem: false,
    isAbsolute: false,
    permissionKeys: [
      'dashboard.view',
      'cash.view', 'cash.movements',
      'finance.view', 'finance.cashflow', 'finance.payables.view', 'finance.payables.manage', 'finance.receivables.view', 'finance.receivables.manage', 'finance.revenue', 'finance.profit', 'finance.dre', 'finance.payments',
      'fiscal.view', 'fiscal.emit', 'fiscal.cancel',
      'reports.view', 'reports.export',
      'purchases.view',
    ],
  },
  {
    name: 'ENTREGADOR',
    description: 'Consultas de delivery para execução das rotas',
    isSystem: false,
    isAbsolute: false,
    permissionKeys: [
      'orders.view',
      'orders.delivery',
    ],
  },
]
