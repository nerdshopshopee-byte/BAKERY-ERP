'use client'

// BAKERY ERP - Shell da aplicação: login seguro, sessão, navegação dinâmica por
// permissões efetivas, header, troca de senha e footer. Tema grafite + âmbar.

import { useCallback, useEffect, useState } from 'react'
import type { ComponentType, FormEvent } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Bike,
  Boxes,
  BarChart3,
  Cake,
  Calculator,
  ChevronDown,
  ClipboardList,
  CookingPot,
  Eye,
  EyeOff,
  Flame,
  IdCard,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  LogOut,
  Mail,
  Menu,
  ScrollText,
  Package,
  QrCode,
  ShieldCheck,
  ShieldX,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { apiGet, apiPost } from '@/lib/api'
import { useAppStore, type ModuleKey, type Operator } from '@/lib/store'
import { MODULE_PERMISSION } from '@/lib/auth/permissions'

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
import UsersView from './views/UsersView'
import FiscalView from './views/FiscalView'

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
      { key: 'fiscal', label: 'Fiscal', icon: ScrollText },
      { key: 'reports', label: 'Relatórios', icon: BarChart3 },
    ],
  },
  {
    label: 'RH',
    items: [{ key: 'employees', label: 'Equipe', icon: IdCard }],
  },
  {
    label: 'Administração',
    items: [
      { key: 'settings', label: 'Usuários e Permissões', icon: ShieldCheck },
    ],
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
  settings: 'Configurações - Usuários e Permissões',
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
  fiscal: FiscalView,
  settings: UsersView,
}

type SessionPayload = {
  id: string
  name: string
  email: string
  status: string
  mustChangePassword: boolean
  role: { id: string; name: string; description: string | null; isAbsolute: boolean; isSystem: boolean }
  permissions: string[]
  company: { id: string; name: string } | null
  branches: { id: string; name: string }[]
}

function toOperator(u: SessionPayload): Operator {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role?.name ?? '',
    roleName: u.role?.name ?? '',
    isAbsolute: Boolean(u.role?.isAbsolute),
    permissions: Array.isArray(u.permissions) ? u.permissions : [],
    company: u.company ?? null,
    branches: Array.isArray(u.branches) ? u.branches : [],
    mustChangePassword: Boolean(u.mustChangePassword),
  }
}

// ============================== LOGIN ==============================

const DEMO_ACCOUNTS = [
  { email: 'owner@bakeryerp.com.br', password: 'bakery2026', label: 'Proprietário - acesso total' },
  { email: 'gerente@bakeryerp.com.br', password: 'padaria123', label: 'Gerente - gestão operacional' },
  { email: 'joao@padaria.com.br', password: 'padaria123', label: 'João - atendente personalizado' },
  { email: 'padeiro@bakeryerp.com.br', password: 'padaria123', label: 'Padeiro - produção' },
  { email: 'financeiro@bakeryerp.com.br', password: 'padaria123', label: 'Financeiro - financeiro e relatórios' },
]

