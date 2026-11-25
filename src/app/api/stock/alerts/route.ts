// BAKERY ERP - API de alertas de estoque
// GET /api/stock/alerts -> { lowStock: [...], critical: [...] }
// lowStock: stock <= minStock (ordenado pela razão stock/minStock asc)
// critical: subconjunto com stock <= minStock * 0.5

import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

// Sempre executa no request (evita cache estático no build)
export const dynamic = 'force-dynamic'

function stockRatio(ingredient: { stock: number; minStock: number }): number {
  if (ingredient.minStock > 0) return ingredient.stock / ingredient.minStock
  // minStock = 0: só entra no alerta quando stock = 0 -> vai para o fim da fila
  return Number.POSITIVE_INFINITY
}

export async function GET(request: NextRequest) {
  const g = await guardApi(request, 'inventory.view')
  if (!g.ok) return g.response

  const ingredients = await db.ingredient.findMany({ orderBy: { name: 'asc' } })

  const lowStock = ingredients
    .filter((ingredient) => ingredient.stock <= ingredient.minStock)
    .sort((a, b) => stockRatio(a) - stockRatio(b))

  const critical = lowStock.filter(
    (ingredient) => ingredient.stock <= ingredient.minStock * 0.5,
  )

  return Response.json({ lowStock, critical })
}
