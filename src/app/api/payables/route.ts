// GET /api/payables — contas a pagar | POST — criação manual
import { db } from '@/lib/db'

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
  console.error('[api/payables]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

interface PayableBody {
  description?: string
  supplierId?: string
  supplier?: string
  category?: string
  amount?: number
  dueDate?: string
}

export async function GET() {
  try {
    const payables = await db.payable.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return Response.json(payables)
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as PayableBody | null
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
    }

    const description = strField(body.description)
    if (!description) {
      return Response.json({ error: 'Descrição é obrigatória' }, { status: 400 })
    }

    const amount = num(body.amount)
    if (amount === null || amount <= 0) {
      return Response.json({ error: 'Valor deve ser maior que zero' }, { status: 400 })
    }

    const dueDate = body.dueDate ? new Date(body.dueDate) : null
    if (!dueDate || Number.isNaN(dueDate.getTime())) {
      return Response.json({ error: 'Data de vencimento inválida' }, { status: 400 })
    }

    // Snapshot do fornecedor pelo id quando informado
    let supplierId = strField(body.supplierId)
    let supplierName = strField(body.supplier)
    if (supplierId) {
      const supplier = await db.supplier.findUnique({ where: { id: supplierId } })
      if (!supplier) {
        return Response.json({ error: 'Fornecedor não encontrado' }, { status: 400 })
      }
      if (!supplierName) supplierName = supplier.name
    }

    const payable = await db.payable.create({
      data: {
        description,
        supplierId,
        supplier: supplierName,
        category: strField(body.category),
        amount: round2(amount),
        dueDate,
      },
    })
    return Response.json(payable)
  } catch (error) {
    return toErrorResponse(error)
  }
}
