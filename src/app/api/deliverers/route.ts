// GET /api/deliverers — entregadores | POST — cadastro de entregador
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

function strField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function toErrorResponse(error: unknown): Response {
  console.error('[api/deliverers]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

interface DelivererBody {
  name?: string
  phone?: string
  vehicle?: string
}

export async function GET(request: NextRequest) {
  try {
    const g = await guardApi(request, 'orders.delivery')
    if (!g.ok) return g.response

    const deliverers = await db.deliverer.findMany({ orderBy: { name: 'asc' } })
    return Response.json(deliverers)
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const g = await guardApi(request, 'orders.delivery')
    if (!g.ok) return g.response

    const body = (await request.json().catch(() => null)) as DelivererBody | null
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
    }

    const name = strField(body.name)
    if (!name) {
      return Response.json({ error: 'Nome do entregador é obrigatório' }, { status: 400 })
    }

    const deliverer = await db.deliverer.create({
      data: { name, phone: strField(body.phone), vehicle: strField(body.vehicle) },
    })
    return Response.json(deliverer, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
