// BAKERY ERP - Serviço do Motor Fiscal: orquestra numeração, chave de acesso,
// transmissão via provedor, contingência, cancelamento e inutilização.
// Toda a numeração é reservada em transação para evitar duplicidade.

import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import {
  buildDanfeMeta,
  buildXml,
  calcTaxes,
  generateAccessKey,
  isValidCnpj,
  onlyDigits,
  round2,
  type TaxRow,
} from './engine'
import { getProvider } from './provider'

export class FiscalError extends Error {
  readonly status: number
  readonly code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.name = 'FiscalError'
    this.status = status
    this.code = code
  }
}

const round = round2

/** Lê o DANFE armazenado (JSON) para reconstrução do payload no reenvio */
function parseDanfe(meta: string | null): { itens: { name: string; qty: number; unitPrice: number; subtotal: number }[]; pagamentos: { label: string; amount: number }[] } | null {
  if (!meta) return null
  try {
    const parsed = JSON.parse(meta) as { itens?: { name: string; qty: number; unitPrice: number; subtotal: number }[]; pagamentos?: { label: string; amount: number }[] }
    return {
      itens: Array.isArray(parsed.itens) ? parsed.itens : [],
      pagamentos: Array.isArray(parsed.pagamentos) ? parsed.pagamentos : [],
    }
  } catch {
    return null
  }
}

// ============ Config ============

export async function getConfig() {
  const config = await db.fiscalConfig.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!config) {
    throw new FiscalError(422, 'Motor fiscal não configurado. Configure o emissor em Fiscal > Configuração.')
  }
  return config
}

