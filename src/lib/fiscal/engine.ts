// BAKERY ERP - Fiscal Engine: geração da chave de acesso, cálculo de tributos
// e construção do XML de autorização (NFC-e modelo 65 / NF-e modelo 55).
// Sem dependência externa: cálculo determinístico e auditável.

// ============ Chave de acesso (44 dígitos) ============

const UF_CODIGO: Record<string, string> = {
  AC: '12', AL: '27', AP: '16', AM: '13', BA: '29', CE: '23', DF: '53',
  ES: '32', GO: '52', MA: '21', MT: '51', MS: '50', MG: '31', PA: '15',
  PB: '25', PR: '41', PE: '26', PI: '22', RJ: '33', RN: '24', RS: '43',
  RO: '11', RR: '14', SC: '42', SP: '35', SE: '28', TO: '17',
}

/** Módulo 11 (pesos 2..9 ciclando da direita para a esquerda) - dígito verificador NFe */
export function mod11(base: string): number {
  let weight = 2
  let sum = 0
  for (let i = base.length - 1; i >= 0; i--) {
    sum += Number(base[i]) * weight
    weight = weight === 9 ? 2 : weight + 1
  }
  const rest = sum % 11
  const dv = 11 - rest
  return dv === 0 || dv === 1 || dv === 10 || dv === 11 ? 0 : dv
}

export type AccessKeyInput = {
  uf: string
  cnpj: string
  type: 'NFCE' | 'NFE'
  serie: number
  number: number
  contingency: boolean
  date?: Date
}

/**
 * Chave de acesso de 44 dígitos:
 * cUF(2) AAMM(4) CNPJ(14) mod(2) série(3) nNF(9) tpEmis(1) cNF(8) cDV(1)
 * tpEmis: 1 = emissão normal, 9 = contingência off-line NFC-e
 */
