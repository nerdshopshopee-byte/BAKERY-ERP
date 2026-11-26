// BAKERY ERP - Parser de NF-e (XML) para importação de mercadorias
// Suporta arquivos procNFe/nfeProc, NFe isolada e XMLs com/sem namespaces.
// Normaliza itens para mapeamento em Insumos ou Produtos do ERP.
import { XMLParser } from 'fast-xml-parser'

export interface NfeDraftItem {
  index: number
  code: string
  ean: string
  name: string
  ncm: string
  cfop: string
  unit: string // unidade comercial normalizada (KG|G|L|ML|UN|PCT|CX|...)
  qty: number // qCom
  unitCost: number // vUnCom
  total: number // vProd - vDesc
}

export interface NfeDraftHeader {
  number: string // nNF
  series: string
  issuedAt: string | null
  natOp: string
  issuerName: string
  issuerCnpj: string
  total: number // vNF
  discount: number
}

export interface NfeDraft {
  header: NfeDraftHeader
  items: NfeDraftItem[]
}

type LooseRecord = Record<string, unknown>

const parser = new XMLParser({
  removeNSPrefix: true,
  ignoreAttributes: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
})

function asRecord(value: unknown): LooseRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as LooseRecord) : null
}

function str(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function num(value: unknown): number {
  const parsed = Number(str(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

/** Normaliza a unidade comercial da NF-e para as unidades reconhecidas pelo ERP */
export function normalizeNfeUnit(unit: string): string {
  const u = unit.trim().toUpperCase()
  const map: Record<string, string> = {
    KG: 'KG',
    K: 'KG',
    QUI: 'KG',
    G: 'G',
    GR: 'G',
    GRAMA: 'G',
    L: 'L',
    LT: 'L',
    LITRO: 'L',
    ML: 'ML',
    MILILITRO: 'ML',
    UN: 'UN',
    UND: 'UN',
    UNIDADE: 'UN',
    PC: 'UN',
    PCT: 'PCT',
    PACOTE: 'PCT',
    CX: 'CX',
    CAIXA: 'CX',
    DZ: 'DZ',
    DUZIA: 'DZ',
    FD: 'FD',
    FARDO: 'FD',
    SC: 'SC',
    SACO: 'SC',
  }
  return map[u] ?? 'UN'
}

function extractNfe(parsed: LooseRecord): LooseRecord | null {
  // caminhos possíveis: nfeProc > NFe, procNFe > NFe, NFe direto
  const direct = asRecord(parsed.NFe)
  if (direct) return asRecord(direct.infNFe)
  for (const wrapper of ['nfeProc', 'procNFe', 'enviNFe']) {
    const wrap = asRecord(parsed[wrapper])
    if (wrap) {
      const nfe = asRecord(wrap.NFe)
      if (nfe) return asRecord(nfe.infNFe)
    }
  }
  // alguns emissores usam tags em minúsculas
  const lower: LooseRecord = {}
  for (const [k, v] of Object.entries(parsed)) lower[k.toLowerCase()] = v
  for (const wrapper of ['nfeproc', 'procnfe', 'nfe']) {
    const wrap = asRecord(lower[wrapper])
    if (wrap) {
      const nfe = asRecord(wrap.nfe ?? wrap.NFe)
      if (nfe) return asRecord(nfe.infnfe ?? nfe.infNFe)
    }
  }
  return null
}

function toArray<T>(value: unknown): T[] {
  if (value === null || value === undefined) return []
  return (Array.isArray(value) ? value : [value]) as T[]
}

/** Faz o parse completo do XML de NF-e e valida a estrutura essencial */
export function parseNfeXml(xml: string): NfeDraft {
  let parsed: LooseRecord
  try {
    parsed = parser.parse(xml) as LooseRecord
  } catch {
    throw new Error('Arquivo XML malformado ou corrompido')
  }

  const infNFe = extractNfe(parsed)
  if (!infNFe) {
    throw new Error('O XML não contém uma NF-e válida (tag infNFe não encontrada)')
  }

  const ide = asRecord(infNFe.ide) ?? {}
  const emit = asRecord(infNFe.emit) ?? {}
  const detNodes = toArray<LooseRecord>(infNFe.det)
  const detList = detNodes
    .map((det) => asRecord(det))
    .filter((d): d is LooseRecord => d !== null)
  if (detList.length === 0) {
    throw new Error('A NF-e não possui itens (tag det) para importar')
  }

  const items: NfeDraftItem[] = detList.map((det, i) => {
    const prod = asRecord(det.prod) ?? {}
    const qty = num(prod.qCom)
    const unitCost = num(prod.vUnCom)
    return {
      index: i + 1,
      code: str(prod.cProd),
      ean: str(prod.cEAN) === 'SEM GTIN' ? '' : str(prod.cEAN),
      name: str(prod.xProd) || `Item ${i + 1}`,
      ncm: str(prod.NCM),
      cfop: str(prod.CFOP),
      unit: normalizeNfeUnit(str(prod.uCom)),
      qty: qty > 0 ? qty : 1,
      unitCost: unitCost > 0 ? unitCost : 0,
      total: Math.round((num(prod.vProd) - num(prod.vDesc)) * 100) / 100,
    }
  })

  const icmsTot = (() => {
    const totalNode = asRecord(infNFe.total)
    if (!totalNode) return null
    return asRecord(totalNode.ICMSTot)
  })()

  const dhEmi = str(ide.dhEmi) || str(ide.dEmi) || null

  const header: NfeDraftHeader = {
    number: str(ide.nNF),
    series: str(ide.serie),
    issuedAt: dhEmi ? new Date(dhEmi).toISOString() : null,
    natOp: str(ide.natOp),
    issuerName: str(emit.xNome),
    issuerCnpj: str(emit.CNPJ) || str(emit.CPF),
    total: icmsTot ? num(icmsTot.vNF) : Math.round(items.reduce((acc, i) => acc + i.total, 0) * 100) / 100,
    discount: icmsTot ? num(icmsTot.vDesc) : 0,
  }

  return { header, items }
}

/** Validação leve antes de enviar ao backend (tipo e tamanho) */
export function isValidXmlFile(file: File): boolean {
  const nameOk = /\.(xml|xml\.zip)$/i.test(file.name) || file.type.includes('xml') || file.type === 'text/plain'
  return nameOk && file.size > 0 && file.size <= 10 * 1024 * 1024
}
