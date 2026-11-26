// BAKERY ERP - Catálogo central de permissões (fonte única de verdade)
// Usado no backend (guard das APIs) e no frontend (menus e matriz de configuração).
// Chaves estáveis no formato `modulo.acao` - nunca remover, apenas adicionar.

export type PermissionDef = { key: string; label: string }
export type PermissionModuleDef = {
  key: string
  label: string
  description?: string
  permissions: PermissionDef[]
}

export const PERMISSION_MODULES: PermissionModuleDef[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    description: 'Indicadores gerais da padaria',
    permissions: [{ key: 'dashboard.view', label: 'Visualizar indicadores' }],
  },
  {
    key: 'sales',
    label: 'PDV / Vendas',
    description: 'Frente de caixa e histórico de vendas',
    permissions: [
      { key: 'sales.view', label: 'Acessar PDV' },
      { key: 'sales.create', label: 'Realizar vendas' },
      { key: 'sales.discount', label: 'Aplicar descontos' },
      { key: 'sales.cancel', label: 'Cancelar vendas' },
      { key: 'sales.history', label: 'Consultar histórico' },
      { key: 'sales.revenue', label: 'Consultar faturamento' },
      { key: 'sales.returns', label: 'Realizar devoluções' },
    ],
  },
  {
    key: 'orders',
    label: 'Pedidos',
    description: 'KDS, encomendas e delivery',
    permissions: [
      { key: 'orders.view', label: 'Visualizar pedidos' },
      { key: 'orders.create', label: 'Criar pedidos' },
      { key: 'orders.edit', label: 'Editar pedidos' },
      { key: 'orders.status', label: 'Alterar status' },
      { key: 'orders.cancel', label: 'Cancelar pedidos' },
      { key: 'orders.bookings', label: 'Gerenciar encomendas' },
      { key: 'orders.delivery', label: 'Gerenciar delivery' },
    ],
  },
  {
    key: 'production',
    label: 'Produção',
    description: 'Receitas, ordens de produção e perdas',
    permissions: [
      { key: 'production.view', label: 'Visualizar produção' },
      { key: 'production.recipes.view', label: 'Consultar receitas' },
      { key: 'production.recipes.edit', label: 'Criar e editar receitas' },
      { key: 'production.orders.create', label: 'Abrir ordens de produção' },
      { key: 'production.orders.execute', label: 'Iniciar e finalizar produção' },
      { key: 'production.losses', label: 'Registrar perdas e qualidade' },
      { key: 'production.costs', label: 'Consultar custos de produção' },
    ],
  },
  {
    key: 'inventory',
    label: 'Estoque',
    description: 'Produtos, insumos e movimentações',
    permissions: [
      { key: 'inventory.view', label: 'Visualizar estoque' },
      { key: 'inventory.products', label: 'Cadastrar e editar produtos' },
      { key: 'inventory.products_delete', label: 'Excluir produtos' },
      { key: 'inventory.ingredients', label: 'Cadastrar e editar insumos' },
      { key: 'inventory.entries', label: 'Registrar entradas' },
      { key: 'inventory.exits', label: 'Registrar saídas' },
      { key: 'inventory.adjust', label: 'Ajustar quantidades' },
      { key: 'inventory.costs', label: 'Consultar custos' },
    ],
  },
  {
    key: 'purchases',
    label: 'Compras',
    description: 'Fornecedores e ordens de compra',
    permissions: [
      { key: 'purchases.view', label: 'Visualizar compras' },
      { key: 'purchases.create', label: 'Criar compras' },
      { key: 'purchases.receive', label: 'Receber compras' },
      { key: 'purchases.cancel', label: 'Cancelar compras' },
      { key: 'purchases.suppliers', label: 'Gerenciar fornecedores' },
    ],
  },
  {
    key: 'cash',
    label: 'Caixa',
    description: 'Abertura, fechamento e movimentações',
    permissions: [
      { key: 'cash.view', label: 'Visualizar caixa' },
      { key: 'cash.open', label: 'Abrir caixa' },
      { key: 'cash.close', label: 'Fechar caixa' },
      { key: 'cash.movements', label: 'Sangrias e suprimentos' },
    ],
  },
  {
    key: 'finance',
    label: 'Financeiro',
    description: 'Contas, fluxo de caixa e resultados',
    permissions: [
      { key: 'finance.view', label: 'Visualizar financeiro' },
      { key: 'finance.cashflow', label: 'Consultar e lançar fluxo de caixa' },
      { key: 'finance.payables.view', label: 'Visualizar contas a pagar' },
      { key: 'finance.payables.manage', label: 'Criar e editar contas a pagar' },
      { key: 'finance.receivables.view', label: 'Visualizar contas a receber' },
      { key: 'finance.receivables.manage', label: 'Registrar recebimentos' },
      { key: 'finance.revenue', label: 'Consultar faturamento' },
      { key: 'finance.profit', label: 'Consultar lucro' },
      { key: 'finance.dre', label: 'Consultar DRE' },
      { key: 'finance.payments', label: 'Mercado Pago / PIX' },
    ],
  },
  {
    key: 'reports',
    label: 'Relatórios',
    description: 'Relatórios gerenciais',
    permissions: [
      { key: 'reports.view', label: 'Visualizar relatórios' },
      { key: 'reports.export', label: 'Exportar relatórios' },
    ],
  },
  {
    key: 'customers',
    label: 'Clientes',
    description: 'Cadastro, fidelidade e fiado',
    permissions: [
      { key: 'customers.view', label: 'Visualizar clientes' },
      { key: 'customers.manage', label: 'Cadastrar e editar clientes' },
    ],
  },
  {
    key: 'employees',
    label: 'Funcionários',
    description: 'Equipe, ponto e jornadas',
    permissions: [
      { key: 'employees.view', label: 'Visualizar funcionários' },
      { key: 'employees.manage', label: 'Cadastrar e editar funcionários' },
      { key: 'employees.timelog', label: 'Consultar ponto e jornadas' },
      { key: 'employees.schedules', label: 'Gerenciar escalas' },
    ],
  },
  {
    key: 'fiscal',
    label: 'Fiscal',
    description: 'Motor fiscal: NFC-e, NF-e e tabelas tributárias',
    permissions: [
      { key: 'fiscal.view', label: 'Visualizar documentos fiscais' },
      { key: 'fiscal.emit', label: 'Emitir NFC-e / NF-e' },
      { key: 'fiscal.cancel', label: 'Cancelar notas fiscais' },
      { key: 'fiscal.inutilize', label: 'Inutilizar faixas de numeração' },
      { key: 'fiscal.config', label: 'Configurar emissor e certificado' },
      { key: 'fiscal.tables', label: 'Gerenciar tabelas tributárias (IBS/CBS)' },
    ],
  },
  {
    key: 'scales',
    label: 'Balanças',
    description: 'Equipamentos de pesagem, PLUs e etiquetas',
    permissions: [
      { key: 'scales.view', label: 'Visualizar balanças e PLUs' },
      { key: 'scales.manage', label: 'Cadastrar e editar equipamentos' },
      { key: 'scales.sync', label: 'Sincronizar produtos e ler peso' },
    ],
  },
  {
    key: 'settings',
    label: 'Configurações',
    description: 'Usuários, perfis e administração',
    permissions: [
      { key: 'settings.view', label: 'Acessar configurações' },
      { key: 'settings.users', label: 'Gerenciar usuários' },
      { key: 'settings.roles', label: 'Gerenciar perfis' },
      { key: 'settings.permissions', label: 'Alterar permissões' },
      { key: 'settings.audit', label: 'Consultar auditoria' },
    ],
  },
]

