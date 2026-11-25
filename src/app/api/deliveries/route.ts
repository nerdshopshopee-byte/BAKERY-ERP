// GET /api/deliveries — entregas (opcional ?status=) | POST — nova entrega
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

function strField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
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
  console.error('[api/deliveries]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

const STATUSES = ['PENDENTE', 'EM_ROTA', 'ENTREGUE', 'FALHOU']

function deliveryCode(): string {
  const rand = Math.floor(Math.random() * 9000 + 1000)
  return `DEL-${rand}`
}

interface DeliveryBody {
  customerName?: string
  phone?: string
  address?: string
  zoneId?: string
  delivererId?: string
  status?: string
  notes?: string
  orderId?: string
}

export async function GET(request: NextRequest) {
  try {
    const g = await guardApi(request, 'orders.delivery')
    if (!g.ok) return g.response

    const url = new URL(request.url)
    const status = url.searchParams.get('status')
    const deliveries = await db.delivery.findMany({
      where: status && STATUSES.includes(status) ? { status } : undefined,
      orderBy: [{ createdAt: 'desc' }],
    })
    return Response.json(deliveries)
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const g = await guardApi(request, 'orders.delivery')
    if (!g.ok) return g.response

    const body = (await request.json().catch(() => null)) as DeliveryBody | null
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
    }

    const customerName = strField(body.customerName)
    if (!customerName) throw new HttpError(400, 'Nome do cliente é obrigatório')
    const address = strField(body.address)
    if (!address) throw new HttpError(400, 'Endereço de entrega é obrigatório')

    // Taxa e nome da região vêm da zona cadastrada (se informada)
    let zoneId: string | null = null
    let zoneName: string | null = null
    let fee = 0
    if (strField(body.zoneId)) {
      const zone = await db.deliveryZone.findUnique({ where: { id: body.zoneId as string } })
      if (!zone) throw new HttpError(404, 'Região não encontrada')
      zoneId = zone.id
      zoneName = zone.name
      fee = zone.fee
    }

    // Entregador é opcional; se informado deve existir e estar ativo
    let delivererId: string | null = null
    let delivererName: string | null = null
    if (strField(body.delivererId)) {
      const deliverer = await db.deliverer.findUnique({ where: { id: body.delivererId as string } })
      if (!deliverer) throw new HttpError(404, 'Entregador não encontrado')
      if (!deliverer.active) throw new HttpError(400, 'Entregador está inativo')
      delivererId = deliverer.id
      delivererName = deliverer.name
    }

    let code = deliveryCode()
    const exists = await db.delivery.findUnique({ where: { code } })
    if (exists) code = `DEL-${Math.floor(Math.random() * 90000 + 10000)}`

    const status = body.status && STATUSES.includes(body.status) ? body.status : 'PENDENTE'

    const delivery = await db.delivery.create({
      data: {
        code,
        customerName,
        phone: strField(body.phone),
        address,
        zoneId,
        zoneName,
        delivererId,
        delivererName,
        fee,
        status,
        notes: strField(body.notes),
        orderId: strField(body.orderId),
      },
    })
    return Response.json(delivery, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
