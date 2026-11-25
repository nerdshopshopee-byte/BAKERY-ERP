// BAKERY ERP - API de receitas
// GET  /api/recipes -> lista com items enriquecidos e custos computados (totalCost, costPerUnit)
// POST /api/recipes -> cria receita com items (create aninhado de RecipeItem)

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
  const g = await guardApi(request, 'production.recipes.view')
  if (!g.ok) return g.response

  const [recipes, ingredients] = await Promise.all([
    db.recipe.findMany({ include: { items: true }, orderBy: { name: 'asc' } }),
    db.ingredient.findMany(),
  ])

  const ingredientMap = new Map(ingredients.map((i) => [i.id, i]))

  const result = recipes.map((recipe) => {
    const items = recipe.items.map((item) => {
      const ingredient = ingredientMap.get(item.ingredientId)
      return {
        id: item.id,
        recipeId: item.recipeId,
        ingredientId: item.ingredientId,
        qty: item.qty,
        ingredientName: ingredient?.name ?? null,
        unit: ingredient?.unit ?? null,
        costPerUnit: ingredient?.costPerUnit ?? null,
      }
    })

    const ingredientsCost = round2(
      items.reduce((acc, item) => acc + item.qty * (item.costPerUnit ?? 0), 0),
    )
    const totalCost = round2(ingredientsCost + recipe.laborCost)
    const costPerUnit = recipe.yieldQty > 0 ? round2(totalCost / recipe.yieldQty) : 0

    return { ...recipe, items, totalCost, costPerUnit }
  })

  return Response.json(result)
}

export async function POST(request: NextRequest) {
  const g = await guardApi(request, 'production.recipes.edit')
  if (!g.ok) return g.response

  const body = await readBody(request)

  const name = str(body.name)
  if (!name) {
    return Response.json({ error: 'Nome da receita é obrigatório' }, { status: 400 })
  }

  const yieldQty =
    typeof body.yieldQty === 'number' && Number.isFinite(body.yieldQty) ? body.yieldQty : null
  if (yieldQty === null || yieldQty <= 0) {
    return Response.json({ error: 'yieldQty deve ser um número > 0' }, { status: 400 })
  }

  const laborCost =
    typeof body.laborCost === 'number' && Number.isFinite(body.laborCost)
      ? body.laborCost
      : 0
  if (laborCost < 0) {
    return Response.json({ error: 'laborCost deve ser um número >= 0' }, { status: 400 })
  }

  let unit = 'UN'
  const unitInput = str(body.unit)
  if (unitInput) unit = unitInput

  let productId: string | null = null
  const productIdInput = str(body.productId)
  if (productIdInput) {
    const product = await db.product.findUnique({ where: { id: productIdInput } })
    if (!product) {
      return Response.json({ error: 'Produto não encontrado' }, { status: 400 })
    }
    productId = productIdInput
  }

  // Validação dos items
  const rawItems: unknown[] = Array.isArray(body.items) ? body.items : []
  const items: { ingredientId: string; qty: number }[] = []
  for (const rawItem of rawItems) {
    if (typeof rawItem !== 'object' || rawItem === null) {
      return Response.json({ error: 'Item de receita inválido' }, { status: 400 })
    }
    const item = rawItem as Record<string, unknown>
    const ingredientId = str(item.ingredientId)
    const qty = typeof item.qty === 'number' && Number.isFinite(item.qty) ? item.qty : null
    if (!ingredientId) {
      return Response.json({ error: 'Cada item precisa de ingredientId' }, { status: 400 })
    }
    if (qty === null || qty <= 0) {
      return Response.json({ error: 'Cada item precisa de qty > 0' }, { status: 400 })
    }
    items.push({ ingredientId, qty })
  }

  if (items.length > 0) {
    const ingredientIds = Array.from(new Set(items.map((i) => i.ingredientId)))
    const found = await db.ingredient.findMany({ where: { id: { in: ingredientIds } } })
    if (found.length < ingredientIds.length) {
      const foundIds = new Set(found.map((i) => i.id))
      const missing = ingredientIds.filter((id) => !foundIds.has(id))
      return Response.json(
        { error: `Insumo(s) não encontrado(s): ${missing.join(', ')}` },
        { status: 400 },
      )
    }
  }

  const recipe = await db.recipe.create({
    data: {
      name,
      productId,
      yieldQty,
      unit,
      laborCost: round2(laborCost),
      notes: str(body.notes),
      items: {
        create: items.map((item) => ({
          ingredientId: item.ingredientId,
          qty: item.qty,
        })),
      },
    },
    include: { items: true },
  })

  return Response.json(recipe, { status: 201 })
}
