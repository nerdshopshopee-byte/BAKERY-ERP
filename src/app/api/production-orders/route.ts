// BAKERY ERP - API de ordens de produção
// GET  /api/production-orders -> lista ordenada por createdAt desc, limite 100
// POST /api/production-orders -> cria ordem { recipeId, plannedQty>0, notes?, operator? }

import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

// Sempre executa no request (evita cache estático no build)
export const dynamic = 'force-dynamic'

const round2 = (value: number): number => Math.round(value * 100) / 100

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const raw: unknown = await request.json()
    if (typeof raw === 'object' && raw !== null) return raw as Record<string, unknown>
    return {}
  } catch {
    return {}
  }
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

export async function GET(request: NextRequest) {
  const g = await guardApi(request, 'production.view')
  if (!g.ok) return g.response

  const orders = await db.productionOrder.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return Response.json(orders)
}

export async function POST(request: NextRequest) {
  const g = await guardApi(request, 'production.orders.create')
  if (!g.ok) return g.response

  const body = await readBody(request)

  const recipeId = str(body.recipeId)
  if (!recipeId) {
    return Response.json({ error: 'recipeId é obrigatório' }, { status: 400 })
  }

  const recipe = await db.recipe.findUnique({ where: { id: recipeId } })
  if (!recipe) {
    return Response.json({ error: 'Receita não encontrada' }, { status: 400 })
  }

  const plannedQty =
    typeof body.plannedQty === 'number' && Number.isFinite(body.plannedQty)
      ? body.plannedQty
      : null
  if (plannedQty === null || plannedQty <= 0) {
    return Response.json({ error: 'plannedQty deve ser um número > 0' }, { status: 400 })
  }

  const count = await db.productionOrder.count()
  const code = `OP-${new Date().getFullYear()}-${String(count + 1).padStart(3, '0')}`

  const order = await db.productionOrder.create({
    data: {
      code,
      recipeId,
      recipeName: recipe.name,
      plannedQty: round2(plannedQty),
      status: 'PLANEJADA',
      operator: str(body.operator),
      notes: str(body.notes),
    },
  })

  return Response.json(order, { status: 201 })
}
