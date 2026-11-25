// BAKERY ERP - Emissão de documento fiscal
// POST /api/fiscal/documents/emit  { saleId, type?, customerDoc?, customerName?, customerAddress? }

import { type NextRequest } from 'next/server'
import { guardApi } from '@/lib/auth/guard'
import { emitFromSale, FiscalError } from '@/lib/fiscal/service'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const g = await guardApi(request, 'fiscal.emit')
  if (!g.ok) return g.response

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const saleId = typeof body?.saleId === 'string' ? body.saleId : null
    if (!saleId) return Response.json({ error: 'saleId obrigatório' }, { status: 400 })

    const type = body?.type === 'NFE' ? 'NFE' : 'NFCE'
    const document = await emitFromSale({
      saleId,
      type,
      customerName: typeof body?.customerName === 'string' ? body.customerName : undefined,
      customerDoc: typeof body?.customerDoc === 'string' ? body.customerDoc : undefined,
      customerAddress: typeof body?.customerAddress === 'string' ? body.customerAddress : undefined,
      operator: g.user.name,
    })
    return Response.json(document)
  } catch (error) {
    if (error instanceof FiscalError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status })
    }
    console.error('[api/fiscal/documents/emit]', error)
    return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
