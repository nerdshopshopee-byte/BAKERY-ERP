// BAKERY ERP - API de categorias
// GET  /api/categories -> lista ordenada por sortOrder, com productCount de produtos ativos
// POST /api/categories -> cria categoria { name, imageUrl?, emoji?, sortOrder? }

import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

// Sempre executa no request (evita cache estático no build)
export const dynamic = 'force-dynamic'

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
  const g = await guardApi(request)
  if (!g.ok) return g.response

  const [categories, counts] = await Promise.all([
    db.category.findMany({ orderBy: { sortOrder: 'asc' } }),
    db.product.groupBy({
      by: ['categoryId'],
      _count: { _all: true },
      where: { active: true },
    }),
  ])

  const countMap = new Map<string, number>()
  for (const row of counts) {
    if (row.categoryId) countMap.set(row.categoryId, row._count._all)
  }

  const result = categories.map((category) => ({
    ...category,
    productCount: countMap.get(category.id) ?? 0,
  }))

  return Response.json(result)
}

export async function POST(request: NextRequest) {
  const g = await guardApi(request, 'inventory.products')
  if (!g.ok) return g.response

  const body = await readBody(request)

  const name = str(body.name)
  if (!name) {
    return Response.json({ error: 'Nome da categoria é obrigatório' }, { status: 400 })
  }

  const sortOrder =
    typeof body.sortOrder === 'number' && Number.isFinite(body.sortOrder)
      ? Math.round(body.sortOrder)
      : 0

  const category = await db.category.create({
    data: {
      name,
      imageUrl: str(body.imageUrl),
      emoji: str(body.emoji),
      sortOrder,
    },
  })

  return Response.json(category, { status: 201 })
}
