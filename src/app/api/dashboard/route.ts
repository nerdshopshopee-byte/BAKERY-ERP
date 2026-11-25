// GET /api/dashboard — métricas consolidadas do ERP (DashboardDTO)
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

const round2 = (value: number) => Math.round(value * 100) / 100
const round1 = (value: number) => Math.round(value * 10) / 10

const dayLabel = (date: Date) =>
  `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`

export async function GET(request: NextRequest) {
  const g = await guardApi(request, 'dashboard.view')
  if (!g.ok) return g.response

  const now = new Date()

  const startToday = new Date(now)
  startToday.setHours(0, 0, 0, 0)

  const weekStart = new Date(startToday)
  weekStart.setDate(weekStart.getDate() - 6) // últimos 7 dias incluindo hoje

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const days30Start = new Date(startToday)
  days30Start.setDate(days30Start.getDate() - 29)

  // Vendas concluídas dos últimos 30 dias (base das métricas de receita)
  const sales30 = await db.sale.findMany({
    where: { status: 'CONCLUIDA', createdAt: { gte: days30Start } },
    include: { items: true, payments: true },
    orderBy: { createdAt: 'desc' },
  })

  const salesToday = sales30.filter(
    (sale) => sale.createdAt.getTime() >= startToday.getTime()
  )
  const salesWeek = sales30.filter(
    (sale) => sale.createdAt.getTime() >= weekStart.getTime()
  )
  const salesMonth = sales30.filter(
    (sale) => sale.createdAt.getTime() >= monthStart.getTime()
  )

  const revenueToday = round2(salesToday.reduce((acc, sale) => acc + sale.total, 0))
  const revenueWeek = round2(salesWeek.reduce((acc, sale) => acc + sale.total, 0))
  const revenueMonth = round2(salesMonth.reduce((acc, sale) => acc + sale.total, 0))
  const salesCountToday = salesToday.length
  const avgTicketToday = salesCountToday > 0 ? round2(revenueToday / salesCountToday) : 0

  // Mapa de produtos para custo e categoria
  const products = await db.product.findMany()
  const productMap = new Map(products.map((product) => [product.id, product]))

  let profitToday = 0
  for (const sale of salesToday) {
    for (const item of sale.items) {
      const product = productMap.get(item.productId)
      const cost = product ? product.cost : 0
      profitToday += item.subtotal - item.qty * cost
    }
  }
  profitToday = round2(profitToday)
  const marginToday = revenueToday > 0 ? round1((profitToday / revenueToday) * 100) : 0

  // Histórico de receita dos últimos 14 dias (inclui hoje)
  const revenueHistory: { date: string; label: string; total: number }[] = []
  for (let i = 13; i >= 0; i--) {
    const day = new Date(startToday)
    day.setDate(day.getDate() - i)
    const nextDay = new Date(day)
    nextDay.setDate(nextDay.getDate() + 1)
    const total = sales30
      .filter(
        (sale) =>
          sale.createdAt.getTime() >= day.getTime() &&
          sale.createdAt.getTime() < nextDay.getTime()
      )
      .reduce((acc, sale) => acc + sale.total, 0)
    revenueHistory.push({
      date: day.toISOString(),
      label: dayLabel(day),
      total: round2(total),
    })
  }

  // Vendas por categoria (itens dos últimos 30 dias)
  const categories = await db.category.findMany()
  const categoryMap = new Map(categories.map((category) => [category.id, category]))
  const categoryAgg = new Map<string, { name: string; emoji: string | null; total: number }>()
  for (const sale of sales30) {
    for (const item of sale.items) {
      const product = productMap.get(item.productId)
      const category = product?.categoryId
        ? categoryMap.get(product.categoryId)
        : undefined
      const key = category?.id ?? 'sem-categoria'
      const entry = categoryAgg.get(key) ?? {
        name: category?.name ?? 'Sem categoria',
        emoji: category?.emoji ?? null,
        total: 0,
      }
      entry.total += item.subtotal
      categoryAgg.set(key, entry)
    }
  }
  const categorySales = Array.from(categoryAgg.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 6)
    .map((entry) => ({ name: entry.name, emoji: entry.emoji, total: round2(entry.total) }))

  // Top produtos por quantidade (últimos 30 dias)
  const productAgg = new Map<string, { name: string; qty: number; total: number }>()
  for (const sale of sales30) {
    for (const item of sale.items) {
      const entry = productAgg.get(item.productId) ?? { name: item.name, qty: 0, total: 0 }
      entry.qty += item.qty
      entry.total += item.subtotal
      productAgg.set(item.productId, entry)
    }
  }
  const topProducts = Array.from(productAgg.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 8)
    .map((entry) => ({ name: entry.name, qty: round2(entry.qty), total: round2(entry.total) }))

  // Saldo de caixa: sessão aberta (saldo vivo) ou fechamento da última sessão
  let cashBalance = 0
  const openSession = await db.cashSession.findFirst({
    where: { status: 'ABERTO' },
    orderBy: { openedAt: 'desc' },
  })
  if (openSession) {
    const movements = await db.cashMovement.findMany({
      where: { sessionId: openSession.id },
    })
    let balance = openSession.openingBalance
    for (const movement of movements) {
      if (movement.type === 'VENDA') {
        if (movement.method === 'DINHEIRO') balance += movement.amount
      } else if (movement.type === 'SUPRIMENTO') {
        balance += movement.amount
      } else if (movement.type === 'SANGRIA') {
        balance -= Math.abs(movement.amount)
      }
    }
    cashBalance = round2(balance)
  } else {
    const lastClosed = await db.cashSession.findFirst({
      where: { status: 'FECHADO' },
      orderBy: { closedAt: 'desc' },
    })
    cashBalance = lastClosed?.closingBalance ?? 0
  }

  const [payablesPendingSum, payablesOverdueSum, receivablesPendingSum, ordersOpen, productionPending] =
    await Promise.all([
      db.payable.aggregate({ _sum: { amount: true }, where: { status: 'PENDENTE' } }),
      db.payable.aggregate({
        _sum: { amount: true },
        where: { status: 'PENDENTE', dueDate: { lt: now } },
      }),
      db.receivable.aggregate({ _sum: { amount: true }, where: { status: 'PENDENTE' } }),
      db.order.count({ where: { status: { in: ['AGUARDANDO', 'PREPARANDO', 'PRONTO'] } } }),
      db.productionOrder.count({
        where: { status: { in: ['PLANEJADA', 'EM_ANDAMENTO'] } },
      }),
    ])

  // Insumos com estoque baixo, ordenados pela razão stock/minStock
  const ingredients = await db.ingredient.findMany()
  const lowStockIngredients = ingredients
    .filter((ingredient) => ingredient.minStock > 0 && ingredient.stock <= ingredient.minStock)
    .sort((a, b) => a.stock / a.minStock - b.stock / b.minStock)
    .slice(0, 8)
    .map((ingredient) => ({
      name: ingredient.name,
      stock: ingredient.stock,
      minStock: ingredient.minStock,
      unit: ingredient.unit,
    }))

  const alerts = await db.alert.findMany({ orderBy: { createdAt: 'desc' }, take: 10 })

  // Formas de pagamento de hoje
  const paymentAgg = new Map<string, number>()
  for (const sale of salesToday) {
    for (const payment of sale.payments) {
      paymentAgg.set(payment.method, (paymentAgg.get(payment.method) ?? 0) + payment.amount)
    }
  }
  const paymentMethods = Array.from(paymentAgg.entries()).map(([method, total]) => ({
    method,
    total: round2(total),
  }))

  return Response.json({
    revenueToday,
    revenueWeek,
    revenueMonth,
    salesCountToday,
    avgTicketToday,
    profitToday,
    marginToday,
    revenueHistory,
    categorySales,
    topProducts,
    cashBalance,
    payablesPending: round2(payablesPendingSum._sum.amount ?? 0),
    payablesOverdue: round2(payablesOverdueSum._sum.amount ?? 0),
    receivablesPending: round2(receivablesPendingSum._sum.amount ?? 0),
    ordersOpen,
    productionPending,
    lowStockIngredients,
    alerts,
    paymentMethods,
  })
}
