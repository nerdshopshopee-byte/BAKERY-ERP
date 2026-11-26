// GET /api/reports/profitability — rentabilidade por produto:
// vendas, receita, custo teórico (ficha técnica/produto), margem, desperdício.
// Alimenta o painel "quanto a padaria realmente ganha ou perde em cada produto".
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApiAny } from '@/lib/auth/guard'
import { round2 } from '@/lib/units'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const g = await guardApiAny(request, ['production.costs', 'finance.profit', 'reports.view'])
  if (!g.ok) return g.response

  const { searchParams } = new URL(request.url)
  const days = Math.min(Math.max(Number(searchParams.get('days')) || 30, 1), 365)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  const [products, recipes, saleItems, waste] = await Promise.all([
    db.product.findMany(),
    db.recipe.findMany({ include: { items: true } }),
    db.saleItem.findMany({
      where: { sale: { is: { status: 'CONCLUIDA', createdAt: { gte: since } } } },
    }),
    db.wasteRecord.findMany({ where: { createdAt: { gte: since } } }),
  ])

  const ingredientMap = new Map(
    (await db.ingredient.findMany()).map((i) => [i.id, i]),
  )

  // Custo teórico por produto: ficha técnica (quando há receita) senão product.cost
  const costByProduct = new Map<string, number>()
  const recipeByProduct = new Map<string, typeof recipes[number]>()
  for (const recipe of recipes) {
    if (!recipe.productId) continue
    const ingredientsCost = recipe.items.reduce(
      (acc, item) => acc + item.qty * (ingredientMap.get(item.ingredientId)?.costPerUnit ?? 0),
      0,
    )
    const lossCost = ingredientsCost * (recipe.lossPct / 100)
    const totalCost = ingredientsCost + lossCost + recipe.laborCost + recipe.packagingCost
    const perUnit = recipe.yieldQty > 0 ? totalCost / recipe.yieldQty : 0
    costByProduct.set(recipe.productId, round2(perUnit))
    recipeByProduct.set(recipe.productId, recipe)
  }
  for (const product of products) {
    if (!costByProduct.has(product.id)) costByProduct.set(product.id, product.cost)
  }

  // Agrega vendas por produto
  const salesByProduct = new Map<string, { qty: number; revenue: number; cost: number }>()
  for (const item of saleItems) {
    if (!item.productId) continue
    const current = salesByProduct.get(item.productId) ?? { qty: 0, revenue: 0, cost: 0 }
    const unitCost = costByProduct.get(item.productId) ?? 0
    current.qty = round2(current.qty + item.qty)
    current.revenue = round2(current.revenue + item.subtotal)
    current.cost = round2(current.cost + unitCost * item.qty)
    salesByProduct.set(item.productId, current)
  }

  // Desperdício por produto
  const wasteByProduct = new Map<string, number>()
  for (const record of waste) {
    if (record.itemType === 'PRODUCT' && record.productId) {
      wasteByProduct.set(
        record.productId,
        round2((wasteByProduct.get(record.productId) ?? 0) + record.cost),
      )
    }
  }

  const rows = products
    .map((product) => {
      const sales = salesByProduct.get(product.id) ?? { qty: 0, revenue: 0, cost: 0 }
      const wasteCost = wasteByProduct.get(product.id) ?? 0
      const unitCost = costByProduct.get(product.id) ?? 0
      const margin = round2(sales.revenue - sales.cost - wasteCost)
      const marginPct = sales.revenue > 0 ? round2((margin / sales.revenue) * 100) : null
      return {
        productId: product.id,
        name: product.name,
        saleUnit: product.saleUnit,
        unitPrice: product.price,
        unitCost,
        soldQty: sales.qty,
        revenue: sales.revenue,
        theoryCost: sales.cost,
        wasteCost,
        margin,
        marginPct,
        hasRecipe: recipeByProduct.has(product.id),
      }
    })
    .filter((row) => row.soldQty > 0 || row.wasteCost > 0)
    .sort((a, b) => b.revenue - a.revenue)

  const totals = rows.reduce(
    (acc, row) => ({
      revenue: round2(acc.revenue + row.revenue),
      cost: round2(acc.cost + row.theoryCost),
      waste: round2(acc.waste + row.wasteCost),
      margin: round2(acc.margin + row.margin),
    }),
    { revenue: 0, cost: 0, waste: 0, margin: 0 },
  )

  return Response.json({
    periodDays: days,
    totals: {
      ...totals,
      marginPct: totals.revenue > 0 ? round2((totals.margin / totals.revenue) * 100) : null,
    },
    rows,
  })
}
