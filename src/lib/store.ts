// BAKERY ERP - Estado global do cliente (sessão autenticada + navegação)
import { create } from 'zustand'

// Operador = usuário autenticado com permissões efetivas carregadas do backend.
export type Operator = {
  id: string
  name: string
  email: string
  role: string // código do perfil (compatível com ROLE_LABELS)
  roleName: string // nome de exibição (perfis personalizados)
  isAbsolute: boolean // Proprietário: privilégios absolutos
  permissions: string[] // chaves efetivas do catálogo
  company: { id: string; name: string } | null
  branches: { id: string; name: string }[]
  mustChangePassword: boolean
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

// Módulos do menu (visíveis conforme permissões efetivas)
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
  | 'settings'
