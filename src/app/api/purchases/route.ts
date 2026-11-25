// GET /api/purchases — compras com itens | POST — criação (status PENDENTE)
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

const round2 = (value: number) => Math.round(value * 100) / 100

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (value.trim() !== '' && Number.isFinite(parsed)) return parsed
  }
  return null
}

function strField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function toErrorResponse(error: unknown): Response {
  console.error('[api/purchases]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

interface PurchaseItemBody {
  ingredientId?: string
  qty?: number
  unitCost?: number
}

interface PurchaseBody {
  supplierId?: string
  notes?: string
  items?: PurchaseItemBody[]
}

export async function GET(request: NextRequest) {
  try {
    const g = await guardApi(request, 'purchases.view')
    if (!g.ok) return g.response

    const purchases = await db.purchase.findMany({
      orderBy: { createdAt: 'desc' },
      include: { items: true },
    })
    return Response.json(purchases)
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const g = await guardApi(request, 'purchases.create')
    if (!g.ok) return g.response

    const body = (await request.json().catch(() => null)) as PurchaseBody | null
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
    }

    const supplierId = strField(body.supplierId)
    if (!supplierId) {
      return Response.json({ error: 'supplierId é obrigatório' }, { status: 400 })
    }

    const supplier = await db.supplier.findUnique({ where: { id: supplierId } })
    if (!supplier) {
      return Response.json({ error: 'Fornecedor não encontrado' }, { status: 400 })
    }

    const rawItems = Array.isArray(body.items) ? body.items : []
    if (rawItems.length === 0) {
      return Response.json({ error: 'Compra sem itens' }, { status: 400 })
    }

    const normalizedItems: { ingredientId: string; qty: number; unitCost: number }[] = []
    for (const item of rawItems) {
      const ingredientId = strField(item?.ingredientId)
      const qty = num(item?.qty)
      const unitCost = num(item?.unitCost)
      if (!ingredientId || qty === null || qty <= 0 || unitCost === null || unitCost < 0) {
        return Response.json(
          { error: 'Item inválido: informe ingrediente, quantidade > 0 e custo >= 0' },
          { status: 400 }
        )
      }
      normalizedItems.push({ ingredientId, qty, unitCost: round2(unitCost) })
    }

    // Snapshot de nome/unidade dos ingredientes
    const ingredientIds = Array.from(new Set(normalizedItems.map((item) => item.ingredientId)))
    const ingredients = await db.ingredient.findMany({
      where: { id: { in: ingredientIds } },
    })
    const ingredientMap = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]))
    for (const item of normalizedItems) {
      if (!ingredientMap.has(item.ingredientId)) {
        return Response.json({ error: 'Ingrediente não encontrado' }, { status: 400 })
      }
    }

    const total = round2(
      normalizedItems.reduce((acc, item) => acc + item.qty * item.unitCost, 0)
    )

    const purchaseCount = await db.purchase.count()
    const code = `PC-${String(1000 + purchaseCount)}`

    const purchase = await db.purchase.create({
      data: {
        code,
        supplierId,
        supplier: supplier.name,
        status: 'PENDENTE',
        total,
        notes: strField(body.notes),
        items: {
          create: normalizedItems.map((item) => {
            const ingredient = ingredientMap.get(item.ingredientId)
            return {
              ingredientId: item.ingredientId,
              name: ingredient ? ingredient.name : 'Ingrediente',
              unit: ingredient ? ingredient.unit : 'UN',
              qty: item.qty,
              unitCost: item.unitCost,
            }
          }),
        },
      },
    })

    const fullPurchase = await db.purchase.findUnique({
      where: { id: purchase.id },
      include: { items: true },
    })
    return Response.json(fullPurchase)
  } catch (error) {
    return toErrorResponse(error)
  }
}