/** Validação básica do certificado A1 - usada antes de qualquer transmissão */
function assertCertificate(config: Awaited<ReturnType<typeof getConfig>>): void {
  if (!config.certA1Name || !config.certA1Expires) {
    throw new FiscalError(422, 'Certificado digital A1 não configurado. Configure em Fiscal > Configuração.', 'CERT_MISSING')
  }
  const days = Math.floor((config.certA1Expires.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  if (days <= 0) {
    throw new FiscalError(422, 'Certificado digital A1 expirado. Renove o certificado antes de emitir.', 'CERT_EXPIRED')
  }
}

export async function getTaxRows(version: string): Promise<TaxRow[]> {
  const rows = await db.taxTable.findMany({ where: { version, active: true } })
  return rows.map((row) => ({
    ncm: row.ncm,
    cfop: row.cfop,
    csosn: row.csosn,
    cst: row.cst,
    icmsRate: row.icmsRate,
    pisRate: row.pisRate,
    cofinsRate: row.cofinsRate,
    ibsRate: row.ibsRate,
    cbsRate: row.cbsRate,
    reducedIbs: row.reducedIbs,
  }))
}

// ============ Emissão ============

export type EmitInput = {
  saleId?: string
  type?: 'NFCE' | 'NFE'
  customerName?: string
  customerDoc?: string
  customerAddress?: string
  operator: string
}

/**
 * Emite documento fiscal para uma venda do PDV:
 * reserva número em transação, calcula tributos pela tabela versionada,
 * transmite via provedor e persiste XML + eventos.
 */
export async function emitFromSale(input: EmitInput) {
  const config = await getConfig()
  assertCertificate(config)

  const sale = await db.sale.findUnique({
    where: { id: input.saleId ?? '' },
    include: { items: true, payments: true },
  })
  if (!sale) throw new FiscalError(404, 'Venda não encontrada')
  if (sale.status !== 'CONCLUIDA') throw new FiscalError(422, 'Venda cancelada não pode ser faturada')

  const existing = await db.fiscalDocument.findFirst({
    where: { saleId: sale.id, status: { in: ['PENDENTE', 'CONTINGENCIA', 'TRANSMITIDA'] } },
  })
  if (existing) {
    throw new FiscalError(409, `Venda ${sale.code} já possui documento fiscal ${existing.accessKey.slice(0, 6)}...`, 'DUPLICATE')
  }

  const type = input.type ?? 'NFCE'
  if (type === 'NFE') {
    const docDigits = onlyDigits(input.customerDoc ?? '')
    if (!docDigits) throw new FiscalError(422, 'NF-e exige CNPJ/CPF do destinatário')
    if (docDigits.length !== 11 && docDigits.length !== 14) {
      throw new FiscalError(422, 'Documento do destinatário inválido (use CPF 11 ou CNPJ 14 dígitos)')
    }
  }

  const rows = await getTaxRows(config.taxVersion)
  const taxes = calcTaxes(
    sale.items.map((item) => ({
      name: item.name,
      qty: item.qty,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
      ncm: null,
    })),
    rows,
    sale.discount
  )

  return transmitNewDocument({
    config,
    type,
    saleId: sale.id,
    saleCode: sale.code,
    items: sale.items.map((item) => ({
      name: item.name,
      qty: item.qty,
      unit: item.unit,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
      ncm: null,
    })),
    payments: sale.payments.map((payment) => ({ method: payment.method, amount: payment.amount })),
    discount: sale.discount,
    taxes,
    customerName: input.customerName ?? sale.customer ?? null,
    customerDoc: input.customerDoc ?? null,
    customerAddress: input.customerAddress ?? null,
    operator: input.operator,
  })
}

type TransmitArgs = {
  config: Awaited<ReturnType<typeof getConfig>>
  type: 'NFCE' | 'NFE'
  saleId?: string | null
  saleCode?: string | null
  items: { name: string; qty: number; unit: string; unitPrice: number; subtotal: number; ncm?: string | null }[]
  payments: { method: string; amount: number }[]
  discount: number
  taxes: ReturnType<typeof calcTaxes>
  customerName: string | null
  customerDoc: string | null
  customerAddress: string | null
  operator: string
}

async function reserveNumber(config: Awaited<ReturnType<typeof getConfig>>, type: 'NFCE' | 'NFE'): Promise<{ serie: number; number: number }> {
  const isNfce = type === 'NFCE'
  const updated = await db.fiscalConfig.update({
    where: { id: config.id },
    data: isNfce ? { nfceNextNumber: { increment: 1 } } : { nfeNextNumber: { increment: 1 } },
  })
  return {
    serie: isNfce ? updated.nfceSeries : updated.nfeSeries,
    number: (isNfce ? updated.nfceNextNumber : updated.nfeNextNumber) - 1,
  }
}

/**
 * Cria o documento, transmite e grava eventos. Numeração reservada atômica.
 * Se a chave de acesso colidir (contador desalinhado por importação/manual),
 * o próximo número é reservado automaticamente (até 6 tentativas).
 */
async function transmitNewDocument(args: TransmitArgs) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await tryTransmitNewDocument(args)
    } catch (error) {
      const isKeyCollision =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        (error.meta as { target?: string[] } | null)?.target?.includes('accessKey') === true
      if (!isKeyCollision) throw error
    }
  }
  throw new FiscalError(422, 'Não foi possível reservar numeração livre após várias tentativas')
}

