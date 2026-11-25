'use client'

// BAKERY ERP - Shell da aplicação: tela de login, navegação lateral, header e footer.
// Tema grafite + âmbar (classes do tema em globals.css).

import { useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Bike,
  Boxes,
  BarChart3,
  Cake,
  Calculator,
  ClipboardList,
  CookingPot,
  Crown,
  Flame,
  HandPlatter,
  IdCard,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  QrCode,
  ShieldCheck,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  ROLE_MODULES,
  useAppStore,
  type ModuleKey,
  type Operator,
  type OperatorRole,
} from '@/lib/store'
import { ROLE_LABELS } from '@/lib/format'

import type { ViewProps } from './view-props'
import DashboardView from './views/DashboardView'
import PdvView from './views/PdvView'
import OrdersView from './views/OrdersView'
import BookingsView from './views/BookingsView'
import DeliveryView from './views/DeliveryView'
import ProductionView from './views/ProductionView'
import ProductsView from './views/ProductsView'
import QualityView from './views/QualityView'
import StockView from './views/StockView'
import PurchasesView from './views/PurchasesView'
import CashView from './views/CashView'
import FinanceView from './views/FinanceView'
import ReportsView from './views/ReportsView'
import EmployeesView from './views/EmployeesView'
import CustomersView from './views/CustomersView'
import PaymentsView from './views/PaymentsView'

type NavItem = { key: ModuleKey; label: string; icon: LucideIcon }
type NavGroup = { label: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operação',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { key: 'pdv', label: 'PDV', icon: ShoppingCart },
      { key: 'orders', label: 'Pedidos', icon: ClipboardList },
      { key: 'bookings', label: 'Encomendas', icon: Cake },
      { key: 'delivery', label: 'Delivery', icon: Bike },
    ],
  },
  {
    label: 'Produção',
    items: [
      { key: 'production', label: 'Produção', icon: CookingPot },
      { key: 'products', label: 'Produtos', icon: Package },
      { key: 'quality', label: 'Qualidade', icon: ShieldCheck },
      { key: 'stock', label: 'Estoque', icon: Boxes },
    ],
  },
  {
    label: 'Comercial',
    items: [
      { key: 'purchases', label: 'Compras', icon: Truck },
      { key: 'customers', label: 'Clientes', icon: Users },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { key: 'cash', label: 'Caixa', icon: Wallet },
      { key: 'finance', label: 'Financeiro', icon: Landmark },
      { key: 'payments', label: 'Mercado Pago', icon: QrCode },
      { key: 'reports', label: 'Relatórios', icon: BarChart3 },
    ],
  },
  {
    label: 'RH',
    items: [{ key: 'employees', label: 'Equipe', icon: IdCard }],
  },
]

const MODULE_TITLES: Record<ModuleKey, string> = {
  dashboard: 'Dashboard',
  pdv: 'PDV - Frente de Caixa',
  orders: 'Pedidos (KDS)',
  bookings: 'Encomendas',
  delivery: 'Delivery',
  production: 'Produção',
  products: 'Produtos',
  quality: 'Qualidade e Desperdício',
  stock: 'Estoque',
  purchases: 'Compras',
  cash: 'Caixa',
  finance: 'Financeiro',
  reports: 'Relatórios',
  employees: 'Equipe',
  customers: 'Clientes',
  payments: 'Mercado Pago',
}

const VIEWS: Record<ModuleKey, ComponentType<ViewProps>> = {
  dashboard: DashboardView,
  pdv: PdvView,
  orders: OrdersView,
  bookings: BookingsView,
  delivery: DeliveryView,
  production: ProductionView,
  products: ProductsView,
  quality: QualityView,
  stock: StockView,
  purchases: PurchasesView,
  cash: CashView,
  finance: FinanceView,
  reports: ReportsView,
  employees: EmployeesView,
  customers: CustomersView,
  payments: PaymentsView,
}

const ROLE_PROFILES: { role: OperatorRole; icon: LucideIcon }[] = [
  { role: 'PROPRIETARIO', icon: Crown },
  { role: 'GERENTE', icon: ShieldCheck },
  { role: 'CAIXA', icon: Calculator },
  { role: 'PADEIRO', icon: Flame },
  { role: 'ATENDENTE', icon: HandPlatter },
  { role: 'FINANCEIRO', icon: Landmark },
  { role: 'ESTOQUISTA', icon: Boxes },
]

