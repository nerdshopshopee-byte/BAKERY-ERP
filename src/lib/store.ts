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
  | 'bookings'
  | 'delivery'
  | 'production'
  | 'products'
  | 'quality'
  | 'stock'
  | 'purchases'
  | 'cash'
  | 'finance'
  | 'reports'
  | 'employees'
  | 'customers'
  | 'payments'

export const ROLE_MODULES: Record<OperatorRole, ModuleKey[]> = {
  PROPRIETARIO: ['dashboard', 'pdv', 'orders', 'bookings', 'delivery', 'production', 'products', 'quality', 'stock', 'purchases', 'cash', 'finance', 'reports', 'employees', 'customers', 'payments'],
  GERENTE: ['dashboard', 'pdv', 'orders', 'bookings', 'delivery', 'production', 'products', 'quality', 'stock', 'purchases', 'cash', 'finance', 'reports', 'employees', 'customers', 'payments'],
  CAIXA: ['dashboard', 'pdv', 'orders', 'bookings', 'delivery', 'cash', 'customers'],
  PADEIRO: ['orders', 'bookings', 'production', 'quality', 'stock'],
  ATENDENTE: ['pdv', 'orders', 'bookings', 'delivery', 'customers'],
  FINANCEIRO: ['dashboard', 'finance', 'reports', 'payments', 'purchases'],
  ESTOQUISTA: ['stock', 'purchases', 'products', 'production', 'quality'],
}
