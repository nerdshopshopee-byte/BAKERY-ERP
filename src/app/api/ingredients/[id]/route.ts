// BAKERY ERP - API de insumo individual
// PATCH  /api/ingredients/[id] -> atualiza campos enviados
// DELETE /api/ingredients/[id] -> bloqueia exclusão se houver StockMovement/RecipeItem/PurchaseItem

import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

// Sempre executa no request (evita cache estático no build)
export const dynamic = 'force-dynamic'

const round2 = (value: number): number => Math.round(value * 100) / 100

const UNITS = ['KG', 'G', 'L', 'ML', 'UN', 'PCT'] as const

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

type IngredientUpdate = {
  name?: string
  unit?: string
  costPerUnit?: number
  stock?: number
  minStock?: number
  supplierId?: string | null
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardApi(request, 'inventory.ingredients')
  if (!g.ok) return g.response

  const { id } = await params

  const existing = await db.ingredient.findUnique({ where: { id } })
  if (!existing) {
    return Response.json({ error: 'Insumo não encontrado' }, { status: 404 })
  }

  const body = await readBody(request)
  const update: IngredientUpdate = {}

  if ('name' in body) {
    const name = str(body.name)
    if (!name) {
      return Response.json({ error: 'Nome do insumo não pode ser vazio' }, { status: 400 })
    }
    update.name = name
  }

  if ('unit' in body) {
    const unit = str(body.unit)
    if (!unit || !(UNITS as readonly string[]).includes(unit.toUpperCase())) {
      return Response.json(
        { error: `Unidade inválida (use: ${UNITS.join(', ')})` },
        { status: 400 },
      )
    }
    update.unit = unit.toUpperCase()
  }

  const numericFields: { key: 'costPerUnit' | 'stock' | 'minStock'; label: string }[] = [
    { key: 'costPerUnit', label: 'costPerUnit' },
    { key: 'stock', label: 'stock' },
    { key: 'minStock', label: 'minStock' },
  ]
  for (const field of numericFields) {
    if (field.key in body) {
      const value = body[field.key]
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return Response.json(
          { error: `${field.label} deve ser um número >= 0` },
          { status: 400 },
        )
      }
      update[field.key] = round2(value)
    }
  }

  if ('supplierId' in body) {
    const supplierId = str(body.supplierId)
    if (supplierId) {
      const supplier = await db.supplier.findUnique({ where: { id: supplierId } })
      if (!supplier) {
        return Response.json({ error: 'Fornecedor não encontrado' }, { status: 400 })
      }
    }
    update.supplierId = supplierId
  }

  const ingredient = await db.ingredient.update({ where: { id }, data: update })
  return Response.json(ingredient)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guardApi(_request, 'inventory.ingredients')
  if (!g.ok) return g.response

  const { id } = await params

  const existing = await db.ingredient.findUnique({ where: { id } })
  if (!existing) {
    return Response.json({ error: 'Insumo não encontrado' }, { status: 404 })
  }

  const [movements, recipeItems, purchaseItems] = await Promise.all([
    db.stockMovement.count({ where: { ingredientId: id } }),
    db.recipeItem.count({ where: { ingredientId: id } }),
    db.purchaseItem.count({ where: { ingredientId: id } }),
  ])

  if (movements > 0 || recipeItems > 0 || purchaseItems > 0) {
    const parts: string[] = []
    if (movements > 0) parts.push(`${movements} movimento(s) de estoque`)
    if (recipeItems > 0) parts.push(`${recipeItems} item(ns) de receita`)
    if (purchaseItems > 0) parts.push(`${purchaseItems} item(ns) de compra`)
    return Response.json(
      { error: `Não é possível excluir o insumo "${existing.name}": vinculado a ${parts.join(', ')}` },
      { status: 400 },
    )
  }

  try {
    await db.ingredient.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch {
    return Response.json(
      { error: 'Não foi possível excluir o insumo: existem registros vinculados' },
      { status: 400 },
    )
  }
}
