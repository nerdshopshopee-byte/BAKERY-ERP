// PATCH /api/orders/[id] — transições de status do pedido (fluxo KDS)
// Integração com produção: ao iniciar PREPARANDO, consome os ingredientes da
// ficha técnica dos itens preparados (com adicionais/retiradas); ao CANCELAR
// depois do consumo, gera estorno rastreável. Idempotente por pedido+insumo.
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'
import { round2 } from '@/lib/units'

export const dynamic = 'force-dynamic'

function toErrorResponse(error: unknown): Response {
  console.error('[api/orders/[id]]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

const VALID_STATUSES = ['AGUARDANDO', 'PREPARANDO', 'PRONTO', 'ENTREGUE', 'CANCELADO']

// Transições válidas: qualquer status pode ir para CANCELADO
const TRANSITIONS: Record<string, string[]> = {
  AGUARDANDO: ['PREPARANDO', 'CANCELADO'],
  PREPARANDO: ['PRONTO', 'CANCELADO'],
  PRONTO: ['ENTREGUE', 'CANCELADO'],
  ENTREGUE: ['CANCELADO'],
  CANCELADO: [],
}

interface StatusBody {
  status?: string
}

type ConsumptionPlan = {
  ingredientId: string
  qty: number
  ingredientName: string
  unit: string
}

/** Monta o consumo por insumo para o pedido: ficha técnica x qty do item,
 *  + adicionais (somam) e retiradas (subtraem, mínimo zero). */
async function buildConsumptionPlan(orderId: string): Promise<ConsumptionPlan[]> {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { items: true } })
  if (!order) return []

  const products = await db.product.findMany({
    where: { id: { in: order.items.map((i) => i.productId).filter((id): id is string => Boolean(id)) } },
  })
  const productMap = new Map(products.map((p) => [p.id, p]))

  const recipes = await db.recipe.findMany({
    where: { productId: { in: products.map((p) => p.id) } },
    include: { items: true, modifiers: true },
  })
  const recipeByProduct = new Map(recipes.map((r) => [r.productId!, r]))
  const ingredientIds = new Set<string>(
    recipes.flatMap((r) => [...r.items.map((i) => i.ingredientId), ...r.modifiers.map((m) => m.ingredientId ?? '')]).filter(Boolean),
  )
  const ingredients = await db.ingredient.findMany({ where: { id: { in: Array.from(ingredientIds) } } })
  const ingredientMap = new Map(ingredients.map((i) => [i.id, i]))

  const plan = new Map<string, ConsumptionPlan>()

  const add = (ingredientId: string, qty: number) => {
    const ingredient = ingredientMap.get(ingredientId)
    if (!ingredient) return
    const current = plan.get(ingredientId)?.qty ?? 0
    plan.set(ingredientId, {
      ingredientId,
      qty: Math.max(0, round2(current + qty)),
      ingredientName: ingredient.name,
      unit: ingredient.unit,
    })
  }

  for (const item of order.items) {
    if (!item.productId) continue
    const recipe = recipeByProduct.get(item.productId)
    if (!recipe) continue // produto não preparado: nada a consumir
    const product = productMap.get(item.productId)
    if (product?.trackStock) continue // produto com estoque próprio: já baixou na venda

    const batchFactor = item.qty
    for (const recipeItem of recipe.items) {
      add(recipeItem.ingredientId, recipeItem.qty * batchFactor)
    }

    // Modificadores respeitam a escolha registrada na nota do item:
    //   ADDITION ("Bacon extra") só consome quando o atendente anotou o adicional
    //   REMOVAL ("Sem tomate") devolve o insumo previsto ao estoque
    const notes = (item.notes ?? '').toLowerCase()
    if (notes) {
      for (const modifier of recipe.modifiers) {
        if (!modifier.active || !modifier.ingredientId) continue
        const matches = notes.includes(modifier.name.toLowerCase())
        if (modifier.kind === 'ADDITION' && matches) {
          add(modifier.ingredientId, modifier.qty * batchFactor)
        }
        if (modifier.kind === 'REMOVAL' && matches) {
          add(modifier.ingredientId, -modifier.qty * batchFactor)
        }
      }
    }
  }

  return Array.from(plan.values()).filter((entry) => entry.qty > 0)
}

