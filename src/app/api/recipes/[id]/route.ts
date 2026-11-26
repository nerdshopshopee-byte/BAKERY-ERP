// BAKERY ERP - API de receita individual
// PATCH  /api/recipes/[id] -> atualiza name/notes/laborCost/yieldQty/unit
// DELETE /api/recipes/[id] -> deleta receita e seus items

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

type RecipeUpdate = {
  name?: string
  notes?: string | null
  laborCost?: number
  packagingCost?: number
  lossPct?: number
  prepTimeMin?: number | null
  targetMarginPct?: number | null
  yieldQty?: number
  unit?: string
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardApi(request, 'production.recipes.edit')
  if (!g.ok) return g.response

  const { id } = await params

  const existing = await db.recipe.findUnique({ where: { id } })
  if (!existing) {
    return Response.json({ error: 'Receita não encontrada' }, { status: 404 })
  }

  const body = await readBody(request)
  const update: RecipeUpdate = {}

  if ('name' in body) {
    const name = str(body.name)
    if (!name) {
      return Response.json({ error: 'Nome da receita não pode ser vazio' }, { status: 400 })
    }
    update.name = name
  }

  if ('notes' in body) update.notes = str(body.notes)

  if ('laborCost' in body) {
    const laborCost = body.laborCost
    if (typeof laborCost !== 'number' || !Number.isFinite(laborCost) || laborCost < 0) {
      return Response.json({ error: 'laborCost deve ser um número >= 0' }, { status: 400 })
    }
    update.laborCost = round2(laborCost)
  }

  if ('packagingCost' in body) {
    const packagingCost = body.packagingCost
    if (typeof packagingCost !== 'number' || !Number.isFinite(packagingCost) || packagingCost < 0) {
      return Response.json({ error: 'packagingCost deve ser um número >= 0' }, { status: 400 })
    }
    update.packagingCost = round2(packagingCost)
  }

  if ('lossPct' in body) {
    const lossPct = body.lossPct
    if (typeof lossPct !== 'number' || !Number.isFinite(lossPct) || lossPct < 0 || lossPct > 100) {
      return Response.json({ error: 'lossPct deve ser um número entre 0 e 100' }, { status: 400 })
    }
    update.lossPct = lossPct
  }

  if ('prepTimeMin' in body) {
    const prepTimeMin = body.prepTimeMin
    if (prepTimeMin === null) {
      update.prepTimeMin = null
    } else if (typeof prepTimeMin === 'number' && Number.isFinite(prepTimeMin) && prepTimeMin >= 0) {
      update.prepTimeMin = Math.trunc(prepTimeMin)
    } else {
      return Response.json({ error: 'prepTimeMin deve ser minutos >= 0' }, { status: 400 })
    }
  }

  if ('targetMarginPct' in body) {
    const targetMarginPct = body.targetMarginPct
    if (targetMarginPct === null) {
      update.targetMarginPct = null
    } else if (
      typeof targetMarginPct === 'number' &&
      Number.isFinite(targetMarginPct) &&
      targetMarginPct >= 0 &&
      targetMarginPct < 100
    ) {
      update.targetMarginPct = targetMarginPct
    } else {
      return Response.json({ error: 'targetMarginPct deve ser % entre 0 e 99' }, { status: 400 })
    }
  }

  if ('yieldQty' in body) {
    const yieldQty = body.yieldQty
    if (typeof yieldQty !== 'number' || !Number.isFinite(yieldQty) || yieldQty <= 0) {
      return Response.json({ error: 'yieldQty deve ser um número > 0' }, { status: 400 })
    }
    update.yieldQty = yieldQty
  }

  if ('unit' in body) {
    const unit = str(body.unit)
    if (!unit) {
      return Response.json({ error: 'unit não pode ser vazio' }, { status: 400 })
    }
    update.unit = unit
  }

  const recipe = await db.$transaction(async (tx) => {
    const updated = await tx.recipe.update({ where: { id }, data: update })

    // Histórico de custo: snapshot automático quando campos de custo mudam
    const costRelevant = [
      'laborCost',
      'packagingCost',
      'lossPct',
      'yieldQty',
    ] as const
    if (costRelevant.some((key) => key in update)) {
      const items = await tx.recipeItem.findMany({ where: { recipeId: id } })
      const ingredients = await tx.ingredient.findMany()
      const ingredientMap = new Map(ingredients.map((i) => [i.id, i]))
      const ingredientsCost = items.reduce(
        (acc, item) => acc + item.qty * (ingredientMap.get(item.ingredientId)?.costPerUnit ?? 0),
        0,
      )
      const lossCost = ingredientsCost * (updated.lossPct / 100)
      const totalCost = ingredientsCost + lossCost + updated.laborCost + updated.packagingCost
      const yieldQty = updated.yieldQty > 0 ? updated.yieldQty : 1
      await tx.recipeCostSnapshot.create({
        data: {
          recipeId: id,
          totalCost: Math.round(totalCost * 100 + Number.EPSILON) / 100,
          costPerUnit: Math.round((totalCost / yieldQty) * 100 + Number.EPSILON) / 100,
          source: 'AUTO',
        },
      })
    }
    return updated
  })
  return Response.json(recipe)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guardApi(_request, 'production.recipes.edit')
  if (!g.ok) return g.response

  const { id } = await params

  const existing = await db.recipe.findUnique({ where: { id } })
  if (!existing) {
    return Response.json({ error: 'Receita não encontrada' }, { status: 404 })
  }

  await db.$transaction([
    db.recipeItem.deleteMany({ where: { recipeId: id } }),
    db.recipe.delete({ where: { id } }),
  ])

  return Response.json({ ok: true })
}
