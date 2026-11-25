// BAKERY ERP - API de insumos
// GET  /api/ingredients -> lista ordenada por nome, com supplierName
// POST /api/ingredients -> cria insumo { name, unit, costPerUnit, stock, minStock, supplierId? }

import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

// Sempre executa no request (evita cache estático no build)
export const dynamic = 'force-dynamic'

const round2 = (value: number): number => Math.round(value * 100) / 100

const UNITS = ['KG', 'G', 'L', 'ML', 'UN', 'PCT'] as const

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

function num(value: unknown, fallback: number): number | null {
  if (value === undefined) return fallback
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export async function GET(request: NextRequest) {
  const g = await guardApi(request, 'inventory.view')
  if (!g.ok) return g.response

  const [ingredients, suppliers] = await Promise.all([
    db.ingredient.findMany({ orderBy: { name: 'asc' } }),
    db.supplier.findMany(),
  ])

  const supplierMap = new Map(suppliers.map((s) => [s.id, s]))

  const enriched = ingredients.map((ingredient) => ({
    ...ingredient,
    supplierName: ingredient.supplierId
      ? supplierMap.get(ingredient.supplierId)?.name ?? null
      : null,
  }))

  return Response.json(enriched)
}

export async function POST(request: NextRequest) {
  const g = await guardApi(request, 'inventory.ingredients')
  if (!g.ok) return g.response

  const body = await readBody(request)

  const name = str(body.name)
  if (!name) {
    return Response.json({ error: 'Nome do insumo é obrigatório' }, { status: 400 })
  }

  let unit = 'KG'
  if (typeof body.unit === 'string' && body.unit.trim() !== '') {
    const unitValue = body.unit.trim().toUpperCase()
    if (!(UNITS as readonly string[]).includes(unitValue)) {
      return Response.json(
        { error: `Unidade inválida (use: ${UNITS.join(', ')})` },
        { status: 400 },
      )
    }
    unit = unitValue
  }

  const costPerUnit = num(body.costPerUnit, 0)
  const stock = num(body.stock, 0)
  const minStock = num(body.minStock, 0)
  if (costPerUnit === null || costPerUnit < 0) {
    return Response.json({ error: 'costPerUnit deve ser um número >= 0' }, { status: 400 })
  }
  if (stock === null || stock < 0) {
    return Response.json({ error: 'stock deve ser um número >= 0' }, { status: 400 })
  }
  if (minStock === null || minStock < 0) {
    return Response.json({ error: 'minStock deve ser um número >= 0' }, { status: 400 })
  }

  let supplierId: string | null = null
  const supplierIdInput = str(body.supplierId)
  if (supplierIdInput) {
    const supplier = await db.supplier.findUnique({ where: { id: supplierIdInput } })
    if (!supplier) {
      return Response.json({ error: 'Fornecedor não encontrado' }, { status: 400 })
    }
    supplierId = supplierIdInput
  }

  const ingredient = await db.ingredient.create({
    data: {
      name,
      unit,
      costPerUnit: round2(costPerUnit),
      stock: round2(stock),
      minStock: round2(minStock),
      supplierId,
    },
  })

  return Response.json(ingredient, { status: 201 })
}
