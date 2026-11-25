// BAKERY ERP - Listagem de documentos fiscais
// GET /api/fiscal/documents?type=&status=&limit=

import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const g = await guardApi(request, 'fiscal.view')
  if (!g.ok) return g.response

  const { searchParams } = new URL(request.url)
  const where: { type?: string; status?: string } = {}
  const type = searchParams.get('type')
  const status = searchParams.get('status')
  if (type === 'NFCE' || type === 'NFE') where.type = type
  if (status) where.status = status

  const documents = await db.fiscalDocument.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    orderBy: { issuedAt: 'desc' },
    take: 200,
    select: {
      id: true, type: true, serie: true, number: true, accessKey: true,
      saleId: true, saleCode: true, productsTotal: true, discount: true,
      icmsTotal: true, ibsTotal: true, cbsTotal: true, total: true,
      issuerName: true, issuerCnpj: true, customerName: true, customerDoc: true,
      status: true, environment: true, contingency: true, protocol: true,
      receivedAt: true, rejectCode: true, rejectMessage: true, attempts: true,
      operator: true, issuedAt: true,
    },
  })

  const summary = await db.fiscalDocument.groupBy({
    by: ['status'],
    _count: { id: true },
  })

  return Response.json({ documents, summary })
}
