// GET /api/scales/devices/[id]/export — gera arquivo de cadastro de produtos
// no layout do fabricante (via adaptador) para importação pelo gerenciador.
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'
import { getAdapter } from '@/lib/scales/adapters'
import type { AdapterProductPayload } from '@/lib/scales/adapters'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await guardApi(request, 'scales.sync')
  if (!g.ok) return g.response

  const { id } = await ctx.params
  const device = await db.scaleDevice.findUnique({ where: { id }, include: { mappings: true } })
  if (!device) return Response.json({ error: 'Equipamento não encontrado' }, { status: 404 })

  const products = await db.product.findMany({
    where: { id: { in: device.mappings.map((m) => m.productId) } },
  })
  const productMap = new Map(products.map((p) => [p.id, p]))

  const payload: AdapterProductPayload[] = device.mappings
    .map((m) => {
      const product = productMap.get(m.productId)
      if (!product) return null
      return {
        plu: m.plu,
        description: m.description ?? product.name,
        unitPrice: product.price,
        validadeDays: product.shelfLifeDays ?? null,
        department: product.weighDepartment ?? device.department ?? null,
        tareGrams: product.tara,
        saleUnit: product.saleUnit,
      }
    })
    .filter((p): p is AdapterProductPayload => p !== null)

  const adapter = getAdapter(device.brand)
  if (!adapter.exportProducts) {
    return Response.json({ error: 'Adaptador não suporta exportação de arquivos' }, { status: 400 })
  }

  const file = adapter.exportProducts(payload)
  await db.scaleDevice.update({
    where: { id: device.id },
    data: { lastCommunicationAt: new Date() },
  })

  return new Response(file.content, {
    headers: {
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'X-Adapter-Homologation': adapter.homologation,
      'X-Adapter-Notes': encodeURIComponent(adapter.notes),
    },
  })
}
