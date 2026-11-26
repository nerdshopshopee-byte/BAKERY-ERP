// GET    /api/recipes/[id]/modifiers — lista modificadores da ficha técnica
// POST   /api/recipes/[id]/modifiers — cria adicional/retirada/opção
// PATCH  /api/recipes/[id]/modifiers — atualiza (body.modifierId)
// DELETE /api/recipes/[id]/modifiers?modifierId= — remove
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const raw: unknown = await request.json()
    return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

const VALID_KINDS = ['ADDITION', 'REMOVAL', 'OPTION']

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardApi(request, 'production.recipes.view')
  if (!g.ok) return g.response

  const { id } = await params
  const modifiers = await db.recipeModifier.findMany({
    where: { recipeId: id },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  })
  return Response.json(modifiers)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardApi(request, 'production.recipes.edit')
  if (!g.ok) return g.response

  const { id } = await params
  const recipe = await db.recipe.findUnique({ where: { id } })
  if (!recipe) return Response.json({ error: 'Receita não encontrada' }, { status: 404 })

  const body = await readBody(request)
  const name = str(body.name)
  const kind = str(body.kind) ?? 'ADDITION'
  if (!name) return Response.json({ error: 'Nome do modificador é obrigatório' }, { status: 400 })
  if (!VALID_KINDS.includes(kind)) {
    return Response.json({ error: 'kind inválido (ADDITION, REMOVAL, OPTION)' }, { status: 400 })
  }

  const ingredientId = str(body.ingredientId)
  if (ingredientId && kind !== 'REMOVAL') {
    const ingredient = await db.ingredient.findUnique({ where: { id: ingredientId } })
    if (!ingredient) return Response.json({ error: 'Insumo não encontrado' }, { status: 400 })
  }

  const qty = typeof body.qty === 'number' && Number.isFinite(body.qty) && body.qty >= 0 ? body.qty : 0
  const extraCost =
    typeof body.extraCost === 'number' && Number.isFinite(body.extraCost) && body.extraCost >= 0
      ? body.extraCost
      : 0
  const extraPrice =
    typeof body.extraPrice === 'number' && Number.isFinite(body.extraPrice) && body.extraPrice >= 0
      ? body.extraPrice
      : 0

  const modifier = await db.recipeModifier.create({
    data: {
      recipeId: id,
      name,
      kind,
      ingredientId,
      qty,
      unit: str(body.unit) ?? 'UN',
      extraCost,
      extraPrice,
      sortOrder: typeof body.sortOrder === 'number' ? Math.trunc(body.sortOrder) : 0,
    },
  })
  return Response.json(modifier, { status: 201 })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardApi(request, 'production.recipes.edit')
  if (!g.ok) return g.response

  const { id } = await params
  const body = await readBody(request)
  const modifierId = str(body.modifierId)
  if (!modifierId) return Response.json({ error: 'modifierId é obrigatório' }, { status: 400 })

  const existing = await db.recipeModifier.findUnique({ where: { id: modifierId } })
  if (!existing || existing.recipeId !== id) {
    return Response.json({ error: 'Modificador não encontrado' }, { status: 404 })
  }

  const data: Record<string, unknown> = {}
  if ('name' in body) {
    const name = str(body.name)
    if (!name) return Response.json({ error: 'Nome não pode ser vazio' }, { status: 400 })
    data.name = name
  }
  if ('kind' in body) {
    const kind = str(body.kind)
    if (!kind || !VALID_KINDS.includes(kind)) {
      return Response.json({ error: 'kind inválido' }, { status: 400 })
    }
    data.kind = kind
  }
  if ('ingredientId' in body) data.ingredientId = str(body.ingredientId)
  if ('qty' in body) {
    const qty = body.qty
    if (typeof qty !== 'number' || !Number.isFinite(qty) || qty < 0) {
      return Response.json({ error: 'qty deve ser >= 0' }, { status: 400 })
    }
    data.qty = qty
  }
  if ('unit' in body) data.unit = str(body.unit) ?? 'UN'
  if ('extraCost' in body) {
    const extraCost = body.extraCost
    if (typeof extraCost !== 'number' || !Number.isFinite(extraCost) || extraCost < 0) {
      return Response.json({ error: 'extraCost deve ser >= 0' }, { status: 400 })
    }
    data.extraCost = extraCost
  }
  if ('extraPrice' in body) {
    const extraPrice = body.extraPrice
    if (typeof extraPrice !== 'number' || !Number.isFinite(extraPrice) || extraPrice < 0) {
      return Response.json({ error: 'extraPrice deve ser >= 0' }, { status: 400 })
    }
    data.extraPrice = extraPrice
  }
  if ('sortOrder' in body && typeof body.sortOrder === 'number') data.sortOrder = Math.trunc(body.sortOrder)
  if ('active' in body) {
    if (typeof body.active !== 'boolean') {
      return Response.json({ error: 'active deve ser booleano' }, { status: 400 })
    }
    data.active = body.active
  }

  const modifier = await db.recipeModifier.update({ where: { id: modifierId }, data })
  return Response.json(modifier)
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardApi(request, 'production.recipes.edit')
  if (!g.ok) return g.response

  const { id } = await params
  const { searchParams } = new URL(request.url)
  const modifierId = searchParams.get('modifierId')
  if (!modifierId) return Response.json({ error: 'modifierId é obrigatório' }, { status: 400 })

  const existing = await db.recipeModifier.findUnique({ where: { id: modifierId } })
  if (!existing || existing.recipeId !== id) {
    return Response.json({ error: 'Modificador não encontrado' }, { status: 404 })
  }

  await db.recipeModifier.delete({ where: { id: modifierId } })
  return Response.json({ ok: true })
}
