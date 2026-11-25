// BAKERY ERP - API de produto individual
// PATCH  /api/products/[id] -> atualiza campos enviados
// DELETE /api/products/[id] -> hard delete; se houver dependência (SaleItem), soft-delete

import { db } from '@/lib/db'

// Sempre executa no request (evita cache estático no build)
export const dynamic = 'force-dynamic'

const round2 = (value: number): number => Math.round(value * 100) / 100

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const raw: unknown = await request.json()
    if (typeof raw === 'object' && raw !== null) return raw as Record<string, unknown>
    return {}
  } catch {
    return {}
  }
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

type ProductUpdate = {
  name?: string
  categoryId?: string | null
  unit?: string
  price?: number
  cost?: number
  barcode?: string | null
  byWeight?: boolean
  isKitchen?: boolean
  active?: boolean
  notes?: string | null
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const existing = await db.product.findUnique({ where: { id } })
  if (!existing) {
    return Response.json({ error: 'Produto não encontrado' }, { status: 404 })
  }

  const body = await readBody(request)
  const update: ProductUpdate = {}

  if ('name' in body) {
    const name = str(body.name)
    if (!name) {
      return Response.json({ error: 'Nome do produto não pode ser vazio' }, { status: 400 })
    }
    update.name = name
  }

  if ('categoryId' in body) {
    const categoryId = str(body.categoryId)
    if (categoryId) {
      const category = await db.category.findUnique({ where: { id: categoryId } })
      if (!category) {
        return Response.json({ error: 'Categoria não encontrada' }, { status: 400 })
      }
    }
    update.categoryId = categoryId
  }

  if ('unit' in body) {
    if (body.unit !== 'UN' && body.unit !== 'KG') {
      return Response.json({ error: "Unidade inválida (use 'UN' ou 'KG')" }, { status: 400 })
    }
    update.unit = body.unit
  }

  if ('price' in body) {
    const price = body.price
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
      return Response.json({ error: 'Preço deve ser um número >= 0' }, { status: 400 })
    }
    update.price = round2(price)
  }

  if ('cost' in body) {
    const cost = body.cost
    if (typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) {
      return Response.json({ error: 'Custo deve ser um número >= 0' }, { status: 400 })
    }
    update.cost = round2(cost)
  }

  if ('barcode' in body) update.barcode = str(body.barcode)
  if ('notes' in body) update.notes = str(body.notes)

  if ('byWeight' in body) {
    if (typeof body.byWeight !== 'boolean') {
      return Response.json({ error: 'byWeight deve ser booleano' }, { status: 400 })
    }
    update.byWeight = body.byWeight
  }

  if ('isKitchen' in body) {
    if (typeof body.isKitchen !== 'boolean') {
      return Response.json({ error: 'isKitchen deve ser booleano' }, { status: 400 })
    }
    update.isKitchen = body.isKitchen
  }

  if ('active' in body) {
    if (typeof body.active !== 'boolean') {
      return Response.json({ error: 'active deve ser booleano' }, { status: 400 })
    }
    update.active = body.active
  }

  const product = await db.product.update({ where: { id }, data: update })
  return Response.json(product)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const existing = await db.product.findUnique({ where: { id } })
  if (!existing) {
    return Response.json({ error: 'Produto não encontrado' }, { status: 404 })
  }

  // Dependência de histórico de vendas -> soft-delete preserva os registros
  const saleItems = await db.saleItem.count({ where: { productId: id } })
  if (saleItems > 0) {
    const product = await db.product.update({ where: { id }, data: { active: false } })
    return Response.json({ softDeleted: true, product })
  }

  try {
    await db.product.delete({ where: { id } })
    return Response.json({ ok: true, softDeleted: false })
  } catch {
    // Qualquer outra dependência inesperada -> soft-delete
    const product = await db.product.update({ where: { id }, data: { active: false } })
    return Response.json({ softDeleted: true, product })
  }
}
