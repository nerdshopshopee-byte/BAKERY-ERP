// PATCH /api/purchases/[id] — ações: 'receive' (receber) | 'cancel' (cancelar)
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

const round2 = (value: number) => Math.round(value * 100) / 100

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
  console.error('[api/purchases/[id]]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

interface PurchaseActionBody {
  action?: string
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = (await request.json().catch(() => null)) as PurchaseActionBody | null
    if (body?.action !== 'receive' && body?.action !== 'cancel') {
      return Response.json({ error: 'Ação inválida' }, { status: 400 })
    }
    const action = body.action

    const result = await db.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({
        where: { id },
        include: { items: true },
      })
      if (!purchase) throw new HttpError(404, 'Compra não encontrada')
      if (purchase.status !== 'PENDENTE') {
        const reason =
          purchase.status === 'RECEBIDA' ? 'Compra já foi recebida' : 'Compra está cancelada'
        throw new HttpError(400, reason)
      }

      if (action === 'cancel') {
        return tx.purchase.update({
          where: { id: purchase.id },
          data: { status: 'CANCELADA' },
          include: { items: true },
        })
      }

      // action === 'receive': entrada de estoque + custo atualizado + conta a pagar
      const now = new Date()
      for (const item of purchase.items) {
        const ingredient = await tx.ingredient.findUnique({
          where: { id: item.ingredientId },
        })
        if (!ingredient) continue
        await tx.ingredient.update({
          where: { id: ingredient.id },
          data: {
            stock: { increment: item.qty },
            costPerUnit: round2(item.unitCost),
          },
        })
        await tx.stockMovement.create({
          data: {
            itemType: 'INGREDIENT',
            ingredientId: item.ingredientId,
            type: 'ENTRADA',
            qty: item.qty,
            unitCost: round2(item.unitCost),
            reason: `Compra ${purchase.code}`,
            refId: purchase.id,
          },
        })
      }

      // A DESPESA (Transaction) só é lançada quando a conta é paga via /api/payables
      await tx.payable.create({
        data: {
          description: `Fornecedor ${purchase.supplier} - ${purchase.code}`,
          supplierId: purchase.supplierId,
          supplier: purchase.supplier,
          category: 'INSUMOS',
          amount: round2(purchase.total),
          dueDate: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000),
        },
      })

      return tx.purchase.update({
        where: { id: purchase.id },
        data: { status: 'RECEBIDA', receivedAt: now },
        include: { items: true },
      })
    })

    return Response.json(result)
  } catch (error) {
    return toErrorResponse(error)
  }
}