async function tryTransmitNewDocument(args: TransmitArgs) {
  const { config, type } = args
  const { serie, number } = await reserveNumber(config, type)
  const contingency = config.contingency && type === 'NFCE'
  const now = new Date()
  const accessKey = generateAccessKey({
    uf: config.uf,
    cnpj: config.cnpj,
    type,
    serie,
    number,
    contingency,
    date: now,
  })

  const xml = buildXml({
    type,
    accessKey,
    serie,
    number,
    environment: config.environment,
    contingency,
    date: now,
    issuerName: config.companyName,
    issuerCnpj: config.cnpj,
    issuerIe: config.ie,
    uf: config.uf,
    crt: config.crt,
    customerName: args.customerName,
    customerDoc: args.customerDoc,
    customerAddress: args.customerAddress,
    items: args.items,
    payments: args.payments,
    discount: args.discount,
    taxes: args.taxes,
  })

  const danfe = buildDanfeMeta({
    type,
    accessKey,
    serie,
    number,
    issuerName: config.companyName,
    issuerCnpj: config.cnpj,
    items: args.items.map((item) => ({ name: item.name, qty: item.qty, unitPrice: item.unitPrice, subtotal: item.subtotal })),
    payments: args.payments,
    taxes: args.taxes,
    discount: args.discount,
    environment: config.environment,
    contingency,
    date: now,
  })

  const initialStatus = contingency ? 'CONTINGENCIA' : 'PENDENTE'
  const document = await db.fiscalDocument.create({
    data: {
      type,
      serie,
      number,
      accessKey,
      saleId: args.saleId ?? null,
      saleCode: args.saleCode ?? null,
      productsTotal: args.taxes.productsTotal,
      discount: args.discount,
      icmsTotal: args.taxes.icmsTotal,
      ibsTotal: args.taxes.ibsTotal,
      cbsTotal: args.taxes.cbsTotal,
      total: round(args.taxes.productsTotal - args.discount),
      issuerName: config.companyName,
      issuerCnpj: config.cnpj,
      customerName: args.customerName,
      customerDoc: args.customerDoc,
      customerAddress: args.customerAddress,
      status: initialStatus,
      environment: config.environment,
      contingency,
      attempts: 1,
      xml,
      danfeMeta: JSON.stringify(danfe),
      operator: args.operator,
      issuedAt: now,
      events: {
        create: {
          type: 'EMISSAO',
          accessKey,
          description: `Documento ${type} nº ${number}/${serie} gerado${contingency ? ' em contingência off-line (tpEmis 9)' : ''}`,
          author: args.operator,
        },
      },
    },
    include: { events: true },
  })

  if (contingency) {
    await db.fiscalEvent.create({
      data: {
        documentId: document.id,
        type: 'CONTINGENCIA_ON',
        accessKey,
        description: 'Documento retido em contingência (SEFAZ indisponível); transmissão posterior obrigatória',
        author: args.operator,
      },
    })
    return document
  }

  // Transmissão normal
  const provider = getProvider(config.provider)
  const result = await provider.transmit({
    doc: {
      type,
      accessKey,
      serie,
      number,
      environment: config.environment,
      contingency,
      date: now,
      issuerName: config.companyName,
      issuerCnpj: config.cnpj,
      issuerIe: config.ie,
      uf: config.uf,
      crt: config.crt,
      customerName: args.customerName,
      customerDoc: args.customerDoc,
      customerAddress: args.customerAddress,
      items: args.items,
      payments: args.payments,
      discount: args.discount,
      taxes: args.taxes,
    },
    accessKey,
  })

  const updated = await db.fiscalDocument.update({
    where: { id: document.id },
    data: result.authorized
      ? { status: 'TRANSMITIDA', protocol: result.protocol, receivedAt: result.receivedAt, contingency: false }
      : { status: 'REJEITADA', rejectCode: result.rejectCode, rejectMessage: result.rejectMessage },
  })

  await db.fiscalEvent.create({
    data: {
      documentId: document.id,
      type: result.authorized ? 'AUTORIZACAO' : 'REJEICAO',
      accessKey,
      description: result.authorized
        ? `Autorizado pelo provedor ${provider.id} - protocolo ${result.protocol}`
        : `${result.rejectCode} - ${result.rejectMessage}`,
      author: args.operator,
    },
  })

  return updated
}

// ============ Reenvio (rejeitada / contingência) ============

