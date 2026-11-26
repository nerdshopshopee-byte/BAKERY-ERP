// BAKERY ERP - API de produto individual
// PATCH  /api/products/[id] -> atualiza campos enviados
// DELETE /api/products/[id] -> hard delete; se houver dependência (SaleItem), soft-delete

import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

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
  saleUnit?: string
  price?: number
  cost?: number
  barcode?: string | null
  plu?: string | null
  byWeight?: boolean
  isWeighable?: boolean
  tara?: number
  shelfLifeDays?: number | null
  lotControl?: boolean
  weighDepartment?: string | null
  trackStock?: boolean
  stock?: number
  minStock?: number
  isKitchen?: boolean
  active?: boolean
  notes?: string | null
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardApi(request, 'inventory.products')
  if (!g.ok) return g.response

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

  if ('saleUnit' in body) {
    const VALID_SALE_UNITS = ['UN', 'KG', 'G', 'L', 'ML']
    const saleUnit = typeof body.saleUnit === 'string' ? body.saleUnit.trim().toUpperCase() : ''
    if (!VALID_SALE_UNITS.includes(saleUnit)) {
      return Response.json({ error: 'saleUnit inválida (UN, KG, G, L, ML)' }, { status: 400 })
    }
    update.saleUnit = saleUnit
  }

  if ('plu' in body) {
    const plu = str(body.plu)
    if (plu !== null) {
      if (!/^\d{1,6}$/.test(plu)) {
        return Response.json({ error: 'PLU deve ser numérico com até 6 dígitos' }, { status: 400 })
      }
      const taken = await db.product.findFirst({ where: { plu, id: { not: id } } })
      if (taken) {
        return Response.json({ error: `PLU ${plu} já cadastrado para "${taken.name}"` }, { status: 409 })
      }
    }
    update.plu = plu
  }

  if ('isWeighable' in body) {
    if (typeof body.isWeighable !== 'boolean') {
      return Response.json({ error: 'isWeighable deve ser booleano' }, { status: 400 })
    }
    update.isWeighable = body.isWeighable
    if (body.isWeighable) update.byWeight = true
  }

  if ('tara' in body) {
    const tara = body.tara
    if (typeof tara !== 'number' || !Number.isFinite(tara) || tara < 0) {
      return Response.json({ error: 'Tara deve ser um número >= 0 (gramas)' }, { status: 400 })
    }
    update.tara = tara
  }

  if ('shelfLifeDays' in body) {
    const days = body.shelfLifeDays
    if (days === null) {
      update.shelfLifeDays = null
    } else if (typeof days === 'number' && Number.isFinite(days) && days > 0) {
      update.shelfLifeDays = Math.trunc(days)
    } else {
      return Response.json({ error: 'Validade deve ser dias > 0' }, { status: 400 })
    }
  }

  if ('lotControl' in body) {
    if (typeof body.lotControl !== 'boolean') {
      return Response.json({ error: 'lotControl deve ser booleano' }, { status: 400 })
    }
    update.lotControl = body.lotControl
  }

  if ('weighDepartment' in body) update.weighDepartment = str(body.weighDepartment)

  if ('trackStock' in body) {
    if (typeof body.trackStock !== 'boolean') {
      return Response.json({ error: 'trackStock deve ser booleano' }, { status: 400 })
    }
    update.trackStock = body.trackStock
  }

  if ('stock' in body) {
    const stock = body.stock
    if (typeof stock !== 'number' || !Number.isFinite(stock) || stock < 0) {
      return Response.json({ error: 'Estoque deve ser um número >= 0' }, { status: 400 })
    }
    update.stock = stock
  }

  if ('minStock' in body) {
    const minStock = body.minStock
    if (typeof minStock !== 'number' || !Number.isFinite(minStock) || minStock < 0) {
      return Response.json({ error: 'Estoque mínimo deve ser um número >= 0' }, { status: 400 })
    }
    update.minStock = minStock
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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await guardApi(_request, 'inventory.products_delete')
  if (!g.ok) return g.response

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
