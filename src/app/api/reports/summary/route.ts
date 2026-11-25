// GET /api/reports/summary?days=30 — inteligência do negócio: DRE, vendas por categoria,
// top produtos, formas de pagamento, desperdício por motivo e produção planejada x realizada.
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

const round2 = (v: number) => Math.round(v * 100) / 100

function toErrorResponse(error: unknown): Response {
  console.error('[api/reports/summary]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

export async function GET(request: NextRequest) {
  try {
    const g = await guardApi(request, 'reports.view')
    if (!g.ok) return g.response

    const url = new URL(request.url)
    const daysRaw = Number(url.searchParams.get('days') ?? '30')
    const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(Math.floor(daysRaw), 365) : 30

    const to = new Date()
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000)

    const [sales, transactions, wasteRecords, productionOrders, orders] = await Promise.all([
      db.sale.findMany({
        where: { createdAt: { gte: from, lte: to }, status: 'CONCLUIDA' },
        include: { items: true, payments: true },
      }),
      db.transaction.findMany({ where: { date: { gte: from, lte: to }, type: 'DESPESA' } }),
      db.wasteRecord.findMany({ where: { createdAt: { gte: from, lte: to } } }),
      db.productionOrder.findMany({ where: { createdAt: { gte: from, lte: to }, status: { not: 'CANCELADA' } } }),
      db.order.findMany({
        where: { createdAt: { gte: from, lte: to }, status: { not: 'CANCELADO' } },
      }),
    ])

    // Produtos referenciados (custo e categoria)
    const productIds = Array.from(new Set(sales.flatMap((s) => s.items.map((i) => i.productId)).filter((v): v is string => Boolean(v))))
    const products = productIds.length > 0 ? await db.product.findMany({ where: { id: { in: productIds } } }) : []
    const categoryIds = Array.from(new Set(products.map((p) => p.categoryId).filter((v): v is string => Boolean(v))))
    const categories = categoryIds.length > 0 ? await db.category.findMany({ where: { id: { in: categoryIds } } }) : []
    const productMap = new Map(products.map((p) => [p.id, p]))
    const categoryMap = new Map(categories.map((c) => [c.id, c.name]))

    // ---------- DRE ----------
    let revenue = 0
    let cogs = 0
    for (const sale of sales) {
      revenue += sale.total
      for (const item of sale.items) {
        const product = item.productId ? productMap.get(item.productId) : undefined
        cogs += (product?.cost ?? item.unitPrice * 0.4) * item.qty
      }
    }
    revenue = round2(revenue)
    cogs = round2(cogs)

    const expenseMap = new Map<string, number>()
    let totalExpenses = 0
    for (const t of transactions) {
      const cat = t.category ?? 'OUTROS'
      const current = expenseMap.get(cat) ?? 0
      expenseMap.set(cat, current + t.amount)
      totalExpenses += t.amount
    }
    const expensesByCategory = Array.from(expenseMap.entries())
      .map(([category, amount]) => ({ category, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount)
    totalExpenses = round2(totalExpenses)

    const grossProfit = round2(revenue - cogs)
    const netProfit = round2(grossProfit - totalExpenses)
    const margin = revenue > 0 ? round2((netProfit / revenue) * 100) : 0

    // ---------- Vendas por categoria ----------
    const catAmountMap = new Map<string, number>()
    for (const sale of sales) {
      for (const item of sale.items) {
        const product = item.productId ? productMap.get(item.productId) : undefined
        const cat = product?.categoryId ? (categoryMap.get(product.categoryId) ?? 'Sem categoria') : 'Sem categoria'
        const current = catAmountMap.get(cat) ?? 0
        catAmountMap.set(cat, current + item.subtotal)
      }
    }
    const salesByCategory = Array.from(catAmountMap.entries())
      .map(([category, amount]) => ({ category, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount)

    // ---------- Top produtos ----------
    const productAgg = new Map<string, { name: string; qty: number; amount: number }>()
    for (const sale of sales) {
      for (const item of sale.items) {
        const key = item.productId ?? item.name
        const current = productAgg.get(key) ?? { name: item.name, qty: 0, amount: 0 }
        current.qty += item.qty
        current.amount += item.subtotal
        productAgg.set(key, current)
      }
    }
    const topProducts = Array.from(productAgg.values())
      .map((p) => ({ name: p.name, qty: round2(p.qty), amount: round2(p.amount) }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10)

    // ---------- Formas de pagamento ----------
    const methodMap = new Map<string, number>()
    for (const sale of sales) {
      for (const p of sale.payments) {
        const current = methodMap.get(p.method) ?? 0
        methodMap.set(p.method, current + p.amount)
      }
    }
    const salesByMethod = Array.from(methodMap.entries())
      .map(([method, amount]) => ({ method, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount)

    // ---------- Desperdício por motivo ----------
    const wasteMap = new Map<string, { amount: number; count: number }>()
    for (const w of wasteRecords) {
      const current = wasteMap.get(w.reason) ?? { amount: 0, count: 0 }
      current.amount += w.cost
      current.count += 1
      wasteMap.set(w.reason, current)
    }
    const wasteByReason = Array.from(wasteMap.entries())
      .map(([reason, v]) => ({ reason, amount: round2(v.amount), count: v.count }))
      .sort((a, b) => b.amount - a.amount)

    // ---------- Produção planejada x realizada ----------
    const planned = productionOrders.reduce((acc, o) => acc + o.plannedQty, 0)
    const done = productionOrders.reduce((acc, o) => acc + (o.producedQty ?? 0), 0)
    const accuracy = planned > 0 ? round2((done / planned) * 100) : 0

    // ---------- Pedidos (KDS) ----------
    const deliveredOrders = orders.filter((o) => o.status === 'ENTREGUE' && o.deliveredAt)
    const avgMinutes =
      deliveredOrders.length > 0
        ? round2(
            deliveredOrders.reduce((acc, o) => {
              const start = o.startedAt ?? o.createdAt
              return acc + (new Date(o.deliveredAt as Date).getTime() - new Date(start).getTime()) / 60000
            }, 0) / deliveredOrders.length,
          )
        : null

    return Response.json({
      period: { from: from.toISOString(), to: to.toISOString(), days },
      dre: {
        revenue,
        cogs,
        grossProfit,
        expensesByCategory,
        totalExpenses,
        netProfit,
        margin,
      },
      salesByCategory,
      topProducts,
      salesByMethod,
      wasteByReason,
      production: { planned: round2(planned), done: round2(done), accuracy },
      orders: { total: orders.length, delivered: deliveredOrders.length, avgMinutes },
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}
