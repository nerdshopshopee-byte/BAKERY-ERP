// BAKERY ERP - API de ordem de produção individual (ações de fluxo)
// PATCH /api/production-orders/[id] { action: 'start' | 'complete' | 'cancel', producedQty?, operator? }
// - start:    PLANEJADA -> EM_ANDAMENTO (startedAt)
// - complete: PLANEJADA/EM_ANDAMENTO -> CONCLUIDA; deduz insumos da receita em transação
//             e registra movimentações (insumos negativos + produto produzido)
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
    }))

    const updated = await db.$transaction(async (tx) => {
      // Verifica todos os saldos ANTES de aplicar qualquer dedução
      if (deductions.length > 0) {
        const ingredients = await tx.ingredient.findMany({
          where: { id: { in: deductions.map((d) => d.ingredientId) } },
        })
        const ingredientMap = new Map(ingredients.map((i) => [i.id, i]))

        const toApply: { ingredientId: string; qty: number; newStock: number }[] = []
        for (const deduction of deductions) {
          const ingredient = ingredientMap.get(deduction.ingredientId)
          if (!ingredient) {
            throw new ApiError(`Insumo ${deduction.ingredientId} não encontrado`)
          }
          if (ingredient.stock < deduction.qty) {
            throw new ApiError(
              `Estoque insuficiente de "${ingredient.name}": disponível ${ingredient.stock}, necessário ${deduction.qty}`,
            )
          }
          toApply.push({
            ingredientId: deduction.ingredientId,
            qty: deduction.qty,
            newStock: round2(ingredient.stock - deduction.qty),
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
        }
      }

      // Registra produção do produto final
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
      }

      return tx.productionOrder.update({
        where: { id },
        data: {
          status: 'CONCLUIDA',
          producedQty,
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