function LoginScreen({ onLoggedIn }: { onLoggedIn: (user: SessionPayload) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDemo, setShowDemo] = useState(false)

  // Recuperação de senha
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotStep, setForgotStep] = useState<'email' | 'token' | 'done'>('email')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [resetBusy, setResetBusy] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await apiPost<{ user: SessionPayload }>('/api/auth/login', {
        email: email.trim().toLowerCase(),
        password,
      })
      onLoggedIn(res.user)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao entrar'
      setError(message.replace(/^POST .* falhou \(\d+\)\.?\s*/, ''))
      setSubmitting(false)
    }
  }

  async function handleRequestToken() {
    setResetBusy(true)
    setResetError(null)
    try {
      const res = await apiPost<{ resetToken: string }>('/api/auth/forgot-password', {
        email: forgotEmail.trim().toLowerCase(),
      })
      setResetToken(res.resetToken)
      setForgotStep('token')
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Falha ao gerar token')
    } finally {
      setResetBusy(false)
    }
  }

  async function handleResetPassword() {
    setResetBusy(true)
    setResetError(null)
    try {
      await apiPost('/api/auth/reset-password', { token: resetToken.trim(), newPassword })
      setForgotStep('done')
      toast.success('Senha redefinida', { description: 'Use a nova senha para entrar.' })
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Falha ao redefinir senha')
    } finally {
      setResetBusy(false)
    }
  }

  function closeForgot() {
    setForgotOpen(false)
    setForgotStep('email')
    setResetToken('')
    setNewPassword('')
    setResetError(null)
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
          <p className="mt-1 text-sm text-muted-foreground">Acesso à plataforma</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="login-email">E-mail</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="login-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Digite seu e-mail cadastrado"
                required
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="login-password">Senha</Label>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Sua senha de acesso"
                required
                className="pl-9 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
            {submitting ? 'Entrando...' : 'Entrar no sistema'}
          </Button>

          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              className="text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setForgotOpen(true)}
            >
              Esqueci minha senha
            </button>
            <span className="text-muted-foreground">Acesso seguro · sessão individual</span>
          </div>
        </form>

        <Separator className="my-4" />

        <button
          type="button"
          className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground"
          onClick={() => setShowDemo((v) => !v)}
          aria-expanded={showDemo}
        >
          Contas de demonstração
          <ChevronDown className={`size-4 transition-transform ${showDemo ? 'rotate-180' : ''}`} />
        </button>
        {showDemo && (
          <div className="mt-3 space-y-1.5 rounded-lg border border-dashed border-border p-3">
            {DEMO_ACCOUNTS.map((acc) => (
              <button
                key={acc.email}
                type="button"
                onClick={() => {
                  setEmail(acc.email)
                  setPassword(acc.password)
                }}
                className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-accent"
              >
                <span className="font-mono font-semibold">{acc.email}</span>
                <span className="text-muted-foreground"> · {acc.password}</span>
                <p className="text-[11px] text-muted-foreground">{acc.label}</p>
              </button>
            ))}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Fase 3 - Autenticação, Usuários e Permissões Granulares
        </p>
      </div>

      {/* Recuperação de senha */}
      <Dialog open={forgotOpen} onOpenChange={(open) => (open ? setForgotOpen(true) : closeForgot())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Recuperar acesso</DialogTitle>
            <DialogDescription>
              Informe o e-mail cadastrado para gerar um token de recuperação (válido por 30 minutos, uso único).
            </DialogDescription>
          </DialogHeader>

          {forgotStep === 'email' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email">E-mail</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="seu@email.com.br"
                />
              </div>
              {resetError && <p className="text-sm text-destructive">{resetError}</p>}
              <DialogFooter>
                <Button onClick={handleRequestToken} disabled={resetBusy || !forgotEmail.trim()}>
                  {resetBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                  Gerar token
                </Button>
              </DialogFooter>
            </div>
          )}

          {forgotStep === 'token' && (
            <div className="space-y-3">
              <div className="rounded-md border border-dashed border-border p-3 text-xs">
                <p className="text-muted-foreground">
                  Token gerado. Em produção seria enviado por e-mail - aqui ele é exibido para entrega manual.
                </p>
                <p className="mt-1 break-all font-mono font-semibold text-primary">{resetToken}</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reset-new-password">Nova senha</Label>
                <Input
                  id="reset-new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres, com letras e números"
                />
              </div>
              {resetError && <p className="text-sm text-destructive">{resetError}</p>}
              <DialogFooter>
                <Button
                  onClick={handleResetPassword}
                  disabled={resetBusy || newPassword.length < 8}
                >
                  {resetBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                  Redefinir senha
                </Button>
              </DialogFooter>
            </div>
          )}

          {forgotStep === 'done' && (
            <div className="space-y-3">
              <p className="text-sm text-foreground">Senha redefinida com sucesso. Todas as sessões anteriores foram encerradas.</p>
              <DialogFooter>
                <Button onClick={closeForgot}>Voltar ao login</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================== TROCA DE SENHA ==============================

function ChangePasswordDialog({
  forced,
  open,
  onOpenChange,
  onDone,
}: {
  forced: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone?: () => void
}) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (busy) return
    if (next !== confirm) {
      setError('A confirmação não coincide com a nova senha')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await apiPost('/api/auth/change-password', { currentPassword: current, newPassword: next })
      toast.success('Senha alterada com sucesso')
      setCurrent('')
      setNext('')
      setConfirm('')
      onOpenChange(false)
      onDone?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao alterar senha')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !forced && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{forced ? 'Defina sua nova senha' : 'Alterar senha'}</DialogTitle>
          <DialogDescription>
            {forced
              ? 'Por segurança, você precisa trocar a senha antes de usar o sistema.'
              : 'A senha nova deve ter pelo menos 8 caracteres, com letras e números.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cp-current">Senha atual</Label>
            <Input id="cp-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-next">Nova senha</Label>
            <Input id="cp-next" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-confirm">Confirmar nova senha</Label>
            <Input id="cp-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            {!forced && (
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
            )}
            <Button onClick={handleSave} disabled={busy || !current || next.length < 8 || !confirm}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Salvar senha
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============================== ACESSO NEGADO ==============================

function AccessDenied({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Card className="max-w-md text-center">
        <CardContent className="flex flex-col items-center gap-3 p-8">
          <div className="flex size-14 items-center justify-center rounded-full border border-destructive/40 bg-destructive/10">
            <ShieldX className="size-7 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold">Acesso restrito</h2>
          <p className="text-sm text-muted-foreground">
            Você não tem permissão para acessar esta seção do BAKERY ERP.
            Solicite acesso ao proprietário se esta função for necessária para o seu trabalho.
          </p>
          <Button variant="outline" onClick={onBack} className="mt-2">
            Voltar ao dashboard
          </Button>
        </CardContent>
      </Card>
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
  const logoutStore = useAppStore((s) => s.logout)

  const [booting, setBooting] = useState(true)
  // null = seleção automática (primeiro módulo autorizado)
  const [requested, setRequested] = useState<ModuleKey | null>(null)
  const [clock, setClock] = useState<string | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [changePwdOpen, setChangePwdOpen] = useState(false)
  const [pwdForcedDone, setPwdForcedDone] = useState(false)

  const refreshSession = useCallback(async () => {
    try {
      const res = await apiGet<{ user: SessionPayload | null }>('/api/auth/session')
      setOperator(res.user ? toOperator(res.user) : null)
    } catch {
      setOperator(null)
    }
  }, [setOperator])

  // Bootstrap da sessão: restaura sessão ativa (cookie httpOnly) ao carregar
  useEffect(() => {
    let cancelled = false
    refreshSession().finally(() => {
      if (!cancelled) setBooting(false)
    })
    // Permissões alteradas administrativamente => recarrega a sessão
    const handler = () => void refreshSession()
    window.addEventListener('bakery:session-refresh', handler)
    return () => {
      cancelled = true
      window.removeEventListener('bakery:session-refresh', handler)
    }
  }, [refreshSession])

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

  // Recarrega permissões quando a janela volta ao foco
  useEffect(() => {
    if (!operator) return
    const onFocus = () => void refreshSession()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [operator, refreshSession])

  async function handleLogout() {
    try {
      await apiPost('/api/auth/logout')
    } catch {
      /* segue para limpeza local */
    }
    logoutStore()
    setRequested('dashboard')
    setMobileNavOpen(false)
    setPwdForcedDone(false)
    toast.info('Sessão encerrada')
  }

  // ---------- Estados de tela ----------
  if (booting) {
    return (
      <div className="flex min-h-screen items-center justify-center bakery-bg">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Restaurando sessão segura...</p>
        </div>
      </div>
    )
  }

  if (!operator) {
    return (
      <LoginScreen
        onLoggedIn={(user) => {
          const op = toOperator(user)
          setOperator(op)
          // Só abre o dashboard se o perfil do usuário puder vê-lo;
          // caso contrário, seleciona automaticamente o primeiro módulo autorizado.
          const canDashboard = op.isAbsolute || op.permissions.includes('dashboard.view')
          setRequested(canDashboard ? 'dashboard' : null)
          toast.success(`Bem-vindo, ${op.name}`, {
            description: 'Sessão individual iniciada com sucesso.',
          })
        }}
      />
    )
  }

  // ---------- Menu dinâmico conforme permissões efetivas ----------
  const allowed: ModuleKey[] = (
    ['dashboard', 'pdv', 'orders', 'bookings', 'delivery', 'production', 'products', 'quality', 'stock', 'purchases', 'cash', 'finance', 'payments', 'fiscal', 'reports', 'employees', 'customers', 'settings'] as ModuleKey[]
  ).filter(
    (key) => operator.isAbsolute || operator.permissions.includes(MODULE_PERMISSION[key])
  )

  // Módulo solicitado não autorizado (ex.: permissões revogadas em uso) -> acesso negado
  const denied = requested !== null && !allowed.includes(requested)
  const active: ModuleKey =
    requested !== null && !denied ? requested : (allowed[0] ?? 'dashboard')
  const ActiveView = VIEWS[active]

  function handleSelect(key: ModuleKey) {
    setRequested(key)
    setMobileNavOpen(false)
  }

  return (
    <div className="min-h-screen flex flex-col bakery-bg">
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
              {operator.isAbsolute ? 'Acesso total' : operator.roleName || 'Perfil'}
            </Badge>
          </div>
        </div>
        <nav
          className="flex-1 overflow-y-auto scrollbar-thin px-2 pb-4"
          aria-label="Navegação do ERP"
        >
          <NavItems allowed={allowed} active={active} onSelect={handleSelect} />
        </nav>
        <div className="border-t border-sidebar-border px-4 py-3 text-[11px] text-muted-foreground">
          {operator.company ? operator.company.name : 'Sem empresa vinculada'}
          {operator.branches.length > 0 && (
            <p className="mt-0.5 truncate">
              {operator.branches.length === 1
                ? operator.branches[0].name
                : `${operator.branches.length} unidades autorizadas`}
            </p>
          )}
        </div>
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
                  {operator.name} · {operator.isAbsolute ? 'Acesso total' : operator.roleName}
                </p>
              </SheetHeader>
              <nav
                className="h-[calc(100vh-8rem)] overflow-y-auto scrollbar-thin px-2 pb-4"
                aria-label="Navegação do ERP"
              >
                <NavItems allowed={allowed} active={active} onSelect={handleSelect} />
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

            {/* Menu do usuário */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="h-9 max-w-[240px] gap-2 px-2 md:px-3"
                  aria-label="Menu do usuário"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                    {operator.name.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="hidden min-w-0 flex-col items-start leading-tight sm:flex">
                    <span className="max-w-[140px] truncate text-xs font-semibold">{operator.name}</span>
                    <span className="max-w-[140px] truncate text-[10px] text-muted-foreground">
                      {operator.isAbsolute ? 'Acesso total' : operator.roleName || operator.role}
                    </span>
                  </span>
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>
                  <p className="text-sm font-semibold">{operator.name}</p>
                  <p className="text-xs font-normal text-muted-foreground">{operator.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  {operator.company?.name ?? 'Sem empresa vinculada'}
                  {operator.branches.length > 0 && (
                    <>
                      {' · '}
                      {operator.branches.map((b) => b.name).join(', ')}
                    </>
                  )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setChangePwdOpen(true)}>
                  <KeyRound className="size-4" />
                  Alterar senha
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={handleLogout}>
                  <LogOut className="size-4" />
                  Sair da sessão
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {(denied || allowed.length === 0) ? (
              <AccessDenied onBack={() => setRequested(allowed[0] ?? 'dashboard')} />
            ) : (
              <ActiveView operator={operator} />
            )}
          </motion.div>
        </main>

        <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-xs text-muted-foreground md:px-6">
          <span>BAKERY ERP • Gestão 360° para padarias</span>
          <span>Next.js 16 • SQLite • Argon2id • Sessões e permissões granulares</span>
        </footer>
      </div>

      {/* Troca de senha (forçada quando exigida pelo administrador) */}
      <ChangePasswordDialog
        forced={operator.mustChangePassword && !pwdForcedDone}
        open={operator.mustChangePassword && !pwdForcedDone ? true : changePwdOpen}
        onOpenChange={(open) => setChangePwdOpen(open)}
        onDone={() => {
          setPwdForcedDone(true)
          void refreshSession()
        }}
      />
    </div>
  )
}
