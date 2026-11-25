// GET /api/bookings — encomendas (opcional ?status=) | POST — criação de encomenda
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

function toErrorResponse(error: unknown): Response {
  console.error('[api/bookings]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

const KINDS = ['BOLO', 'FESTA', 'SALGADOS', 'OUTROS']
const STATUSES = ['ORCAMENTO', 'CONFIRMADA', 'EM_PRODUCAO', 'PRONTA', 'RETIRADA', 'CANCELADA']

function bookingCode(): string {
  const rand = Math.floor(Math.random() * 9000 + 1000)
  return `ENC-${rand}`
}

interface BookingBody {
  customerName?: string
  phone?: string
  kind?: string
  description?: string
  serveQty?: number | string
  dueDate?: string
  totalAmount?: number | string
  deposit?: number | string
  status?: string
  notes?: string
}

export async function GET(request: NextRequest) {
  try {
    const g = await guardApi(request, 'orders.bookings')
    if (!g.ok) return g.response

    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const bookings = await db.booking.findMany({
      where: status && STATUSES.includes(status) ? { status } : undefined,
      orderBy: [{ dueDate: 'asc' }],
    })
    return Response.json(bookings)
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const g = await guardApi(request, 'orders.bookings')
    if (!g.ok) return g.response

    const body = (await request.json().catch(() => null)) as BookingBody | null
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
    }

    const customerName = strField(body.customerName)
    const description = strField(body.description)
    if (!customerName) {
      return Response.json({ error: 'Nome do cliente é obrigatório' }, { status: 400 })
    }
    if (!description) {
      return Response.json({ error: 'Descrição da encomenda é obrigatória' }, { status: 400 })
    }

    const dueDate = body.dueDate ? new Date(body.dueDate) : null
    if (!dueDate || Number.isNaN(dueDate.getTime())) {
      return Response.json({ error: 'Data e horário de retirada são obrigatórios' }, { status: 400 })
    }

    const totalAmount = numField(body.totalAmount) ?? 0
    const deposit = numField(body.deposit) ?? 0
    if (deposit > totalAmount) {
      return Response.json({ error: 'Sinal não pode ser maior que o valor total' }, { status: 400 })
    }

    const kind = body.kind && KINDS.includes(body.kind) ? body.kind : 'BOLO'
    const status = body.status && STATUSES.includes(body.status) ? body.status : 'ORCAMENTO'

    let code = bookingCode()
    const exists = await db.booking.findUnique({ where: { code } })
    if (exists) code = `ENC-${Math.floor(Math.random() * 90000 + 10000)}`

    const booking = await db.booking.create({
      data: {
        code,
        customerName,
        phone: strField(body.phone),
        kind,
        description,
        serveQty: numField(body.serveQty),
        dueDate,
        totalAmount,
        deposit,
        status,
        notes: strField(body.notes),
      },
    })
    return Response.json(booking, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