const OPERATOR_STORAGE_KEY = 'bakery-erp:operator'

// ============================== LOGIN ==============================

function LoginScreen() {
  const setOperator = useAppStore((s) => s.setOperator)
  const [name, setName] = useState('')

  function handleSelectProfile(role: OperatorRole) {
    const displayName = name.trim() || ROLE_LABELS[role]
    setOperator({ name: displayName, role })
    toast.success(`Bem-vindo, ${displayName}`, {
      description: `Perfil: ${ROLE_LABELS[role]} - ambiente pronto para uso.`,
    })
  }

  return (
    <div className="relative flex min-h-screen flex-1 items-center justify-center p-4">
      {/* Fundo com imagem da padaria + overlay escuro */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: 'url(/brand/hero.png)' }}
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 bg-gradient-to-b from-background via-background/80 to-background/95"
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-card/95 p-6 shadow-2xl backdrop-blur-sm sm:p-8">
        <div className="flex flex-col items-center text-center">
          <Image
            src="/brand/logo.png"
            alt="Logotipo BAKERY ERP"
            width={80}
            height={80}
            priority
            className="h-20 w-20 rounded-full border border-primary/40"
          />
          <h1 className="mt-4 text-3xl font-bold tracking-tight">
            BAKERY <span className="text-primary">ERP</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sistema Integrado de Gestão de Padarias
          </p>
        </div>

        <div className="mt-6 space-y-4">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Seu nome"
            aria-label="Seu nome"
            maxLength={60}
          />

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Selecione seu perfil
            </p>
            <div className="grid grid-cols-2 gap-2">
              {ROLE_PROFILES.map((profile, index) => (
                <Button
                  key={profile.role}
                  type="button"
                  variant="outline"
                  onClick={() => handleSelectProfile(profile.role)}
                  className={
                    index === ROLE_PROFILES.length - 1
                      ? 'col-span-2 justify-start'
                      : 'justify-start'
                  }
                  aria-label={`Entrar como ${ROLE_LABELS[profile.role]}`}
                >
                  <profile.icon className="size-4 text-primary" />
                  {ROLE_LABELS[profile.role]}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Fase 2 - Atendimento, Qualidade e Inteligência · ambiente demonstrativo
        </p>
      </div>
    </div>
  )
}

// ============================== NAVEGAÇÃO ==============================

function NavItems({
  allowed,
  active,
  onSelect,
}: {
  allowed: ModuleKey[]
  active: ModuleKey
  onSelect: (key: ModuleKey) => void
}) {
  return (
    <div>
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter((item) => allowed.includes(item.key))
        if (items.length === 0) return null
        return (
          <div key={group.label}>
            <p className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {items.map((item) => {
                const isActive = active === item.key
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onSelect(item.key)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex w-full items-center gap-2.5 rounded-md border-l-2 px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'border-primary bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'border-transparent text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
                    }`}
                  >
                    <item.icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ============================== SHELL ==============================

export function ErpShell() {
  const operator = useAppStore((s) => s.operator)
  const setOperator = useAppStore((s) => s.setOperator)
  const logout = useAppStore((s) => s.logout)

  // Módulo solicitado pelo usuário; o módulo ativo é derivado respeitando as permissões do perfil
  const [requested, setRequested] = useState<ModuleKey>('dashboard')
  const [clock, setClock] = useState<string | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // Restaura operador persistido (evita login a cada refresh)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(OPERATOR_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as Partial<Operator> | null
      if (
        parsed &&
        typeof parsed.name === 'string' &&
        parsed.name.trim() !== '' &&
        typeof parsed.role === 'string' &&
        parsed.role in ROLE_MODULES
      ) {
        setOperator({ name: parsed.name, role: parsed.role as OperatorRole })
      }
    } catch {
      /* localStorage indisponível - segue sem persistência */
    }
  }, [setOperator])

  // Persiste/limpa operador no localStorage
  useEffect(() => {
    try {
      if (operator) {
        window.localStorage.setItem(OPERATOR_STORAGE_KEY, JSON.stringify(operator))
      } else {
        window.localStorage.removeItem(OPERATOR_STORAGE_KEY)
      }
    } catch {
      /* ignore */
    }
  }, [operator])

  // Relógio ao vivo (apenas no client para evitar mismatch de hidratação)
  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      )
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [])

  const allowed: ModuleKey[] = operator ? ROLE_MODULES[operator.role] : []

  // Derivação em render: se o módulo solicitado não é permitido para o perfil,
  // cai no primeiro módulo permitido (ex.: PADEIRO restaurado do localStorage)
  const active: ModuleKey =
    operator && !allowed.includes(requested)
      ? (allowed[0] ?? 'dashboard')
      : requested

  function handleSelect(key: ModuleKey) {
    setRequested(key)
    setMobileNavOpen(false)
  }

  function handleLogout() {
    logout()
    setRequested('dashboard')
    setMobileNavOpen(false)
    toast.info('Sessão encerrada')
  }

  const ActiveView = VIEWS[active]

  return (
    <div className="min-h-screen flex flex-col bakery-bg">
      {!operator ? (
        <LoginScreen />
      ) : (
        <>
          {/* Sidebar desktop */}
          <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
            <div className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-4">
              <Image
                src="/brand/logo.png"
                alt="Logotipo BAKERY ERP"
                width={36}
                height={36}
                className="h-9 w-9 rounded-full border border-primary/40"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold tracking-tight">
                  BAKERY <span className="text-primary">ERP</span>
                </p>
                <Badge variant="outline" className="mt-1 px-1.5 py-0 text-[10px]">
                  {ROLE_LABELS[operator.role]}
                </Badge>
              </div>
            </div>
            <nav
              className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-4"
              aria-label="Navegação do ERP"
            >
              <NavItems allowed={allowed} active={active} onSelect={handleSelect} />
            </nav>
          </aside>

          {/* Área principal */}
          <div className="flex flex-1 flex-col lg:pl-60">
            <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur md:px-6">
              <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="lg:hidden"
                    aria-label="Abrir menu de navegação"
                  >
                    <Menu className="size-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="w-60 border-sidebar-border bg-sidebar p-0"
                >
                  <SheetHeader className="border-b border-sidebar-border p-4 text-left">
                    <SheetTitle className="flex items-center gap-2.5 text-sm font-bold tracking-tight">
                      <Image
                        src="/brand/logo.png"
                        alt=""
                        width={32}
                        height={32}
                        className="h-8 w-8 rounded-full border border-primary/40"
                      />
                      <span>
                        BAKERY <span className="text-primary">ERP</span>
                      </span>
                    </SheetTitle>
                    <p className="text-xs text-muted-foreground">
                      {operator.name} - {ROLE_LABELS[operator.role]}
                    </p>
                  </SheetHeader>
                  <nav
                    className="h-[calc(100vh-8rem)] overflow-y-auto scrollbar-thin px-2 pb-4"
                    aria-label="Navegação do ERP"
                  >
                    <NavItems
                      allowed={allowed}
                      active={active}
                      onSelect={handleSelect}
                    />
                  </nav>
                </SheetContent>
              </Sheet>

              <h1 className="truncate text-lg font-semibold md:text-xl">
                {MODULE_TITLES[active]}
              </h1>

              <div className="ml-auto flex items-center gap-2 md:gap-3">
                <span
                  className="hidden font-mono text-sm tabular-nums text-muted-foreground sm:inline"
                  suppressHydrationWarning
                >
                  {clock ?? '--:--:--'}
                </span>
                <Badge
                  variant="outline"
                  className="hidden max-w-[220px] items-center gap-1.5 md:inline-flex"
                >
                  <span className="truncate font-medium">{operator.name}</span>
                  <span className="truncate text-muted-foreground">
                    {ROLE_LABELS[operator.role]}
                  </span>
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleLogout}
                  aria-label="Sair da sessão"
                >
                  <LogOut className="size-4" />
                </Button>
              </div>
            </header>

            <main className="flex-1 p-4 md:p-6">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <ActiveView operator={operator} />
              </motion.div>
            </main>

            <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground md:px-6">
              <span>BAKERY ERP • Gestão 360° para padarias</span>
              <span>Next.js 16 • SQLite • Mercado Pago (demonstração)</span>
            </footer>
          </div>
        </>
      )}
    </div>
  )
}
