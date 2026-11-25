// GET /api/suppliers — fornecedores ordenados por nome | POST — criação
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

function strField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function toErrorResponse(error: unknown): Response {
  console.error('[api/suppliers]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

interface SupplierBody {
  name?: string
  contact?: string
  phone?: string
  email?: string
  items?: string
}

export async function GET() {
  try {
    const suppliers = await db.supplier.findMany({ orderBy: { name: 'asc' } })
    return Response.json(suppliers)
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as SupplierBody | null
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
    }

    const name = strField(body.name)
    if (!name) {
      return Response.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }

    const supplier = await db.supplier.create({
      data: {
        name,
        contact: strField(body.contact),
        phone: strField(body.phone),
        email: strField(body.email),
        items: strField(body.items),
      },
    })
    return Response.json(supplier)
  } catch (error) {
    return toErrorResponse(error)
  }
}
