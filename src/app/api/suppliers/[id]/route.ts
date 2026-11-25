// PATCH /api/suppliers/[id] — atualização parcial | DELETE — exclusão (soft se houver compras)
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

function strField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function toErrorResponse(error: unknown): Response {
  console.error('[api/suppliers/[id]]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

interface SupplierPatchBody {
  name?: string
  contact?: string
  phone?: string
  email?: string
  items?: string
  active?: boolean
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await guardApi(request, 'purchases.suppliers')
    if (!g.ok) return g.response

    const { id } = await params
    const body = (await request.json().catch(() => null)) as SupplierPatchBody | null
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
    }

    const data: {
      name?: string
      contact?: string | null
      phone?: string | null
      email?: string | null
      items?: string | null
      active?: boolean
    } = {}

    if (body.name !== undefined) {
      const name = strField(body.name)
      if (!name) {
        return Response.json({ error: 'Nome é obrigatório' }, { status: 400 })
      }
      data.name = name
    }
    if (body.contact !== undefined) data.contact = strField(body.contact)
    if (body.phone !== undefined) data.phone = strField(body.phone)
    if (body.email !== undefined) data.email = strField(body.email)
    if (body.items !== undefined) data.items = strField(body.items)
    if (typeof body.active === 'boolean') data.active = body.active

    if (Object.keys(data).length === 0) {
      return Response.json({ error: 'Nenhum campo para atualizar' }, { status: 400 })
    }

    const existing = await db.supplier.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ error: 'Fornecedor não encontrado' }, { status: 404 })
    }

    const updated = await db.supplier.update({ where: { id }, data })
    return Response.json(updated)
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await guardApi(request, 'purchases.suppliers')
    if (!g.ok) return g.response

    const { id } = await params
    const existing = await db.supplier.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ error: 'Fornecedor não encontrado' }, { status: 404 })
    }

    const purchaseCount = await db.purchase.count({ where: { supplierId: id } })
    if (purchaseCount > 0) {
      // Soft delete: mantém histórico de compras
      await db.supplier.update({ where: { id }, data: { active: false } })
      return Response.json({ softDeleted: true })
    }

    await db.supplier.delete({ where: { id } })
    return Response.json({ deleted: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}
