// GET    /api/scales/mappings?deviceId= — PLUs do equipamento
// POST   /api/scales/mappings — cria associação produto x PLU (guard: scales.manage)
// DELETE /api/scales/mappings?id= — remove associação (guard: scales.manage)
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const g = await guardApi(request, 'scales.view')
  if (!g.ok) return g.response

  const { searchParams } = new URL(request.url)
  const deviceId = searchParams.get('deviceId')
  const mappings = await db.scaleProductMapping.findMany({
    where: deviceId ? { deviceId } : undefined,
    orderBy: { updatedAt: 'desc' },
  })

  const products = await db.product.findMany({
    where: { id: { in: mappings.map((m) => m.productId) } },
    select: { id: true, name: true, price: true, active: true },
  })
  const productMap = new Map(products.map((p) => [p.id, p]))

  return Response.json(
    mappings.map((m) => {
      const product = productMap.get(m.productId)
      return {
        ...m,
        productName: product?.name ?? null,
        currentPrice: product?.price ?? null,
        priceDivergence:
          product && m.lastSentPrice !== null
            ? Math.abs((product.price ?? 0) - m.lastSentPrice) > 0.001
            : false,
      }
    }),
  )
}

export async function POST(request: NextRequest) {
  const g = await guardApi(request, 'scales.manage')
  if (!g.ok) return g.response

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const deviceId = typeof body.deviceId === 'string' ? body.deviceId : ''
  const productId = typeof body.productId === 'string' ? body.productId : ''
  const plu = typeof body.plu === 'string' ? body.plu.trim() : ''
  if (!deviceId || !productId || !plu) {
    return Response.json({ error: 'deviceId, productId e plu são obrigatórios' }, { status: 400 })
  }

  const device = await db.scaleDevice.findUnique({ where: { id: deviceId } })
  if (!device) return Response.json({ error: 'Equipamento não encontrado' }, { status: 404 })
  const product = await db.product.findUnique({ where: { id: productId } })
  if (!product) return Response.json({ error: 'Produto não encontrado' }, { status: 404 })

  // PLU único por equipamento
  const pluTaken = await db.scaleProductMapping.findFirst({ where: { deviceId, plu } })
  if (pluTaken) {
    return Response.json({ error: `PLU ${plu} já associado a outro produto neste equipamento` }, { status: 409 })
  }

  const mapping = await db.scaleProductMapping.upsert({
    where: { deviceId_productId: { deviceId, productId } },
    create: { deviceId, productId, plu, description: product.name.slice(0, 22) },
    update: { plu, description: product.name.slice(0, 22) },
  })

  // Mantém o PLU global do produto em sincronia quando vazio
  if (!product.plu) {
    await db.product.update({ where: { id: productId }, data: { plu } })
  }

  return Response.json(mapping, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const g = await guardApi(request, 'scales.manage')
  if (!g.ok) return g.response

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return Response.json({ error: 'id é obrigatório' }, { status: 400 })

  const existing = await db.scaleProductMapping.findUnique({ where: { id } })
  if (!existing) return Response.json({ error: 'Associação não encontrada' }, { status: 404 })

  await db.scaleProductMapping.delete({ where: { id } })
  return Response.json({ ok: true })
}
