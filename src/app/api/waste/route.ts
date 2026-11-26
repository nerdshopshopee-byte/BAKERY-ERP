// GET /api/waste — registros de desperdício | POST — registra perda com baixa de estoque
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

const round2 = (v: number) => Math.round(v * 100) / 100

class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

function toErrorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status })
  }
  console.error('[api/waste]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

const REASONS = ['VENCIDO', 'QUEIMADO', 'ERRO_PRODUCAO', 'DEVOLUCAO', 'DANIFICADO', 'SOBRA', 'DESCARTE', 'OUTROS']

function numField(value: unknown): number {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : typeof value === 'number' ? value : NaN
  return Number.isFinite(n) ? n : NaN
}

interface WasteBody {
  itemType?: 'PRODUCT' | 'INGREDIENT'
  productId?: string
  ingredientId?: string
  qty?: number | string
  reason?: string
  actor?: string
  sector?: string
  lot?: string
  refOrderId?: string
  photoUrl?: string
  notes?: string
}

export async function GET(request: NextRequest) {
  try {
    const g = await guardApi(request, 'production.view')
    if (!g.ok) return g.response

    const url = new URL(request.url)
    const limitRaw = Number(url.searchParams.get('limit') ?? '200')
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 500) : 200
    const records = await db.wasteRecord.findMany({ orderBy: { createdAt: 'desc' }, take: limit })
    return Response.json(records)
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const g = await guardApi(request, 'production.losses')
    if (!g.ok) return g.response

    const body = (await request.json().catch(() => null)) as WasteBody | null
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
    }

    const itemType = body.itemType === 'INGREDIENT' ? 'INGREDIENT' : body.itemType === 'PRODUCT' ? 'PRODUCT' : null
    if (!itemType) throw new HttpError(400, 'itemType deve ser PRODUCT ou INGREDIENT')

    const qty = numField(body.qty)
    if (!Number.isFinite(qty) || qty <= 0) throw new HttpError(400, 'Quantidade deve ser maior que zero')

    const reason = body.reason && REASONS.includes(body.reason) ? body.reason : null
    if (!reason) throw new HttpError(400, 'Motivo da perda é obrigatório')

    const actor = typeof body.actor === 'string' && body.actor.trim() !== '' ? body.actor.trim() : null
    const notes = typeof body.notes === 'string' && body.notes.trim() !== '' ? body.notes.trim() : null
    const sector = typeof body.sector === 'string' && body.sector.trim() !== '' ? body.sector.trim() : null
    const lot = typeof body.lot === 'string' && body.lot.trim() !== '' ? body.lot.trim() : null
    const refOrderId = typeof body.refOrderId === 'string' && body.refOrderId.trim() !== '' ? body.refOrderId.trim() : null
    const photoUrl = typeof body.photoUrl === 'string' && body.photoUrl.trim() !== '' ? body.photoUrl.trim() : null

    const result = await db.$transaction(async (tx) => {
      if (itemType === 'INGREDIENT') {
        const ingredientId = typeof body.ingredientId === 'string' ? body.ingredientId : null
        if (!ingredientId) throw new HttpError(400, 'Selecione o insumo perdido')
        const ingredient = await tx.ingredient.findUnique({ where: { id: ingredientId } })
        if (!ingredient) throw new HttpError(404, 'Insumo não encontrado')
        if (ingredient.stock < qty) {
          throw new HttpError(400, `Estoque insuficiente de "${ingredient.name}": disponível ${ingredient.stock} ${ingredient.unit}`)
        }

        const cost = round2(ingredient.costPerUnit * qty)

        const record = await tx.wasteRecord.create({
          data: {
            itemType,
            ingredientId: ingredient.id,
            productId: null,
            name: ingredient.name,
            qty,
            unit: ingredient.unit,
            reason,
            cost,
            actor,
            sector,
            lot,
            refOrderId,
            photoUrl,
            notes,
          },
        })

        // Baixa de estoque + movimentação rastreável do tipo PERDA
        await tx.ingredient.update({
          where: { id: ingredient.id },
          data: { stock: round2(ingredient.stock - qty) },
        })
        await tx.stockMovement.create({
          data: {
            itemType: 'INGREDIENT',
            ingredientId: ingredient.id,
            productId: null,
            type: 'PERDA',
            qty: -qty,
            unitCost: ingredient.costPerUnit,
            refId: record.id,
            reason: reason,
          },
        })

        return record
      }

      // itemType === 'PRODUCT': produtos não possuem saldo em campo; registra o movimento PERDA
      const productId = typeof body.productId === 'string' ? body.productId : null
      if (!productId) throw new HttpError(400, 'Selecione o produto perdido')
      const product = await tx.product.findUnique({ where: { id: productId } })
      if (!product) throw new HttpError(404, 'Produto não encontrado')

      const cost = round2(product.cost * qty)

      const record = await tx.wasteRecord.create({
        data: {
          itemType,
          ingredientId: null,
          productId: product.id,
          name: product.name,
          qty,
          unit: product.unit,
          reason,
          cost,
          actor,
          sector,
          lot,
          refOrderId,
          photoUrl,
          notes,
        },
      })

      await tx.stockMovement.create({
        data: {
          itemType: 'PRODUCT',
          ingredientId: null,
          productId: product.id,
          type: 'PERDA',
          qty: -qty,
          unitCost: product.cost,
          refId: record.id,
          reason: reason,
        },
      })

      return record
    })

    return Response.json(result, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
