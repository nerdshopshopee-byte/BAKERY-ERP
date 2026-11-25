// GET /api/orders — listagem de pedidos (KDS/encomendas) | POST — criação de pedido
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
  console.error('[api/orders]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

const ACTIVE_STATUSES = ['AGUARDANDO', 'PREPARANDO', 'PRONTO']
const ORDER_SOURCES = ['PDV', 'ENCOMENDA', 'DELIVERY', 'WHATSAPP']

interface OrderItemBody {
  productId?: string
  name?: string
  qty?: number
  notes?: string
}

interface OrderBody {
  customerName?: string
  phone?: string
  source?: string
  notes?: string
  expectedAt?: string
  items?: OrderItemBody[]
}

// GET: query status | active ('1' → apenas em aberto) | limit (default 200)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = Math.min(Math.max(Math.trunc(num(searchParams.get('limit')) ?? 200), 1), 1000)
    const status = searchParams.get('status')
    const active = searchParams.get('active')

    let where: { status?: string | { in: string[] } } | undefined
    if (status) {
      where = { status }
    } else if (active === '1') {
      where = { status: { in: ACTIVE_STATUSES } }
    }

    const orders = await db.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { items: true },
    })
    return Response.json(orders)
  } catch (error) {
    return toErrorResponse(error)
  }
}

// POST: cria pedido manual (encomenda, delivery, whatsapp ou balcão)
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as OrderBody | null
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
    }

    const rawItems = Array.isArray(body.items) ? body.items : []
    if (rawItems.length === 0) {
      return Response.json({ error: 'Pedido sem itens' }, { status: 400 })
    }

    const items: { productId: string | null; name: string; qty: number; notes: string | null }[] = []
    for (const item of rawItems) {
      const qty = num(item?.qty)
      const name = strField(item?.name)
      if (!name || qty === null || qty <= 0) {
        return Response.json(
          { error: 'Cada item do pedido precisa de nome e quantidade válidas' },
          { status: 400 }
        )
      }
      items.push({
        productId: strField(item?.productId),
        name,
        qty: round2(qty),
        notes: strField(item?.notes),
      })
    }

    const source =
      body.source && ORDER_SOURCES.includes(body.source) ? body.source : 'PDV'

    const orderCount = await db.order.count()
    const code = source === 'ENCOMENDA' ? `ENC-${1000 + orderCount}` : `PD-${1000 + orderCount}`

    let expectedAt: Date | null = null
    if (body.expectedAt) {
      const parsed = new Date(body.expectedAt)
      if (!Number.isNaN(parsed.getTime())) expectedAt = parsed
    }

    const order = await db.order.create({
      data: {
        code,
        customerName: strField(body.customerName),
        phone: strField(body.phone),
        source,
        status: 'AGUARDANDO',
        notes: strField(body.notes),
        expectedAt,
        items: { create: items },
      },
    })

    const fullOrder = await db.order.findUnique({
      where: { id: order.id },
      include: { items: true },
    })
    return Response.json(fullOrder)
  } catch (error) {
    return toErrorResponse(error)
  }
}
