// GET /api/sales — listagem de vendas | POST /api/sales — checkout do PDV
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

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
  console.error('[api/sales]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (value.trim() !== '' && Number.isFinite(parsed)) return parsed
  }
  return null
}

interface CheckoutItem {
  productId?: string
  qty?: number
}

interface CheckoutPayment {
  method?: string
  amount?: number
}

interface CheckoutBody {
  items?: CheckoutItem[]
  customerId?: string
  customerName?: string
  discount?: number
  payments?: CheckoutPayment[]
  channel?: string
  operator?: string
}

// GET: query limit (default 50), from, to (ISO)
export async function GET(request: NextRequest) {
  try {
    const g = await guardApi(request, 'sales.history')
    if (!g.ok) return g.response

    const { searchParams } = new URL(request.url)
    const limit = Math.min(Math.max(Math.trunc(num(searchParams.get('limit')) ?? 50), 1), 500)

    const createdAt: { gte?: Date; lte?: Date } = {}
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    if (from) {
      const parsed = new Date(from)
      if (!Number.isNaN(parsed.getTime())) createdAt.gte = parsed
    }
    if (to) {
      const parsed = new Date(to)
      if (!Number.isNaN(parsed.getTime())) createdAt.lte = parsed
    }

    const sales = await db.sale.findMany({
      where: Object.keys(createdAt).length > 0 ? { createdAt } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { items: true, payments: true },
    })
    return Response.json(sales)
  } catch (error) {
    return toErrorResponse(error)
  }
}

