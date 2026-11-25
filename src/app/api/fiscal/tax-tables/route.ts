// BAKERY ERP - Tabelas tributárias versionadas (NCM, CFOP, CSOSN, IBS/CBS)
// GET  /api/fiscal/tax-tables            -> linhas da versão corrente (ou ?version=)
// POST /api/fiscal/tax-tables            -> nova linha na versão

import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'
import { onlyDigits } from '@/lib/fiscal/engine'

export const dynamic = 'force-dynamic'

const round2 = (value: number): number => Math.round(value * 100) / 100

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.replace(',', '.'))
    if (value.trim() !== '' && Number.isFinite(parsed)) return parsed
  }
  return null
}

export async function GET(request: NextRequest) {
  const g = await guardApi(request, 'fiscal.view')
  if (!g.ok) return g.response

  const { searchParams } = new URL(request.url)
  const config = await db.fiscalConfig.findFirst({ orderBy: { createdAt: 'asc' } })
  const version = searchParams.get('version') ?? config?.taxVersion ?? '2026.1'
  const rows = await db.taxTable.findMany({
    where: { version },
    orderBy: { ncm: 'asc' },
  })
  const versions = await db.taxTable.groupBy({ by: ['version'], _count: { id: true } })
  return Response.json({ version, rows, versions })
}

export async function POST(request: NextRequest) {
  const g = await guardApi(request, 'fiscal.tables')
  if (!g.ok) return g.response
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return Response.json({ error: 'Corpo inválido' }, { status: 400 })

    const ncm = onlyDigits(typeof body.ncm === 'string' ? body.ncm : '')
    if (ncm.length !== 8) return Response.json({ error: 'NCM deve ter 8 dígitos' }, { status: 400 })
    const description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null
    if (!description) return Response.json({ error: 'Descrição obrigatória' }, { status: 400 })
    const cfop = typeof body.cfop === 'string' && /^\d{4}$/.test(body.cfop) ? body.cfop : '5102'
    const config = await db.fiscalConfig.findFirst({ orderBy: { createdAt: 'asc' } })
    const version = typeof body.version === 'string' && body.version.trim() ? body.version.trim() : config?.taxVersion ?? '2026.1'

    const duplicated = await db.taxTable.findUnique({ where: { version_ncm_cfop: { version, ncm, cfop } } })
    if (duplicated) return Response.json({ error: 'NCM/CFOP já existe nesta versão' }, { status: 409 })

    const rate = (key: string): number => {
      const value = num(body[key])
      if (value === null || value < 0 || value > 100) return 0
      return round2(value)
    }

    const row = await db.taxTable.create({
      data: {
        version,
        ncm,
        description,
        cfop,
        origin: typeof body.origin === 'string' && body.origin.trim() ? body.origin.trim() : '0',
        csosn: typeof body.csosn === 'string' && /^\d{3}$/.test(body.csosn) ? body.csosn : '102',
        cst: typeof body.cst === 'string' && /^\d{2,3}$/.test(body.cst) ? body.cst : null,
        icmsRate: rate('icmsRate'),
        pisRate: rate('pisRate'),
        cofinsRate: rate('cofinsRate'),
        ibsRate: rate('ibsRate'),
        cbsRate: rate('cbsRate'),
        reducedIbs: body.reducedIbs === true,
      },
    })
    return Response.json(row)
  } catch (error) {
    console.error('[api/fiscal/tax-tables]', error)
    return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
