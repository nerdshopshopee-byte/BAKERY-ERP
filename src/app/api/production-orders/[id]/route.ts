// BAKERY ERP - API de ordem de produção individual (ações de fluxo)
// PATCH /api/production-orders/[id] { action: 'start' | 'complete' | 'cancel', producedQty?, operator?,
//   batchCode?, lossQty?, shelfLifeDays?, consumption?: [{ ingredientId, actualQty }] }
// - start:    PLANEJADA -> EM_ANDAMENTO (startedAt)
// - complete: PLANEJADA/EM_ANDAMENTO -> CONCLUIDA; registra consumo REAL por insumo
//             (previsto vs efetivo), calcula custo previsto x real, cria lote e
//             movimentações (insumos negativos + produto produzido)
// - cancel:   PLANEJADA/EM_ANDAMENTO -> CANCELADA

import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

// Sempre executa no request (evita cache estático no build)
export const dynamic = 'force-dynamic'

const round2 = (value: number): number => Math.round(value * 100) / 100

class ApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

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

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardApi(request, 'production.orders.execute')
  if (!g.ok) return g.response

  const { id } = await params

  const order = await db.productionOrder.findUnique({ where: { id } })
  if (!order) {
    return Response.json({ error: 'Ordem de produção não encontrada' }, { status: 404 })
  }

  const body = await readBody(request)

  const action = body.action
  if (action !== 'start' && action !== 'complete' && action !== 'cancel') {
    return Response.json(
      { error: "Ação inválida (use 'start', 'complete' ou 'cancel')" },
      { status: 400 },
    )
  }

  const operator = str(body.operator)

  try {
    if (action === 'start') {
      if (order.status !== 'PLANEJADA') {
        return Response.json(
          { error: `Ordem não pode ser iniciada (status atual: ${order.status})` },
          { status: 400 },
        )
      }
      const updated = await db.productionOrder.update({
        where: { id },
        data: {
          status: 'EM_ANDAMENTO',
          startedAt: new Date(),
          ...(operator ? { operator } : {}),
        },
      })
      return Response.json(updated)
    }

    if (action === 'cancel') {
      if (order.status !== 'PLANEJADA' && order.status !== 'EM_ANDAMENTO') {
        return Response.json(
          { error: `Ordem não pode ser cancelada (status atual: ${order.status})` },
          { status: 400 },
        )
      }
      const updated = await db.productionOrder.update({
        where: { id },
        data: {
          status: 'CANCELADA',
          ...(operator ? { operator } : {}),
        },
      })
      return Response.json(updated)
    }

    // action === 'complete'
    if (order.status === 'CONCLUIDA') {
      return Response.json({ error: 'Ordem já concluída' }, { status: 400 })
    }
    if (order.status !== 'PLANEJADA' && order.status !== 'EM_ANDAMENTO') {
      return Response.json(
        { error: `Ordem não pode ser concluída (status atual: ${order.status})` },
        { status: 400 },
      )
    }

    let producedQty = order.plannedQty
    if ('producedQty' in body) {
      const value = body.producedQty
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return Response.json(
          { error: 'producedQty deve ser um número > 0' },
          { status: 400 },
        )
      }
      producedQty = value
    }

    // Perdas do lote (não podem exceder o produzido + previsto de forma absurda)
    let lossQty = order.lossQty
    if ('lossQty' in body) {
      const value = body.lossQty
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        return Response.json({ error: 'lossQty deve ser um número >= 0' }, { status: 400 })
      }
      lossQty = value
    }
    if (lossQty > producedQty) {
      return Response.json(
        { error: 'Perda não pode ser maior que a quantidade produzida' },
        { status: 400 },
      )
    }

    let batchCode = order.batchCode
    if ('batchCode' in body) batchCode = str(body.batchCode)

    let shelfLifeDays = order.shelfLifeDays
    if ('shelfLifeDays' in body) {
      const value = body.shelfLifeDays
      if (value === null) {
        shelfLifeDays = null
      } else if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        shelfLifeDays = Math.trunc(value)
      } else {
        return Response.json({ error: 'shelfLifeDays deve ser dias > 0' }, { status: 400 })
      }
    }

    // Consumo real informado por insumo (opcional; default = previsto)
    const actualByIngredient = new Map<string, number>()
    if (Array.isArray(body.consumption)) {
      for (const entry of body.consumption as Array<{ ingredientId?: unknown; actualQty?: unknown }>) {
        const ingredientId = typeof entry?.ingredientId === 'string' ? entry.ingredientId : ''
        const actualQty = typeof entry?.actualQty === 'number' && Number.isFinite(entry.actualQty) && entry.actualQty >= 0
          ? entry.actualQty
          : null
        if (!ingredientId || actualQty === null) {
          return Response.json(
            { error: 'consumption inválido (use [{ ingredientId, actualQty }])' },
            { status: 400 },
          )
        }
        actualByIngredient.set(ingredientId, actualQty)
      }
    }

    const recipe = await db.recipe.findUnique({
      where: { id: order.recipeId },
      include: { items: true },
    })
    if (!recipe) {
      return Response.json({ error: 'Receita da ordem não encontrada' }, { status: 400 })
    }
    if (recipe.yieldQty <= 0) {
      return Response.json(
        { error: 'Receita com rendimento (yieldQty) inválido' },
        { status: 400 },
      )
    }

    const allIngredients = await db.ingredient.findMany()
    const ingredientMap = new Map(allIngredients.map((i) => [i.id, i]))

    // Quantidade proporcional por insumo (agrega itens duplicados do mesmo insumo)
    const qtyByIngredient = new Map<string, number>()
    const factor = order.plannedQty / recipe.yieldQty
    for (const item of recipe.items) {
      const proportional = round2(item.qty * factor)
      if (proportional <= 0) continue
      qtyByIngredient.set(
        item.ingredientId,
        (qtyByIngredient.get(item.ingredientId) ?? 0) + proportional,
      )
    }
    const deductions = Array.from(qtyByIngredient.entries()).map(([ingredientId, qty]) => ({
      ingredientId,
      qty: round2(qty),
      actualQty: round2(actualByIngredient.get(ingredientId) ?? qty),
    }))

    // Custos: teórico (ficha técnica x planejado) e real (consumo efetivo)
    const plannedIngredientsCost = round2(
      deductions.reduce((acc, d) => acc + d.qty * (ingredientMap.get(d.ingredientId)?.costPerUnit ?? 0), 0),
    )
    const realIngredientsCost = round2(
      deductions.reduce((acc, d) => acc + d.actualQty * (ingredientMap.get(d.ingredientId)?.costPerUnit ?? 0), 0),
    )
    const laborPerBatch = round2((recipe.laborCost + recipe.packagingCost) * (order.plannedQty / recipe.yieldQty))
    const plannedCost = round2(plannedIngredientsCost + laborPerBatch)
    const realCost = round2(realIngredientsCost + laborPerBatch)

    const updated = await db.$transaction(async (tx) => {
      // Verifica todos os saldos ANTES de aplicar qualquer dedução
      if (deductions.length > 0) {
        const toApply: { ingredientId: string; qty: number; newStock: number }[] = []
        for (const deduction of deductions) {
          const ingredient = ingredientMap.get(deduction.ingredientId)
          if (!ingredient) {
            throw new ApiError(`Insumo ${deduction.ingredientId} não encontrado`)
          }
          if (ingredient.stock < deduction.actualQty) {
            throw new ApiError(
              `Estoque insuficiente de "${ingredient.name}": disponível ${ingredient.stock}, necessário ${deduction.actualQty}`,
            )
          }
          toApply.push({
            ingredientId: deduction.ingredientId,
            qty: deduction.actualQty,
            newStock: round2(ingredient.stock - deduction.actualQty),
          })
        }

        for (const apply of toApply) {
          await tx.ingredient.update({
            where: { id: apply.ingredientId },
            data: { stock: apply.newStock },
          })
          await tx.stockMovement.create({
            data: {
              itemType: 'INGREDIENT',
              ingredientId: apply.ingredientId,
              productId: null,
              type: 'PRODUCAO',
              qty: -apply.qty,
              refId: order.id,
              reason: `OP ${order.code}`,
            },
          })

          // Registro do consumo real (previsto vs efetivo) - idempotente por OP+insumo
          const ingredient = ingredientMap.get(apply.ingredientId)
          const unitCost = ingredient?.costPerUnit ?? 0
          const existingConsumption = await tx.productionConsumption.findUnique({
            where: { orderId_ingredientId: { orderId: order.id, ingredientId: apply.ingredientId } },
          })
          if (existingConsumption) {
            await tx.productionConsumption.update({
              where: { id: existingConsumption.id },
              data: {
                actualQty: apply.qty,
                unitCost,
                cost: round2(apply.qty * unitCost),
              },
            })
          } else {
            await tx.productionConsumption.create({
              data: {
                orderId: order.id,
                ingredientId: apply.ingredientId,
                name: ingredient?.name ?? 'Insumo',
                unit: ingredient?.unit ?? 'UN',
                plannedQty: deductions.find((d) => d.ingredientId === apply.ingredientId)?.qty ?? 0,
                actualQty: apply.qty,
                unitCost,
                cost: round2(apply.qty * unitCost),
              },
            })
          }
        }
      }

      // Registra produção do produto final + entrada de estoque do produto
      if (recipe.productId) {
        await tx.stockMovement.create({
          data: {
            itemType: 'PRODUCT',
            ingredientId: null,
            productId: recipe.productId,
            type: 'PRODUCAO',
            qty: producedQty,
            refId: order.id,
            reason: `OP ${order.code}`,
          },
        })
        await tx.product.update({
          where: { id: recipe.productId },
          data: { stock: { increment: producedQty } },
        })
      }

      return tx.productionOrder.update({
        where: { id },
        data: {
          status: 'CONCLUIDA',
          producedQty,
          lossQty,
          ...(batchCode !== undefined ? { batchCode } : {}),
          ...(shelfLifeDays !== undefined ? { shelfLifeDays } : {}),
          plannedCost,
          realCost,
          finishedAt: new Date(),
          ...(operator ? { operator } : {}),
        },
      })
    })

    return Response.json(updated)
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json({ error: error.message }, { status: 400 })
    }
    return Response.json({ error: 'Erro ao processar ordem de produção' }, { status: 500 })
  }
}