export const ALL_PERMISSION_KEYS: string[] = PERMISSION_MODULES.flatMap((m) =>
  m.permissions.map((p) => p.key)
)

export const ALL_PERMISSION_SET: Set<string> = new Set(ALL_PERMISSION_KEYS)

export function isValidPermissionKey(key: string): boolean {
  return ALL_PERMISSION_SET.has(key)
}

export function permissionLabel(key: string): string {
  for (const m of PERMISSION_MODULES) {
    const found = m.permissions.find((p) => p.key === key)
    if (found) return found.label
  }
  return key
}

// Mapa dos módulos do menu -> permissão necessária para visibilidade
export const MODULE_PERMISSION: Record<string, string> = {
  dashboard: 'dashboard.view',
  pdv: 'sales.view',
  orders: 'orders.view',
  bookings: 'orders.bookings',
  delivery: 'orders.delivery',
  production: 'production.view',
  products: 'inventory.products',
  quality: 'production.losses',
  stock: 'inventory.view',
  purchases: 'purchases.view',
  cash: 'cash.view',
  finance: 'finance.view',
  reports: 'reports.view',
  employees: 'employees.view',
  customers: 'customers.view',
  payments: 'finance.payments',
  fiscal: 'fiscal.view',
  scales: 'scales.view',
  settings: 'settings.view',
}