/** Estorna o consumo registrado (refId = order:{id}) restaurando o estoque. */
async function reverseConsumption(orderId: string, reason: string): Promise<void> {
  const movements = await db.stockMovement.findMany({
    where: { itemType: 'INGREDIENT', type: 'PREPARO', refId: `order:${orderId}` },
  })
  for (const movement of movements) {
    if (!movement.ingredientId) continue
    const ingredient = await db.ingredient.findUnique({ where: { id: movement.ingredientId } })
    if (!ingredient) continue
    const restore = Math.abs(movement.qty)
    await db.ingredient.update({
      where: { id: ingredient.id },
      data: { stock: round2(ingredient.stock + restore) },
    })
    await db.stockMovement.create({
      data: {
        itemType: 'INGREDIENT',
        ingredientId: ingredient.id,
        type: 'ESTORNO',
        qty: restore,
        refId: `order:${orderId}`,
        reason,
      },
    })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = (await request.json().catch(() => null)) as StatusBody | null

    // Permissão depende do corpo: transição de status -> orders.status; demais -> orders.edit
    const g = await guardApi(request, body?.status ? 'orders.status' : 'orders.edit')
    if (!g.ok) return g.response

    const status = body?.status
    if (!status || typeof status !== 'string' || !VALID_STATUSES.includes(status)) {
      return Response.json({ error: 'Status inválido' }, { status: 400 })
    }

    const order = await db.order.findUnique({ where: { id }, include: { items: true } })
    if (!order) {
      return Response.json({ error: 'Pedido não encontrado' }, { status: 404 })
    }

    const allowedTransitions = TRANSITIONS[order.status] ?? []
    if (!allowedTransitions.includes(status)) {
      return Response.json(
        { error: `Transição inválida: ${order.status} → ${status}` },
        { status: 400 }
      )
    }

    const now = new Date()
    const data: { status: string; startedAt?: Date; readyAt?: Date; deliveredAt?: Date } = {
      status,
    }
    if (status === 'PREPARANDO') data.startedAt = now
    if (status === 'PRONTO') data.readyAt = now
    if (status === 'ENTREGUE') data.deliveredAt = now

    // Consumo de ficha técnica ao iniciar preparo (idempotente por pedido)
    if (status === 'PREPARANDO') {
      const alreadyConsumed = await db.stockMovement.findFirst({
        where: { itemType: 'INGREDIENT', type: 'PREPARO', refId: `order:${order.id}` },
      })
      if (!alreadyConsumed) {
        const plan = await buildConsumptionPlan(order.id)
        for (const entry of plan) {
          const ingredient = await db.ingredient.findUnique({ where: { id: entry.ingredientId } })
          if (!ingredient) continue
          await db.ingredient.update({
            where: { id: entry.ingredientId },
            data: { stock: round2(Math.max(0, ingredient.stock - entry.qty)) },
          })
          await db.stockMovement.create({
            data: {
              itemType: 'INGREDIENT',
              ingredientId: entry.ingredientId,
              type: 'PREPARO',
              qty: -entry.qty,
              refId: `order:${order.id}`,
              reason: `Preparo pedido ${order.code}`,
            },
          })
        }
      }
    }

    // Cancelamento após consumo: estorno rastreável
    if (status === 'CANCELADO' && (order.status === 'PREPARANDO' || order.status === 'PRONTO' || order.status === 'ENTREGUE')) {
      await reverseConsumption(order.id, `Cancelamento pedido ${order.code}`)
    }

    const updated = await db.order.update({
      where: { id: order.id },
      data,
      include: { items: true },
    })
    return Response.json(updated)
  } catch (error) {
    return toErrorResponse(error)
  }
}
