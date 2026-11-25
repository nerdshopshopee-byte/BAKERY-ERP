// GET /api/customers — busca por nome/telefone (em JS) | POST — criação
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

function strField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function toErrorResponse(error: unknown): Response {
  console.error('[api/customers]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

interface CustomerBody {
  name?: string
  phone?: string
  address?: string
  birthday?: string
  notes?: string
}

// GET: query q (ou search) filtra por nome/telefone, case-insensitive
export async function GET(request: NextRequest) {
  try {
    const g = await guardApi(request, 'customers.view')
    if (!g.ok) return g.response

    const { searchParams } = new URL(request.url)
    const query = (searchParams.get('q') ?? searchParams.get('search') ?? '')
      .trim()
      .toLowerCase()

    const customers = await db.customer.findMany({ orderBy: { name: 'asc' }, take: 500 })

    if (!query) {
      return Response.json(customers)
    }

    const filtered = customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(query) ||
        (customer.phone ?? '').toLowerCase().includes(query)
    )
    return Response.json(filtered)
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const g = await guardApi(request, 'customers.manage')
    if (!g.ok) return g.response

    const body = (await request.json().catch(() => null)) as CustomerBody | null
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
    }

    const name = strField(body.name)
    if (!name) {
      return Response.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }

    const customer = await db.customer.create({
      data: {
        name,
        phone: strField(body.phone),
        address: strField(body.address),
        birthday: strField(body.birthday),
        notes: strField(body.notes),
      },
    })
    return Response.json(customer)
  } catch (error) {
    return toErrorResponse(error)
  }
}