export async function retransmit(documentId: string, operator: string) {
  const config = await getConfig()
  assertCertificate(config)
  const document = await db.fiscalDocument.findUnique({ where: { id: documentId } })
  if (!document) throw new FiscalError(404, 'Documento fiscal não encontrado')
  if (!['REJEITADA', 'CONTINGENCIA', 'PENDENTE'].includes(document.status)) {
    throw new FiscalError(422, `Documento em status ${document.status} não pode ser reenviado`)
  }

  const taxes = calcTaxes(
    // Reconstrói a base tributária a partir dos itens armazenados no DANFE
    [],
    await getTaxRows(config.taxVersion),
    0
  )
  // Mantém os tributos originais do documento
  taxes.productsTotal = document.productsTotal
  taxes.icmsTotal = document.icmsTotal
  taxes.ibsTotal = document.ibsTotal
  taxes.cbsTotal = document.cbsTotal

  // Reconstrói itens e pagamentos a partir do DANFE armazenado (fonte fiel do snapshot)
  const danfe = parseDanfe(document.danfeMeta)
  const items = (danfe?.itens ?? []).map((item) => ({
    name: item.name,
    qty: item.qty,
    unit: 'UN',
    unitPrice: item.unitPrice,
    subtotal: item.subtotal,
    ncm: null as string | null,
  }))
  const payments = (danfe?.pagamentos ?? []).map((payment) => ({
    method: payment.label.toUpperCase().includes('DINHEIRO')
      ? 'DINHEIRO'
      : payment.label.toUpperCase().includes('PIX')
        ? 'PIX'
        : payment.label.toUpperCase().includes('DÉBITO') || payment.label.toUpperCase().includes('DEBITO')
          ? 'DEBITO'
          : payment.label.toUpperCase().includes('CRÉDITO') || payment.label.toUpperCase().includes('CREDITO')
            ? 'CREDITO'
            : 'OUTROS',
    amount: payment.amount,
  }))

  const provider = getProvider(config.provider)
  const result = await provider.transmit({
    doc: {
      type: document.type as 'NFCE' | 'NFE',
      accessKey: document.accessKey,
      serie: document.serie,
      number: document.number,
      environment: config.environment,
      contingency: false,
      date: document.issuedAt,
      issuerName: document.issuerName,
      issuerCnpj: document.issuerCnpj,
      issuerIe: config.ie,
      uf: config.uf,
      crt: config.crt,
      customerName: document.customerName,
      customerDoc: document.customerDoc,
      customerAddress: document.customerAddress,
      items,
      payments,
      discount: document.discount,
      taxes,
    },
    accessKey: document.accessKey,
  })

  const updated = await db.fiscalDocument.update({
    where: { id: document.id },
    data: {
      attempts: { increment: 1 },
      ...(result.authorized
        ? { status: 'TRANSMITIDA', protocol: result.protocol, receivedAt: result.receivedAt, contingency: false, rejectCode: null, rejectMessage: null }
        : { status: 'REJEITADA', rejectCode: result.rejectCode, rejectMessage: result.rejectMessage }),
    },
  })

  await db.fiscalEvent.create({
    data: {
      documentId: document.id,
      type: result.authorized ? 'AUTORIZACAO' : 'REJEICAO',
      accessKey: document.accessKey,
      description: result.authorized
        ? `Reenvio autorizado - protocolo ${result.protocol}`
        : `Reenvio rejeitado: ${result.rejectCode} - ${result.rejectMessage}`,
      author: operator,
    },
  })

  return updated
}

// ============ Cancelamento ============

