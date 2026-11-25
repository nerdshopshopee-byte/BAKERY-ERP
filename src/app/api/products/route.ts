// BAKERY ERP - API de produtos
// GET  /api/products?query=&categoryId=&active=true|false&limit=
// POST /api/products -> cria produto { name, categoryId?, unit?, price, cost, ... }

import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi, guardApiAny } from '@/lib/auth/guard'

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

export async function GET(request: NextRequest) {
  // Catálogo necessário para vender (PDV) OU para operar o estoque
  const g = await guardApiAny(request, ['sales.view', 'inventory.view'])
  if (!g.ok) return g.response

  const { searchParams } = new URL(request.url)
  const query = (searchParams.get('query') ?? '').trim().toLowerCase()
  const categoryId = (searchParams.get('categoryId') ?? '').trim()
  const activeParam = searchParams.get('active')
  const limitRaw = Number(searchParams.get('limit'))

  const where: { categoryId?: string; active?: boolean } = {}
  if (categoryId) where.categoryId = categoryId
  if (activeParam === 'true') where.active = true
  if (activeParam === 'false') where.active = false

  const [products, categories] = await Promise.all([
    db.product.findMany({ where, orderBy: { name: 'asc' } }),
    db.category.findMany(),
  ])

  const categoryMap = new Map(categories.map((c) => [c.id, c]))

  let result = products

  // Busca case-insensitive por nome ou código de barras (SQLite não suporta mode insensitive)
  if (query) {
    result = result.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        (p.barcode !== null && p.barcode.toLowerCase().includes(query)),
    )
  }

  if (Number.isFinite(limitRaw) && limitRaw > 0) {
    result = result.slice(0, Math.round(limitRaw))
  }

  const enriched = result.map((p) => {
    const category = p.categoryId ? categoryMap.get(p.categoryId) : undefined
    return {
      ...p,
      categoryName: category?.name ?? null,
      categoryEmoji: category?.emoji ?? null,
      categoryImageUrl: category?.imageUrl ?? null,
    }
  })

  // Segurança: custos de produtos só para quem pode consultar custos
  const canSeeCosts = g.user.role.isAbsolute || g.user.permissions.includes('inventory.costs')
  const sanitized = canSeeCosts ? enriched : enriched.map((p) => ({ ...p, cost: 0 }))

  return Response.json(sanitized)
}

export async function POST(request: NextRequest) {
  const g = await guardApi(request, 'inventory.products')
  if (!g.ok) return g.response

  const body = await readBody(request)

  const name = str(body.name)
  if (!name) {
    return Response.json({ error: 'Nome do produto é obrigatório' }, { status: 400 })
  }

  const price = typeof body.price === 'number' && Number.isFinite(body.price) ? body.price : null
  const cost = typeof body.cost === 'number' && Number.isFinite(body.cost) ? body.cost : null
  if (price === null || price < 0) {
    return Response.json({ error: 'Preço deve ser um número >= 0' }, { status: 400 })
  }
  if (cost === null || cost < 0) {
    return Response.json({ error: 'Custo deve ser um número >= 0' }, { status: 400 })
  }

  let unit = 'UN'
  if (typeof body.unit === 'string' && body.unit.trim() !== '') {
    const unitValue = body.unit.trim().toUpperCase()
    if (unitValue !== 'UN' && unitValue !== 'KG') {
      return Response.json({ error: "Unidade inválida (use 'UN' ou 'KG')" }, { status: 400 })
    }
    unit = unitValue
  }

  let categoryId: string | null = null
  const categoryIdInput = str(body.categoryId)
  if (categoryIdInput) {
    const category = await db.category.findUnique({ where: { id: categoryIdInput } })
    if (!category) {
      return Response.json({ error: 'Categoria não encontrada' }, { status: 400 })
    }
    categoryId = categoryIdInput
  }

  const product = await db.product.create({
    data: {
      name,
      categoryId,
      unit,
      price: round2(price),
      cost: round2(cost),
      barcode: str(body.barcode),
      byWeight: typeof body.byWeight === 'boolean' ? body.byWeight : false,
      isKitchen: typeof body.isKitchen === 'boolean' ? body.isKitchen : true,
      active: typeof body.active === 'boolean' ? body.active : true,
      notes: str(body.notes),
    },
  })

  return Response.json(product, { status: 201 })
}
