// GET /api/delivery-zones — zonas/bairros com taxa | POST — criação de zona
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

function strField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function toErrorResponse(error: unknown): Response {
  console.error('[api/delivery-zones]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

interface ZoneBody {
  name?: string
  fee?: number | string
}

function numField(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : typeof value === 'number' ? value : NaN
  return Number.isFinite(n) && n >= 0 ? n : null
}

export async function GET() {
  try {
    const zones = await db.deliveryZone.findMany({ orderBy: { name: 'asc' } })
    return Response.json(zones)
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as ZoneBody | null
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
    }

    const name = strField(body.name)
    if (!name) {
      return Response.json({ error: 'Nome da região é obrigatório' }, { status: 400 })
    }

    const fee = numField(body.fee) ?? 0
    const zone = await db.deliveryZone.create({ data: { name, fee } })
    return Response.json(zone, { status: 201 })
  } catch (error) {
    return toErrorResponse(error)
  }
}
