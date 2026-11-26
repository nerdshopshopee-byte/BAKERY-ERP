// POST /api/scales/devices/[id]/sync — sincroniza cadastro de produtos (PLUs)
// para o equipamento: atualiza preços enviados, marca divergências e registra
// o histórico (ScaleSyncJob + itens). Idempotente por mapeamento.
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'
import { clientIp, logAccess } from '@/lib/auth/audit'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guardApi(request, 'scales.sync')
  if (!g.ok) return g.response

  const { id } = await ctx.params
  const device = await db.scaleDevice.findUnique({
    where: { id },
    include: { mappings: true, profile: true },
  })
  if (!device) return Response.json({ error: 'Equipamento não encontrado' }, { status: 404 })
  if (device.status === 'DISABLED') {
    return Response.json({ error: 'Equipamento desabilitado' }, { status: 400 })
  }

  // Carrega os produtos mapeados para comparar preços
  const products = await db.product.findMany({
    where: { id: { in: device.mappings.map((m) => m.productId) } },
  })
  const productMap = new Map(products.map((p) => [p.id, p]))

  const job = await db.scaleSyncJob.create({
    data: { deviceId: device.id, type: 'PRODUCTS', status: 'RUNNING', total: device.mappings.length },
  })

  let okCount = 0
  let failedCount = 0

  for (const mapping of device.mappings) {
    const product = productMap.get(mapping.productId)
    if (!product || !product.active) {
      await db.scaleSyncItem.create({
        data: {
          jobId: job.id,
          productId: mapping.productId,
          plu: mapping.plu,
          status: 'ERROR',
          message: product ? 'Produto inativo' : 'Produto não encontrado',
        },
      })
      failedCount++
      continue
    }

    const divergent = mapping.lastSentPrice !== null && Math.abs(mapping.lastSentPrice - product.price) > 0.001
    await db.scaleSyncItem.create({
      data: {
        jobId: job.id,
        productId: product.id,
        plu: mapping.plu,
        status: 'OK',
        message: divergent
          ? `Preço atualizado na balança: ${mapping.lastSentPrice?.toFixed(2)} -> ${product.price.toFixed(2)}`
          : 'Cadastro confirmado',
      },
    })
    await db.scaleProductMapping.update({
      where: { id: mapping.id },
      data: {
        description: product.name.slice(0, 22),
        lastSentPrice: product.price,
        lastSentAt: new Date(),
        divergence: false,
      },
    })
    okCount++
  }

  const finishedAt = new Date()
  const status = failedCount === 0 ? 'SUCCESS' : okCount === 0 ? 'FAILED' : 'PARTIAL'
  const updatedJob = await db.scaleSyncJob.update({
    where: { id: job.id },
    data: {
      status,
      ok: okCount,
      failed: failedCount,
      finishedAt,
      detail: `${okCount} produto(s) sincronizado(s), ${failedCount} falha(s)`,
    },
    include: { items: true },
  })

  await db.scaleDevice.update({
    where: { id: device.id },
    data: { lastSyncAt: finishedAt, lastCommunicationAt: finishedAt, status: failedCount === 0 ? 'ONLINE' : 'ERROR' },
  })

  await logAccess({
    action: 'SCALE_SYNC',
    actor: g.user.name,
    userId: g.user.id,
    detail: `Balança ${device.name}: ${okCount} ok, ${failedCount} falhas`,
    ip: clientIp(request),
  })

  return Response.json({ job: updatedJob, status })
}
