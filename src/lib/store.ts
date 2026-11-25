// BAKERY ERP - Estado global do cliente (perfil do operador + navegação)
import { create } from 'zustand'

export type OperatorRole = 'PROPRIETARIO' | 'GERENTE' | 'CAIXA' | 'PADEIRO' | 'ATENDENTE' | 'FINANCEIRO' | 'ESTOQUISTA'

export type Operator = {
  name: string
  role: OperatorRole
}

type AppState = {
  operator: Operator | null
  setOperator: (op: Operator | null) => void
  logout: () => void
}

export const useAppStore = create<AppState>((set) => ({
  operator: null,
  setOperator: (op) => set({ operator: op }),
  logout: () => set({ operator: null }),
}))

// Permissões por módulo (simples: perfil pode acessar o módulo?)
export type ModuleKey =
  | 'dashboard'
  | 'pdv'
  | 'orders'
  | 'production'
  | 'products'
  | 'stock'
  | 'purchases'
  | 'cash'
  | 'finance'
  | 'employees'
  | 'customers'
  | 'payments'

export const ROLE_MODULES: Record<OperatorRole, ModuleKey[]> = {
  PROPRIETARIO: ['dashboard', 'pdv', 'orders', 'production', 'products', 'stock', 'purchases', 'cash', 'finance', 'employees', 'customers', 'payments'],
  GERENTE: ['dashboard', 'pdv', 'orders', 'production', 'products', 'stock', 'purchases', 'cash', 'finance', 'employees', 'customers', 'payments'],
  CAIXA: ['dashboard', 'pdv', 'orders', 'cash', 'customers'],
  PADEIRO: ['orders', 'production', 'stock'],
  ATENDENTE: ['pdv', 'orders', 'customers'],
  FINANCEIRO: ['dashboard', 'finance', 'payments', 'purchases'],
  ESTOQUISTA: ['stock', 'purchases', 'products', 'production'],
}