// POST: checkout do PDV
export async function POST(request: NextRequest) {
  try {
    const g = await guardApi(request, 'sales.create')
    if (!g.ok) return g.response

    const body = (await request.json().catch(() => null)) as CheckoutBody | null
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
    }

    const rawItems = Array.isArray(body.items) ? body.items : []
    if (rawItems.length === 0) {
      return Response.json({ error: 'Venda sem itens' }, { status: 400 })
    }

    const normalizedItems: { productId: string; qty: number }[] = []
    for (const item of rawItems) {
      const qty = num(item?.qty)
      if (!item?.productId || typeof item.productId !== 'string' || qty === null || qty <= 0) {
        return Response.json({ error: 'Item inválido na venda' }, { status: 400 })
      }
      normalizedItems.push({ productId: item.productId, qty })
    }

    const rawPayments = Array.isArray(body.payments) ? body.payments : []
    const normalizedPayments: { method: string; amount: number }[] = []
    for (const payment of rawPayments) {
      const amount = num(payment?.amount)
      if (!payment?.method || typeof payment.method !== 'string' || amount === null || amount < 0) {
        return Response.json({ error: 'Pagamento inválido' }, { status: 400 })
      }
      normalizedPayments.push({ method: payment.method, amount: round2(amount) })
    }

    const discount = Math.max(0, num(body.discount) ?? 0)

    // FIADO exige cliente cadastrado
    const hasFiado = normalizedPayments.some((payment) => payment.method === 'FIADO')
    if (hasFiado && (!body.customerId || typeof body.customerId !== 'string')) {
      return Response.json(
        { error: 'Cliente é obrigatório para pagamento fiado' },
        { status: 400 }
      )
    }

    // Carrega e valida produtos
    const productIds = Array.from(new Set(normalizedItems.map((item) => item.productId)))
    const products = await db.product.findMany({ where: { id: { in: productIds } } })
    const productMap = new Map(products.map((product) => [product.id, product]))
    for (const item of normalizedItems) {
      const product = productMap.get(item.productId)
      if (!product) {
        return Response.json({ error: 'Produto não encontrado' }, { status: 400 })
      }
      if (!product.active) {
        return Response.json({ error: `Produto inativo: ${product.name}` }, { status: 400 })
      }
    }

    const subtotalOf = (productId: string, qty: number) => {
      const product = productMap.get(productId)
      return round2((product ? product.price : 0) * qty)
    }

    const gross = round2(
      normalizedItems.reduce((acc, item) => acc + subtotalOf(item.productId, item.qty), 0)
    )
    const total = round2(gross - discount)
    if (total < 0) {
      return Response.json(
        { error: 'Desconto não pode exceder o total da venda' },
        { status: 400 }
      )
    }

    const paidTotal = round2(normalizedPayments.reduce((acc, payment) => acc + payment.amount, 0))
    if (Math.abs(paidTotal - total) > 0.02) {
      return Response.json({ error: 'Pagamentos não fecham o total' }, { status: 400 })
    }

    const now = new Date()

    const sale = await db.$transaction(async (tx) => {
      const saleCount = await tx.sale.count()
      const code = String(5000 + saleCount + 1)

      // Snapshot do nome do cliente a partir do cadastro quando customerId informado
      let customerSnapshot: string | null = null
      if (body.customerId && typeof body.customerId === 'string') {
        const customer = await tx.customer.findUnique({ where: { id: body.customerId } })
        if (!customer) throw new HttpError(400, 'Cliente não encontrado')
        customerSnapshot = customer.name
      }

      const openSession = await tx.cashSession.findFirst({ where: { status: 'ABERTO' } })

      const created = await tx.sale.create({
        data: {
          code,
          customerId: body.customerId ?? null,
          customer: customerSnapshot,
          sessionId: openSession?.id ?? null,
          total,
          discount,
          status: 'CONCLUIDA',
          channel: body.channel?.trim() || 'BALCAO',
          operator: body.operator?.trim() || null,
          items: {
            create: normalizedItems.map((item) => {
              const product = productMap.get(item.productId)
              return {
                productId: item.productId,
                name: product ? product.name : 'Produto',
                qty: item.qty,
                unitPrice: product ? product.price : 0,
                unit: product ? product.unit : 'UN',
                subtotal: subtotalOf(item.productId, item.qty),
              }
            }),
          },
          payments: {
            create: normalizedPayments.map((payment) => ({
              method: payment.method,
              amount: payment.amount,
            })),
          },
        },
      })

      // Pagamentos em dinheiro entram no caixa da sessão aberta
      if (openSession) {
        for (const payment of normalizedPayments) {
          if (payment.method === 'DINHEIRO') {
            await tx.cashMovement.create({
              data: {
                sessionId: openSession.id,
                type: 'VENDA',
                method: 'DINHEIRO',
                amount: payment.amount,
                description: `Venda ${code}`,
                refId: created.id,
              },
            })
          }
        }
      }

      // FIADO: gera recebível (dueDate +7 dias) e soma no saldo do cliente
      const fiadoTotal = round2(
        normalizedPayments
          .filter((payment) => payment.method === 'FIADO')
          .reduce((acc, payment) => acc + payment.amount, 0)
      )
      if (fiadoTotal > 0 && body.customerId && typeof body.customerId === 'string') {
        await tx.receivable.create({
          data: {
            description: `Fiado - Venda ${code}`,
            customerId: body.customerId,
            customer: customerSnapshot,
            amount: fiadoTotal,
            dueDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          },
        })
        await tx.customer.update({
          where: { id: body.customerId },
          data: { creditBalance: { increment: fiadoTotal } },
        })
      }

      await tx.transaction.create({
        data: {
          type: 'RECEITA',
          category: 'VENDAS',
          description: `Venda ${code}`,
          amount: total,
          method: normalizedPayments[0]?.method ?? null,
          refId: created.id,
        },
      })

      // Produtos de cozinha geram pedido no KDS (expectedAt +30 min)
      const kitchenItems = normalizedItems.filter(
        (item) => productMap.get(item.productId)?.isKitchen === true
      )
      if (kitchenItems.length > 0) {
        const orderCustomer =
          body.customerName?.trim() || customerSnapshot || 'Cliente Balcão'
        await tx.order.create({
          data: {
            code: `P${code}`,
            customerName: orderCustomer,
            source: body.channel === 'DELIVERY' ? 'DELIVERY' : 'PDV',
            status: 'AGUARDANDO',
            saleId: created.id,
            expectedAt: new Date(now.getTime() + 30 * 60 * 1000),
            items: {
              create: kitchenItems.map((item) => {
                const product = productMap.get(item.productId)
                return {
                  productId: item.productId,
                  name: product ? product.name : 'Produto',
                  qty: item.qty,
                }
              }),
            },
          },
        })
      }

      // Programa de pontos: 1 ponto a cada R$ 10
      if (body.customerId && typeof body.customerId === 'string') {
        await tx.customer.update({
          where: { id: body.customerId },
          data: { points: { increment: Math.floor(total / 10) } },
        })
      }

      return created
    })

    const fullSale = await db.sale.findUnique({
      where: { id: sale.id },
      include: { items: true, payments: true },
    })
    return Response.json(fullSale)
  } catch (error) {
    return toErrorResponse(error)
  }
}
