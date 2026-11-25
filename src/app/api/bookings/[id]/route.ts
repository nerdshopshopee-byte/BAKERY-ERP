// PATCH /api/bookings/[id] — atualiza status/sinal/dados | DELETE — remove encomenda
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

function strField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function numField(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : typeof value === 'number' ? value : NaN
  return Number.isFinite(n) && n >= 0 ? n : null
}

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
  console.error('[api/bookings/[id]]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

const STATUSES = ['ORCAMENTO', 'CONFIRMADA', 'EM_PRODUCAO', 'PRONTA', 'RETIRADA', 'CANCELADA']

interface BookingPatchBody {
  status?: string
  deposit?: number | string
  totalAmount?: number | string
  notes?: string
  dueDate?: string
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await guardApi(request, 'orders.bookings')
    if (!g.ok) return g.response

    const { id } = await params
    const body = (await request.json().catch(() => null)) as BookingPatchBody | null
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
    }

    const booking = await db.booking.findUnique({ where: { id } })
    if (!booking) throw new HttpError(404, 'Encomenda não encontrada')

    const data: Record<string, unknown> = {}

    if (body.status !== undefined) {
      if (!STATUSES.includes(body.status)) throw new HttpError(400, 'Status inválido')
      data.status = body.status
    }

    if (body.deposit !== undefined) {
      const deposit = numField(body.deposit)
      if (deposit === null) throw new HttpError(400, 'Sinal inválido')
      const total = body.totalAmount !== undefined ? (numField(body.totalAmount) ?? booking.totalAmount) : booking.totalAmount
      if (deposit > total) throw new HttpError(400, 'Sinal não pode ser maior que o valor total')
      data.deposit = deposit
    }

    if (body.totalAmount !== undefined) {
      const totalAmount = numField(body.totalAmount)
      if (totalAmount === null) throw new HttpError(400, 'Valor total inválido')
      const deposit = data.deposit !== undefined ? (data.deposit as number) : booking.deposit
      if (deposit > totalAmount) throw new HttpError(400, 'Sinal não pode ser maior que o valor total')
      data.totalAmount = totalAmount
    }

    if (body.notes !== undefined) data.notes = strField(body.notes)

    if (body.dueDate !== undefined) {
      const dueDate = new Date(body.dueDate)
      if (Number.isNaN(dueDate.getTime())) throw new HttpError(400, 'Data de retirada inválida')
      data.dueDate = dueDate
    }

    const updated = await db.booking.update({ where: { id: booking.id }, data })
    return Response.json(updated)
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await guardApi(_request, 'orders.bookings')
    if (!g.ok) return g.response

    const { id } = await params
    const booking = await db.booking.findUnique({ where: { id } })
    if (!booking) throw new HttpError(404, 'Encomenda não encontrada')
    await db.booking.delete({ where: { id } })
    return Response.json({ ok: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}
