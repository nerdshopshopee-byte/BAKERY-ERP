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

  const recipe = await db.recipe.update({ where: { id }, data: update })
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