export function generateAccessKey(input: AccessKeyInput): string {
  const uf = UF_CODIGO[input.uf.toUpperCase()] ?? '35'
  const d = input.date ?? new Date()
  const aamm = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}`
  const cnpj = onlyDigits(input.cnpj).padStart(14, '0')
  const mod = input.type === 'NFCE' ? '65' : '55'
  const serie = String(input.serie).padStart(3, '0')
  const nNF = String(input.number).padStart(9, '0')
  const tpEmis = input.contingency ? '9' : '1'
  // cNF: hash determinístico (número + série + modelo) para não duplicar
  const seed = `${nNF}${serie}${mod}`
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 100000000
  const cNF = String(h).padStart(8, '0')
  const base43 = `${uf}${aamm}${cnpj}${mod}${serie}${nNF}${tpEmis}${cNF}`
  const dv = mod11(base43)
  return `${base43}${dv}`
}

export function formatAccessKey(key: string): string {
  return key.replace(/(.{4})(?=.)/g, '$1 ')
}

// ============ Validadores ============

export function onlyDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '')
}

export function isValidCnpj(value: string | null | undefined): boolean {
  const cnpj = onlyDigits(value)
  if (cnpj.length !== 14) return false
  if (/^(\d)\1+$/.test(cnpj)) return false
  const calc = (len: number): number => {
    let weight = len - 7
    let sum = 0
    for (let i = 0; i < len; i++) {
      sum += Number(cnpj[i]) * weight
      weight = weight - 1 < 2 ? 9 : weight - 1
    }
    const rest = sum % 11
    return rest < 2 ? 0 : 11 - rest
  }
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13])
}

export function isValidCpf(value: string | null | undefined): boolean {
  const cpf = onlyDigits(value)
  if (cpf.length !== 11) return false
  if (/^(\d)\1+$/.test(cpf)) return false
  const calc = (len: number): number => {
    let sum = 0
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i)
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10])
}

// ============ Tributos (tabela versionada IBS/CBS) ============

export type TaxRow = {
  ncm: string
  cfop: string
  csosn: string
  cst?: string | null
  icmsRate: number
  pisRate: number
  cofinsRate: number
  ibsRate: number
  cbsRate: number
  reducedIbs: boolean
}

export type TaxItemInput = { name: string; qty: number; unitPrice: number; subtotal: number; ncm?: string | null }

export type TaxTotals = {
  productsTotal: number
  icmsTotal: number
  ibsTotal: number
  cbsTotal: number
  perItem: { name: string; ncm: string; cfop: string; csosn: string; icms: number; ibs: number; cbs: number; subtotal: number }[]
}

const DEFAULT_NCM = '19059090' // produtos de panificação (pães, biscoitos)

/** Calcula tributos por item com base na tabela tributária versionada ativa. */
export function calcTaxes(items: TaxItemInput[], rows: TaxRow[], discount: number): TaxTotals {
  const gross = round2(items.reduce((acc, item) => acc + item.subtotal, 0))
  const factor = gross > 0 ? round2((gross - discount) / gross) : 0
  const perItem: TaxTotals['perItem'] = []
  let icmsTotal = 0
  let ibsTotal = 0
  let cbsTotal = 0

  for (const item of items) {
    const ncm = onlyDigits(item.ncm).length === 8 ? onlyDigits(item.ncm) : DEFAULT_NCM
    const row =
      rows.find((r) => r.ncm === ncm) ??
      rows[0] ?? {
        ncm: DEFAULT_NCM,
        cfop: '5102',
        csosn: '102',
        cst: null,
        icmsRate: 0,
        pisRate: 0,
        cofinsRate: 0,
        ibsRate: 0,
        cbsRate: 0,
        reducedIbs: false,
      }
    const base = round2(item.subtotal * factor)
    const icms = round2((base * row.icmsRate) / 100)
    // Redutor da cesta básica nacional (50%) quando reducedIbs
    const ibsBase = row.reducedIbs ? round2(base * 0.5) : base
    const ibs = round2((ibsBase * row.ibsRate) / 100)
    const cbs = round2((ibsBase * row.cbsRate) / 100)
    icmsTotal += icms
    ibsTotal += ibs
    cbsTotal += cbs
    perItem.push({
      name: item.name,
      ncm,
      cfop: row.cfop,
      csosn: row.csosn,
      icms,
      ibs,
      cbs,
      subtotal: base,
    })
  }
  return {
    productsTotal: gross,
    icmsTotal: round2(icmsTotal),
    ibsTotal: round2(ibsTotal),
    cbsTotal: round2(cbsTotal),
    perItem,
  }
}

// ============ XML de autorização ============

export type XmlDocInput = {
  type: 'NFCE' | 'NFE'
  accessKey: string
  serie: number
  number: number
  environment: 'HOMOLOGACAO' | 'PRODUCAO'
  contingency: boolean
  date: Date
  issuerName: string
  issuerCnpj: string
  issuerIe: string | null
  uf: string
  crt: string
  customerName: string | null
  customerDoc: string | null
  customerAddress: string | null
  items: { name: string; qty: number; unit: string; unitPrice: number; subtotal: number; ncm?: string | null }[]
  payments: { method: string; amount: number }[]
  discount: number
  taxes: TaxTotals
}

function esc(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function money(value: number): string {
  return value.toFixed(2)
}

/** Código do meio de pagamento no leiaute SEFAZ */
export function paymentCode(method: string): string {
  switch (method.toUpperCase()) {
    case 'DINHEIRO': return '01'
    case 'CHEQUE': return '02'
    case 'CREDITO': return '03'
    case 'DEBITO': return '04'
    case 'PIX': return '16'
    case 'VALE': return '15'
    default: return '99'
  }
}

export function paymentLabel(method: string): string {
  switch (method.toUpperCase()) {
    case 'DINHEIRO': return 'Dinheiro'
    case 'PIX': return 'PIX'
    case 'CREDITO': return 'Cartão de crédito'
    case 'DEBITO': return 'Cartão de débito'
    case 'VALE': return 'Vale/Convênio'
    case 'FIADO': return 'Fiado'
    default: return 'Outros'
  }
}

/** Constrói o XML de autorização (leiaute simplificado, estrutura fiel à NFe 4.00). */
export function buildXml(input: XmlDocInput): string {
  const mod = input.type === 'NFCE' ? '65' : '55'
  const tpEmis = input.contingency ? '9' : '1'
  const tpAmb = input.environment === 'PRODUCAO' ? '1' : '2'
  const lines: string[] = []
  lines.push('<?xml version="1.0" encoding="UTF-8"?>')
  lines.push('<NFe xmlns="http://www.portalfiscal.inf.br/nfe">')
  lines.push(`  <infNFe Id="NFe${input.accessKey}" versao="4.00">`)
  lines.push('    <ide>')
  lines.push(`      <cUF>${UF_CODIGO[input.uf.toUpperCase()] ?? '35'}</cUF>`)
  lines.push(`      <cNF>${input.accessKey.slice(35, 43)}</cNF>`)
  lines.push('      <natOp>Venda de mercadoria</natOp>')
  lines.push(`      <mod>${mod}</mod>`)
  lines.push(`      <serie>${input.serie}</serie>`)
  lines.push(`      <nNF>${input.number}</nNF>`)
  lines.push(`      <dhEmi>${input.date.toISOString()}</dhEmi>`)
  lines.push('      <tpNF>1</tpNF>')
  lines.push('      <idDest>1</idDest>')
  lines.push(`      <tpImp>${input.type === 'NFCE' ? 4 : 1}</tpImp>`)
  lines.push(`      <tpEmis>${tpEmis}</tpEmis>`)
  lines.push(`      <cDV>${input.accessKey.slice(-1)}</cDV>`)
  lines.push(`      <tpAmb>${tpAmb}</tpAmb>`)
  lines.push('      <finNFe>1</finNFe>')
  lines.push(`      <indFinal>${input.type === 'NFCE' ? 1 : 0}</indFinal>`)
  lines.push(`      <indPres>${input.type === 'NFCE' ? 5 : 1}</indPres>`)
  lines.push('      <procEmi>0</procEmi>')
  lines.push('      <verProc>BAKERY-ERP 4.00</verProc>')
  lines.push('    </ide>')
  lines.push('    <emit>')
  lines.push(`      <CNPJ>${esc(input.issuerCnpj)}</CNPJ>`)
  lines.push(`      <xNome>${esc(input.issuerName)}</xNome>`)
  lines.push(`      <enderEmit><UF>${esc(input.uf)}</UF></enderEmit>`)
  lines.push(`      <IE>${esc(input.issuerIe ?? 'ISENTO')}</IE>`)
  lines.push(`      <CRT>${input.crt === 'SIMPLES_NACIONAL' ? 1 : 3}</CRT>`)
  lines.push('    </emit>')
  if (input.type === 'NFE') {
    lines.push('    <dest>')
    lines.push(`      <CNPJ>${esc(input.customerDoc ?? '')}</CNPJ>`)
    lines.push(`      <xNome>${esc(input.customerName ?? '')}</xNome>`)
    lines.push(`      <enderDest><xLgr>${esc(input.customerAddress ?? '')}</xLgr><UF>${esc(input.uf)}</UF></enderDest>`)
    lines.push('      <indIEDest>9</indIEDest>')
    lines.push('    </dest>')
  }
  input.taxes.perItem.forEach((item, index) => {
    const n = index + 1
    lines.push(`    <det nItem="${n}">`)
    lines.push('      <prod>')
    lines.push(`        <cProd>${String(n).padStart(6, '0')}</cProd>`)
    lines.push(`        <xProd>${esc(item.name)}</xProd>`)
    lines.push(`        <NCM>${item.ncm}</NCM>`)
    lines.push(`        <CFOP>${item.cfop}</CFOP>`)
    lines.push('        <uCom>UN</uCom>')
    lines.push('      </prod>')
    lines.push('      <imposto>')
    lines.push(`        <ICMS><ICMSSN102><orig>0</orig><CSOSN>${item.csosn}</CSOSN></ICMSSN102></ICMS>`)
    lines.push(`        <IBSCBS><IBS vBC="${money(item.subtotal)}" vIBS="${money(item.ibs)}"/><CBS vBC="${money(item.subtotal)}" vCBS="${money(item.cbs)}"/></IBSCBS>`)
    lines.push('      </imposto>')
    lines.push('    </det>')
  })
  lines.push('    <total>')
  lines.push('      <ICMSTot>')
  lines.push(`        <vBC>${money(input.taxes.productsTotal)}</vBC>`)
  lines.push(`        <vICMS>${money(input.taxes.icmsTotal)}</vICMS>`)
  lines.push(`        <vProd>${money(input.taxes.productsTotal)}</vProd>`)
  lines.push(`        <vDesc>${money(input.discount)}</vDesc>`)
  lines.push(`        <vIBS>${money(input.taxes.ibsTotal)}</vIBS>`)
  lines.push(`        <vCBS>${money(input.taxes.cbsTotal)}</vCBS>`)
  lines.push(`        <vNF>${money(input.taxes.productsTotal - input.discount)}</vNF>`)
  lines.push('      </ICMSTot>')
  lines.push('    </total>')
  lines.push('    <pag>')
  input.payments.forEach((payment) => {
    lines.push(`      <detPag><tPag>${paymentCode(payment.method)}</tPag><vPag>${money(payment.amount)}</vPag></detPag>`)
  })
  lines.push('    </pag>')
  lines.push('    <infAdic>')
  lines.push(`      <infCpl>Emitido por BAKERY-ERP - Motor Fiscal (${input.environment.toLowerCase()}${input.contingency ? ' / contingência' : ''})</infCpl>`)
  lines.push('    </infAdic>')
  lines.push('  </infNFe>')
  lines.push('</NFe>')
  return lines.join('\n')
}

// ============ DANFE (metadados para impressão 80mm / A4) ============

export type DanfeMeta = {
  widthMm: number
  type: 'NFCE' | 'NFE'
  chave: string
  serie: number
  numero: number
  emitente: string
  cnpj: string
  itens: { name: string; qty: number; unitPrice: number; subtotal: number }[]
  pagamentos: { label: string; amount: number }[]
  tributos: { icms: number; ibs: number; cbs: number }
  total: number
  desconto: number
  ambiente: 'HOMOLOGACAO' | 'PRODUCAO'
  contingencia: boolean
  emitidoEm: string
  consulta: string
}

export function buildDanfeMeta(input: {
  type: 'NFCE' | 'NFE'
  accessKey: string
  serie: number
  number: number
  issuerName: string
  issuerCnpj: string
  items: { name: string; qty: number; unitPrice: number; subtotal: number }[]
  payments: { method: string; amount: number }[]
  taxes: TaxTotals
  discount: number
  environment: 'HOMOLOGACAO' | 'PRODUCAO'
  contingency: boolean
  date: Date
}): DanfeMeta {
  return {
    widthMm: input.type === 'NFCE' ? 80 : 210,
    type: input.type,
    chave: input.accessKey,
    serie: input.serie,
    numero: input.number,
    emitente: input.issuerName,
    cnpj: input.issuerCnpj,
    itens: input.items,
    pagamentos: input.payments.map((payment) => ({ label: paymentLabel(payment.method), amount: payment.amount })),
    tributos: {
      icms: input.taxes.icmsTotal,
      ibs: input.taxes.ibsTotal,
      cbs: input.taxes.cbsTotal,
    },
    total: round2(input.taxes.productsTotal - input.discount),
    desconto: input.discount,
    ambiente: input.environment,
    contingencia: input.contingency,
    emitidoEm: input.date.toISOString(),
    consulta:
      input.environment === 'PRODUCAO'
        ? 'Consulte pela chave de acesso em https://www.nfe.fazenda.gov.br/portal/consulta'
        : 'Documento emitido em ambiente de homologação - sem valor fiscal',
  }
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100
}
