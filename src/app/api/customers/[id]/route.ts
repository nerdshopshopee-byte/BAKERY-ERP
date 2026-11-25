// PATCH /api/customers/[id] — atualização | DELETE — bloqueado se houver vendas/recebíveis
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

function strField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function toErrorResponse(error: unknown): Response {
  console.error('[api/customers/[id]]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

interface CustomerPatchBody {
  name?: string
  phone?: string
  address?: string
  birthday?: string
  notes?: string
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = (await request.json().catch(() => null)) as CustomerPatchBody | null
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
    }

    const existing = await db.customer.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ error: 'Cliente não encontrado' }, { status: 404 })
    }

    const data: {
      name?: string
      phone?: string | null
      address?: string | null
      birthday?: string | null
      notes?: string | null
    } = {}

    if (body.name !== undefined) {
      const name = strField(body.name)
      if (!name) {
        return Response.json({ error: 'Nome é obrigatório' }, { status: 400 })
      }
      data.name = name
    }
    if (body.phone !== undefined) data.phone = strField(body.phone)
    if (body.address !== undefined) data.address = strField(body.address)
    if (body.birthday !== undefined) data.birthday = strField(body.birthday)
    if (body.notes !== undefined) data.notes = strField(body.notes)

    if (Object.keys(data).length === 0) {
      return Response.json({ error: 'Nenhum campo para atualizar' }, { status: 400 })
    }

    const updated = await db.customer.update({ where: { id }, data })
    return Response.json(updated)
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const existing = await db.customer.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ error: 'Cliente não encontrado' }, { status: 404 })
    }

    const [saleCount, receivableCount] = await Promise.all([
      db.sale.count({ where: { customerId: id } }),
      db.receivable.count({ where: { customerId: id } }),
    ])

    if (saleCount > 0 || receivableCount > 0) {
      return Response.json(
        { error: 'Cliente possui vendas ou recebimentos vinculados e não pode ser excluído' },
        { status: 400 }
      )
    }

    await db.customer.delete({ where: { id } })
    return Response.json({ deleted: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}