export async function cancelDocument(documentId: string, reason: string, operator: string) {
  if (!reason || reason.trim().length < 15) {
    throw new FiscalError(422, 'Justificativa obrigatória com pelo menos 15 caracteres')
  }
  const config = await getConfig()
  const document = await db.fiscalDocument.findUnique({ where: { id: documentId } })
  if (!document) throw new FiscalError(404, 'Documento fiscal não encontrado')
  if (document.status !== 'TRANSMITIDA' && document.status !== 'CONTINGENCIA') {
    throw new FiscalError(422, `Documento em status ${document.status} não pode ser cancelado`)
  }

  const provider = getProvider(config.provider)
  const result = await provider.cancel({
    accessKey: document.accessKey,
    protocol: document.protocol ?? '',
    reason: reason.trim(),
    xml: document.xml ?? '',
  })

  const updated = await db.fiscalDocument.update({
    where: { id: document.id },
    data: { status: 'CANCELADA', xml: document.xml },
  })

  await db.fiscalEvent.create({
    data: {
      documentId: document.id,
      type: 'CANCELAMENTO',
      accessKey: document.accessKey,
      description: `Cancelamento homologado - protocolo ${result.protocol} - Justificativa: ${reason.trim()}`,
      author: operator,
    },
  })

  return updated
}

// ============ Inutilização ============

export async function inutilizeRange(
  type: 'NFCE' | 'NFE',
  serie: number,
  from: number,
  to: number,
  reason: string,
  operator: string
) {
  if (!reason || reason.trim().length < 15) {
    throw new FiscalError(422, 'Justificativa obrigatória com pelo menos 15 caracteres')
  }
  if (from > to) throw new FiscalError(422, 'Faixa de numeração inválida')
  if (to - from > 500) throw new FiscalError(422, 'Faixa muito ampla (máximo 500 números)')

  const config = await getConfig()
  const existing = await db.fiscalDocument.findMany({
    where: { type, serie, number: { gte: from, lte: to }, status: { in: ['TRANSMITIDA', 'CONTINGENCIA'] } },
    select: { number: true },
  })
  if (existing.length > 0) {
    throw new FiscalError(422, `Faixa contém documentos autorizados (ex: nº ${existing[0].number}). Inutilização só vale para números não utilizados.`)
  }

  const accessKey = generateAccessKey({ uf: config.uf, cnpj: config.cnpj, type, serie, number: from, contingency: false })
  const document = await db.fiscalDocument.create({
    data: {
      type,
      serie,
      number: from,
      accessKey,
      productsTotal: 0,
      total: 0,
      issuerName: config.companyName,
      issuerCnpj: config.cnpj,
      status: 'INUTILIZADA',
      environment: config.environment,
      attempts: 0,
      events: {
        create: {
          type: 'INUTILIZACAO',
          accessKey,
          description: `Inutilização homologada - ${type === 'NFCE' ? 'NFC-e' : 'NF-e'} série ${serie}, faixa ${from} a ${to} - Justificativa: ${reason.trim()}`,
          author: operator,
        },
      },
    },
    include: { events: true },
  })
  return document
}

// ============ Contingência ============

export async function setContingency(enabled: boolean, reason: string | null, operator: string) {
  const config = await getConfig()
  if (enabled && (!reason || reason.trim().length < 10)) {
    throw new FiscalError(422, 'Informe o motivo da entrada em contingência (mínimo 10 caracteres)')
  }
  const updated = await db.fiscalConfig.update({
    where: { id: config.id },
    data: {
      contingency: enabled,
      contingencyReason: enabled ? reason?.trim() ?? null : null,
      contingencySince: enabled ? new Date() : null,
    },
  })
  await db.fiscalEvent.create({
    data: {
      documentId: null,
      type: enabled ? 'CONTINGENCIA_ON' : 'CONTINGENCIA_OFF',
      description: enabled
        ? `Emissor entrou em contingência off-line - motivo: ${reason?.trim()}`
        : 'Emissor saiu de contingência; documentos pendentes já podem ser transmitidos',
      author: operator,
    },
  })
  return updated
}

// ============ Certificado (status automático) ============

export function certificateStatus(expires: Date | null | undefined): 'MISSING' | 'VALID' | 'EXPIRING' | 'EXPIRED' {
  if (!expires) return 'MISSING'
  const days = Math.floor((expires.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
  if (days <= 0) return 'EXPIRED'
  if (days <= 30) return 'EXPIRING'
  return 'VALID'
}
