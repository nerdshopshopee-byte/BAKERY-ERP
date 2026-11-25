// BAKERY ERP - Linha individual da tabela tributária
// PATCH  /api/fiscal/tax-tables/[id] -> atualiza alíquotas e campos
// DELETE /api/fiscal/tax-tables/[id] -> remove linha da versão

import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

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

function rate(key: string, body: Record<string, unknown>): number | null {
  const value = num(body[key])
  if (value === null) return null
  if (value < 0 || value > 100) return null
  return round2(value)
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardApi(request, 'fiscal.tables')
  if (!g.ok) return g.response
  const { id } = await params

  const row = await db.taxTable.findUnique({ where: { id } })
  if (!row) return Response.json({ error: 'Linha tributária não encontrada' }, { status: 404 })

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return Response.json({ error: 'Corpo inválido' }, { status: 400 })

  const data: Record<string, unknown> = {}
  if (typeof body.description === 'string' && body.description.trim()) data.description = body.description.trim()
  if (typeof body.csosn === 'string' && /^\d{3}$/.test(body.csosn)) data.csosn = body.csosn
  if (typeof body.cfop === 'string' && /^\d{4}$/.test(body.cfop)) data.cfop = body.cfop
  if ('reducedIbs' in body) {
    if (typeof body.reducedIbs !== 'boolean') {
      return Response.json({ error: 'reducedIbs deve ser booleano' }, { status: 400 })
    }
    data.reducedIbs = body.reducedIbs
  }
  for (const key of ['icmsRate', 'pisRate', 'cofinsRate', 'ibsRate', 'cbsRate']) {
    if (key in body) {
      const value = rate(key, body)
      if (value === null) {
        return Response.json({ error: `${key} deve estar entre 0 e 100` }, { status: 400 })
      }
      data[key] = value
    }
  }

  const updated = await db.taxTable.update({ where: { id }, data })
  return Response.json(updated)
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardApi(request, 'fiscal.tables')
  if (!g.ok) return g.response
  const { id } = await params

  const row = await db.taxTable.findUnique({ where: { id } })
  if (!row) return Response.json({ error: 'Linha tributária não encontrada' }, { status: 404 })

  await db.taxTable.delete({ where: { id } })
  return Response.json({ ok: true })
}
