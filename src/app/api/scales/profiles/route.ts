// GET  /api/scales/profiles — lista perfis de etiqueta
// POST /api/scales/profiles — cria perfil (guard: scales.manage)
// PATCH /api/scales/profiles — atualiza perfil (guard: scales.manage)
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

function intOr(value: unknown, def: number, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : def
  return Math.min(Math.max(n, min), max)
}

export async function GET(request: NextRequest) {
  const g = await guardApi(request, 'scales.view')
  if (!g.ok) return g.response
  const profiles = await db.scaleBarcodeProfile.findMany({ orderBy: { createdAt: 'desc' } })
  return Response.json(profiles)
}

export async function POST(request: NextRequest) {
  const g = await guardApi(request, 'scales.manage')
  if (!g.ok) return g.response

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return Response.json({ error: 'Nome do perfil é obrigatório' }, { status: 400 })

  const prefix = typeof body.prefix === 'string' && /^\d{1,3}$/.test(body.prefix) ? body.prefix : '2'

  const profile = await db.scaleBarcodeProfile.create({
    data: {
      name,
      brand: typeof body.brand === 'string' && body.brand ? body.brand.toUpperCase() : 'GENERIC',
      symbology: body.symbology === 'CODE128' ? 'CODE128' : 'EAN13',
      payloadType: body.payloadType === 'PRICE' ? 'PRICE' : 'WEIGHT',
      prefix,
      pluDigits: intOr(body.pluDigits, 5, 1, 6),
      payloadDigits: intOr(body.payloadDigits, 5, 1, 6),
      payloadDecimals: intOr(body.payloadDecimals, 3, 0, 3),
      checkDigit: body.checkDigit !== false,
      description: typeof body.description === 'string' ? body.description.trim() || null : null,
    },
  })
  return Response.json(profile, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const g = await guardApi(request, 'scales.manage')
  if (!g.ok) return g.response

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  if (typeof body.id !== 'string') return Response.json({ error: 'id é obrigatório' }, { status: 400 })

  const existing = await db.scaleBarcodeProfile.findUnique({ where: { id: body.id } })
  if (!existing) return Response.json({ error: 'Perfil não encontrado' }, { status: 404 })

  const data: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim()
  if (typeof body.prefix === 'string' && /^\d{1,3}$/.test(body.prefix)) data.prefix = body.prefix
  if (body.payloadType === 'PRICE' || body.payloadType === 'WEIGHT') data.payloadType = body.payloadType
  if (body.symbology === 'EAN13' || body.symbology === 'CODE128') data.symbology = body.symbology
  if (body.pluDigits !== undefined) data.pluDigits = intOr(body.pluDigits, existing.pluDigits, 1, 6)
  if (body.payloadDigits !== undefined) data.payloadDigits = intOr(body.payloadDigits, existing.payloadDigits, 1, 6)
  if (body.payloadDecimals !== undefined) data.payloadDecimals = intOr(body.payloadDecimals, existing.payloadDecimals, 0, 3)
  if (typeof body.checkDigit === 'boolean') data.checkDigit = body.checkDigit
  if (typeof body.active === 'boolean') data.active = body.active
  if (typeof body.description === 'string') data.description = body.description.trim() || null

  const updated = await db.scaleBarcodeProfile.update({ where: { id: body.id }, data })
  return Response.json(updated)
}
