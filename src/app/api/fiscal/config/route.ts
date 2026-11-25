// BAKERY ERP - API do emissor fiscal
// GET /api/fiscal/config  -> configuração atual (cria default quando inexistente)
// PUT  /api/fiscal/config -> atualiza identidade, séries, certificado e ambiente

import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'
import { certificateStatus } from '@/lib/fiscal/service'
import { isValidCnpj, onlyDigits } from '@/lib/fiscal/engine'

export const dynamic = 'force-dynamic'

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function formatCnpj(cnpj: string): string {
  const digits = onlyDigits(cnpj)
  if (digits.length !== 14) return cnpj
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
}

async function ensureConfig() {
  const existing = await db.fiscalConfig.findFirst({ orderBy: { createdAt: 'asc' } })
  if (existing) return existing
  const company = await db.company.findFirst({ orderBy: { createdAt: 'asc' } })
  return db.fiscalConfig.create({
    data: {
      companyName: company?.legalName ?? company?.name ?? 'Padaria',
      cnpj: onlyDigits(company?.cnpj ?? '') || '12345678000195',
      ie: 'ISENTO',
      uf: 'SP',
      crt: 'SIMPLES_NACIONAL',
      environment: 'HOMOLOGACAO',
      nfceSeries: 1,
      nfceNextNumber: 1,
      nfeSeries: 1,
      nfeNextNumber: 1,
    },
  })
}

export async function GET(request: NextRequest) {
  const g = await guardApi(request, 'fiscal.view')
  if (!g.ok) return g.response
  const config = await ensureConfig()
  return Response.json({
    ...config,
    cnpj: formatCnpj(config.cnpj),
    certStatus: certificateStatus(config.certA1Expires),
  })
}

export async function PUT(request: NextRequest) {
  const g = await guardApi(request, 'fiscal.config')
  if (!g.ok) return g.response
  try {
    const config = await ensureConfig()
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return Response.json({ error: 'Corpo inválido' }, { status: 400 })

    const data: Record<string, unknown> = {}

    if ('companyName' in body) {
      const name = str(body.companyName)
      if (!name) return Response.json({ error: 'Razão social obrigatória' }, { status: 400 })
      data.companyName = name
    }
    if ('cnpj' in body) {
      const cnpj = onlyDigits(str(body.cnpj) ?? '')
      if (!isValidCnpj(cnpj)) return Response.json({ error: 'CNPJ inválido (verifique os dígitos)' }, { status: 400 })
      data.cnpj = cnpj
    }
    if ('ie' in body) data.ie = str(body.ie)
    if ('uf' in body) {
      const uf = str(body.uf)
      if (!uf || uf.length !== 2 || !/^[A-Z]{2}$/i.test(uf)) {
        return Response.json({ error: 'UF inválida (use a sigla, ex: SP)' }, { status: 400 })
      }
      data.uf = uf.toUpperCase()
    }
    if ('crt' in body) {
      const crt = str(body.crt)
      if (crt !== 'SIMPLES_NACIONAL' && crt !== 'LUCRO_REAL' && crt !== 'LUCRO_PRESUMIDO') {
        return Response.json({ error: 'Regime tributário inválido' }, { status: 400 })
      }
      data.crt = crt
    }
    if ('environment' in body) {
      const env = str(body.environment)
      if (env !== 'HOMOLOGACAO' && env !== 'PRODUCAO') {
        return Response.json({ error: 'Ambiente inválido' }, { status: 400 })
      }
      data.environment = env
    }
    if ('provider' in body) data.provider = str(body.provider) ?? 'LOCAL_SIMULADO'
    if ('nfceSeries' in body) {
      const serie = Number(body.nfceSeries)
      if (!Number.isInteger(serie) || serie < 1 || serie > 999) {
        return Response.json({ error: 'Série NFC-e inválida (1-999)' }, { status: 400 })
      }
      data.nfceSeries = serie
    }
    if ('nfceNextNumber' in body) {
      const next = Number(body.nfceNextNumber)
      if (!Number.isInteger(next) || next < 1) {
        return Response.json({ error: 'Próximo número NFC-e inválido' }, { status: 400 })
      }
      data.nfceNextNumber = next
    }
    if ('nfeSeries' in body) {
      const serie = Number(body.nfeSeries)
      if (!Number.isInteger(serie) || serie < 1 || serie > 999) {
        return Response.json({ error: 'Série NF-e inválida (1-999)' }, { status: 400 })
      }
      data.nfeSeries = serie
    }
    if ('nfeNextNumber' in body) {
      const next = Number(body.nfeNextNumber)
      if (!Number.isInteger(next) || next < 1) {
        return Response.json({ error: 'Próximo número NF-e inválido' }, { status: 400 })
      }
      data.nfeNextNumber = next
    }
    if ('autoEmit' in body) {
      if (typeof body.autoEmit !== 'boolean') {
        return Response.json({ error: 'autoEmit deve ser booleano' }, { status: 400 })
      }
      data.autoEmit = body.autoEmit
    }
    if ('certA1Name' in body) data.certA1Name = str(body.certA1Name)
    if ('certA1Expires' in body) {
      const raw = str(body.certA1Expires)
      if (!raw) {
        data.certA1Expires = null
        data.certA1Status = 'MISSING'
      } else {
        const parsed = new Date(raw)
        if (Number.isNaN(parsed.getTime())) {
          return Response.json({ error: 'Validade do certificado inválida' }, { status: 400 })
        }
        data.certA1Expires = parsed
        data.certA1Status = certificateStatus(parsed)
      }
    }
    if ('taxVersion' in body) data.taxVersion = str(body.taxVersion) ?? '2026.1'

    const updated = await db.fiscalConfig.update({ where: { id: config.id }, data })
    await db.accessLog.create({
      data: {
        actor: g.user.name,
        userId: g.user.id,
        userEmail: g.user.email,
        action: 'FISCAL_CONFIG_UPDATED',
        result: 'SUCCESS',
        detail: `Configuração fiscal atualizada (${Object.keys(data).join(', ')})`,
      },
    })
    return Response.json({
      ...updated,
      cnpj: formatCnpj(updated.cnpj),
      certStatus: certificateStatus(updated.certA1Expires),
    })
  } catch (error) {
    console.error('[api/fiscal/config]', error)
    return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
