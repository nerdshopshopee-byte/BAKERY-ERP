// BAKERY ERP - API de movimentações de estoque
// GET  /api/stock/movements?itemType=&ingredientId=&productId=&limit= (default 100)
// POST /api/stock/movements -> registra movimento e aplica saldo em insumos

import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

// Sempre executa no request (evita cache estático no build)
export const dynamic = 'force-dynamic'

const round2 = (value: number): number => Math.round(value * 100) / 100

const ITEM_TYPES = ['INGREDIENT', 'PRODUCT'] as const
const MOVEMENT_TYPES = ['ENTRADA', 'SAIDA', 'AJUSTE', 'PERDA'] as const

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
  const g = await guardApi(request, 'inventory.view')
  if (!g.ok) return g.response

  const { searchParams } = new URL(request.url)
  const itemType = (searchParams.get('itemType') ?? '').trim()
  const ingredientId = (searchParams.get('ingredientId') ?? '').trim()
  const productId = (searchParams.get('productId') ?? '').trim()
  const limitRaw = Number(searchParams.get('limit'))
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.round(limitRaw) : 100

  const where: { itemType?: string; ingredientId?: string; productId?: string } = {}
  if ((ITEM_TYPES as readonly string[]).includes(itemType)) where.itemType = itemType
  if (ingredientId) where.ingredientId = ingredientId
  if (productId) where.productId = productId

  const movements = await db.stockMovement.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  const ingredientIds = Array.from(
    new Set(movements.map((m) => m.ingredientId).filter((v): v is string => v !== null)),
  )
  const productIds = Array.from(
    new Set(movements.map((m) => m.productId).filter((v): v is string => v !== null)),
  )

  const [ingredients, products] = await Promise.all([
    ingredientIds.length > 0
      ? db.ingredient.findMany({ where: { id: { in: ingredientIds } } })
      : Promise.resolve([]),
    productIds.length > 0
      ? db.product.findMany({ where: { id: { in: productIds } } })
      : Promise.resolve([]),
  ])

  const nameMap = new Map<string, string>()
  for (const ingredient of ingredients) nameMap.set(ingredient.id, ingredient.name)
  for (const product of products) nameMap.set(product.id, product.name)

  const enriched = movements.map((movement) => {
    const key = movement.ingredientId ?? movement.productId
    return {
      ...movement,
      itemName: key ? nameMap.get(key) ?? null : null,
    }
  })

  return Response.json(enriched)
}

export async function POST(request: NextRequest) {
  const body = await readBody(request)

  // Permissão depende do tipo de movimento enviado no corpo
  const requestedType = typeof body.type === 'string' ? body.type : ''
  const permission =
    requestedType === 'ENTRADA'
      ? 'inventory.entries'
      : requestedType === 'SAIDA'
        ? 'inventory.exits'
        : 'inventory.adjust'
  const g = await guardApi(request, permission)
  if (!g.ok) return g.response

  const itemType = typeof body.itemType === 'string' ? body.itemType : ''
  if (!(ITEM_TYPES as readonly string[]).includes(itemType)) {
    return Response.json(
      { error: "itemType inválido (use 'INGREDIENT' ou 'PRODUCT')" },
      { status: 400 },
    )
  }

  const type = typeof body.type === 'string' ? body.type : ''
  if (!(MOVEMENT_TYPES as readonly string[]).includes(type)) {
    return Response.json(
      { error: "type inválido (use 'ENTRADA', 'SAIDA', 'AJUSTE' ou 'PERDA')" },
      { status: 400 },
    )
  }

  const qty = typeof body.qty === 'number' && Number.isFinite(body.qty) ? body.qty : null
  if (qty === null || (type === 'AJUSTE' ? qty < 0 : qty <= 0)) {
    return Response.json(
      { error: type === 'AJUSTE' ? 'qty deve ser um número >= 0' : 'qty deve ser um número > 0' },
      { status: 400 },
    )
  }

  if ('unitCost' in body) {
    const unitCost = body.unitCost
    if (
      unitCost !== null &&
      (typeof unitCost !== 'number' || !Number.isFinite(unitCost) || unitCost < 0)
    ) {
      return Response.json({ error: 'unitCost deve ser um número >= 0' }, { status: 400 })
    }
  }

  const reason = str(body.reason)
  const unitCost = typeof body.unitCost === 'number' && Number.isFinite(body.unitCost) ? body.unitCost : null

  if (itemType === 'INGREDIENT') {
    const ingredientId = str(body.ingredientId)
    if (!ingredientId) {
      return Response.json(
        { error: 'ingredientId é obrigatório para movimentação de insumo' },
        { status: 400 },
      )
    }

    const ingredient = await db.ingredient.findUnique({ where: { id: ingredientId } })
    if (!ingredient) {
      return Response.json({ error: 'Insumo não encontrado' }, { status: 400 })
    }

    let newStock = ingredient.stock
    if (type === 'ENTRADA') {
      newStock = round2(ingredient.stock + qty)
    } else if (type === 'SAIDA' || type === 'PERDA') {
      newStock = round2(ingredient.stock - qty)
      if (newStock < 0) {
        return Response.json(
          {
            error: `Estoque insuficiente de "${ingredient.name}": disponível ${ingredient.stock}, solicitado ${qty}`,
          },
          { status: 400 },
        )
      }
    } else {
      // AJUSTE: qty define o novo saldo absoluto; no ledger registramos o delta
      newStock = round2(qty)
    }

    const movementQty = type === 'AJUSTE' ? round2(newStock - ingredient.stock) : qty

    const [, movement] = await db.$transaction([
      db.ingredient.update({
        where: { id: ingredientId },
        data: { stock: newStock },
      }),
      db.stockMovement.create({
        data: {
          itemType: 'INGREDIENT',
          ingredientId,
          productId: null,
          type,
          qty: movementQty,
          unitCost,
          reason,
        },
      }),
    ])

    return Response.json({ ok: true, movement }, { status: 201 })
  }

  // itemType === 'PRODUCT': produtos não possuem saldo, apenas registra o movimento
  const productId = str(body.productId)
  if (!productId) {
    return Response.json(
      { error: 'productId é obrigatório para movimentação de produto' },
      { status: 400 },
    )
  }

  const product = await db.product.findUnique({ where: { id: productId } })
  if (!product) {
    return Response.json({ error: 'Produto não encontrado' }, { status: 400 })
  }

  const movement = await db.stockMovement.create({
    data: {
      itemType: 'PRODUCT',
      ingredientId: null,
      productId,
      type,
      qty,
      unitCost,
      reason,
    },
  })

  return Response.json({ ok: true, movement }, { status: 201 })
}
