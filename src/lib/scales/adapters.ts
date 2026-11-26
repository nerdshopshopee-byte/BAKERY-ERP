// BAKERY ERP - Camada de adaptadores de balanças (Scale Drivers)
//
// O ERP NÃO fica preso a uma marca: cada integração é um adaptador com
// capacidades declaradas. A comunicação física (serial/USB/TCP) acontece na
// BAKERY SCALE BRIDGE (aplicação local autenticada); o ERP gera arquivos de
// cadastro nos layouts dos fabricantes e registra leituras de peso.
//
// STATUS DE HOMOLOGAÇÃO (honesto, sem prometer compatibilidade não testada):
//   - SIMULADOR: funcional para regras de negócio (homologado internamente)
//   - Layouts de arquivo Toledo/Filizola/Urano: EM_DESENVOLVIMENTO (layout
//     público documentado; homologação final exige equipamento físico)
//   - Balmak/Ramuza: PLANEJADO (protocolo sob validação com fabricante)

export interface AdapterProductPayload {
  plu: string
  description: string
  unitPrice: number // preço por kg/un de venda
  validadeDays?: number | null
  department?: string | null
  tareGrams?: number
  saleUnit: string
}

export interface ScaleAdapterCapabilities {
  fileExport: boolean
  directSend: boolean // via bridge
  realtimeWeight: boolean
  labelPrinting: boolean
}

export interface ExportedScaleFile {
  filename: string
  contentType: string
  content: string
}

export interface ScaleAdapter {
  id: string
  brand: string
  label: string
  homologation: 'HOMOLOGADO' | 'TESTADO' | 'EM_DESENVOLVIMENTO' | 'PLANEJADO'
  capabilities: ScaleAdapterCapabilities
  notes: string
  exportProducts?: (products: AdapterProductPayload[]) => ExportedScaleFile
}

/** Trunca e sanitiza descrição para o campo do equipamento (maiúsculas, sem acentos). */
function asciiUpper(text: string, maxLen: number): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .toUpperCase()
    .slice(0, maxLen)
}

function pad(value: string, len: number): string {
  return value.length >= len ? value.slice(0, len) : value.padEnd(len, ' ')
}

function padLeft(value: string, len: number): string {
  return value.length >= len ? value.slice(-len) : value.padStart(len, '0')
}

function priceBRL(value: number): string {
  return value.toFixed(2).replace('.', ',')
}

// ---------------------------------------------------------------------------
// TOLEDO — layout textual estilo MGV/gerenciador (linhas separadas por '|')
// Formato produto: PLU|DESCRICAO|PRECO|VALIDADE_DIAS|SETOR|TARA_G
// ---------------------------------------------------------------------------
const toledoAdapter: ScaleAdapter = {
  id: 'toledo',
  brand: 'TOLEDO',
  label: 'Toledo do Brasil (Prix / MG-V)',
  homologation: 'EM_DESENVOLVIMENTO',
  capabilities: { fileExport: true, directSend: true, realtimeWeight: true, labelPrinting: true },
  notes:
    'Importação via arquivo de produtos do gerenciador (MGV) e protocolo serial/TCP conforme modelo (Prix 3/4, Prix 4 Uno). Homologação final requer equipamento físico.',
  exportProducts: (products) => {
    const lines = products.map((p) => {
      const plu = padLeft(p.plu, 6)
      const desc = pad(asciiUpper(p.description, 22), 22)
      const price = padLeft(p.unitPrice.toFixed(2).replace('.', ''), 6) // sem separador
      const val = String(p.validadeDays ?? 0)
      const dept = pad(asciiUpper(p.department ?? 'PADARIA', 4), 4)
      const tare = padLeft(String(Math.round(p.tareGrams ?? 0)), 4)
      return `${plu}|${desc}|${price}|${val}|${dept}|${tare}`
    })
    return {
      filename: 'toledo_produtos.txt',
      contentType: 'text/plain; charset=utf-8',
      content: lines.join('\n') + '\n',
    }
  },
}

// ---------------------------------------------------------------------------
// FILIZOLA — arquivo TV% (registros de largura fixa, padrão conhecido)
// Registro: TIPO(1)=P | DEPTO(2) | PLU(5) | DESCRICAO(22) | PRECO(9,2) | VALIDADE(4)
// ---------------------------------------------------------------------------
const filizolaAdapter: ScaleAdapter = {
  id: 'filizola',
  brand: 'FILIZOLA',
  label: 'Filizola (MF/TV%)',
  homologation: 'EM_DESENVOLVIMENTO',
  capabilities: { fileExport: true, directSend: true, realtimeWeight: false, labelPrinting: true },
  notes:
    'Layout TV% de produtos para SoftPlus/gerenciadores; leitura de etiquetas com peso ou preço. Homologação final requer equipamento físico.',
  exportProducts: (products) => {
    const lines = products.map((p, index) => {
      const dept = padLeft(String(index + 1), 2)
      const plu = padLeft(p.plu, 5)
      const desc = pad(asciiUpper(p.description, 22), 22)
      const price = padLeft(p.unitPrice.toFixed(2).replace('.', ''), 9)
      const val = padLeft(String(p.validadeDays ?? 0), 4)
      return `P${dept}${plu}${desc}${price}${val}`
    })
    return {
      filename: 'filizola_tvprod.txt',
      contentType: 'text/plain; charset=utf-8',
      content: lines.join('\n') + '\n',
    }
  },
}

// ---------------------------------------------------------------------------
// URANO — arquivo texto CSV-estilo documentado pela Urano
// Formato: PLU;DESCRICAO;PRECO;VALIDADE;SETOR
// ---------------------------------------------------------------------------
const uranoAdapter: ScaleAdapter = {
  id: 'urano',
  brand: 'URANO',
  label: 'Urano (B35 / B40 / Lite)',
  homologation: 'EM_DESENVOLVIMENTO',
  capabilities: { fileExport: true, directSend: true, realtimeWeight: false, labelPrinting: true },
  notes:
    'Exportação CSV de produtos e integração via software Urano Conecta; etiquetas com peso/preço/validade conforme modelo. Homologação final requer equipamento físico.',
  exportProducts: (products) => {
    const lines = products.map((p) => {
      const plu = padLeft(p.plu, 5)
      const desc = asciiUpper(p.description, 24)
      const val = String(p.validadeDays ?? 0)
      const dept = asciiUpper(p.department ?? 'PADARIA', 10)
      return `${plu};${desc};${priceBRL(p.unitPrice)};${val};${dept}`
    })
    return {
      filename: 'urano_produtos.csv',
      contentType: 'text/csv; charset=utf-8',
      content: lines.join('\n') + '\n',
    }
  },
}

// ---------------------------------------------------------------------------
// BALMAK / RAMUZA — exportação genérica CSV enquanto o protocolo é validado
// ---------------------------------------------------------------------------
function genericCsvAdapter(id: string, brand: string, label: string, notes: string): ScaleAdapter {
  return {
    id,
    brand,
    label,
    homologation: 'PLANEJADO',
    capabilities: { fileExport: true, directSend: false, realtimeWeight: false, labelPrinting: true },
    notes,
    exportProducts: (products) => {
      const lines = products.map((p) => {
        const plu = padLeft(p.plu, 5)
        const desc = asciiUpper(p.description, 24)
        return `${plu};${desc};${priceBRL(p.unitPrice)};${p.validadeDays ?? 0};${p.saleUnit}`
      })
      return {
        filename: `${id}_produtos.csv`,
        contentType: 'text/csv; charset=utf-8',
        content: lines.join('\n') + '\n',
      }
    },
  }
}

const balmakAdapter = genericCsvAdapter(
  'balmak',
  'BALMAK',
  'Balmak (Órion / Net Line)',
  'Protocolo e cadastro sob validação com o fabricante; enquanto isso, exportação CSV genérica.'
)
const ramuzaAdapter = genericCsvAdapter(
  'ramuza',
  'RAMUZA',
  'Ramuza (Touch / DCL)',
  'Adaptador de comunicação em homologação; exportação CSV genérica disponível.'
)

// ---------------------------------------------------------------------------
// SIMULADOR — driver completo para desenvolvimento e testes de regras de
// negócio SEM equipamento físico (etiquetas geradas + leitura estável).
// ---------------------------------------------------------------------------
const simulatorAdapter: ScaleAdapter = {
  id: 'simulator',
  brand: 'SIMULADOR',
  label: 'Simulador BAKERY SCALE (dev/testes)',
  homologation: 'HOMOLOGADO',
  capabilities: { fileExport: true, directSend: true, realtimeWeight: true, labelPrinting: true },
  notes:
    'Gera etiquetas EAN-13 nos perfis configurados, simula leitura de peso estável e registra readings. Nunca use em produção com equipamento real.',
  exportProducts: (products) => {
    const lines = products.map((p) => {
      const plu = padLeft(p.plu, 5)
      const desc = asciiUpper(p.description, 24)
      return `${plu};${desc};${priceBRL(p.unitPrice)};${p.validadeDays ?? 0}`
    })
    return {
      filename: 'simulador_produtos.csv',
      contentType: 'text/csv; charset=utf-8',
      content: lines.join('\n') + '\n',
    }
  },
}

// ---------------------------------------------------------------------------
// Registro público de adaptadores
// ---------------------------------------------------------------------------
const ADAPTERS: Record<string, ScaleAdapter> = {
  TOLEDO: toledoAdapter,
  FILIZOLA: filizolaAdapter,
  URANO: uranoAdapter,
  BALMAK: balmakAdapter,
  RAMUZA: ramuzaAdapter,
  SIMULADOR: simulatorAdapter,
  GENERIC: genericCsvAdapter(
    'generic',
    'GENERIC',
    'Genérica (CSV neutro)',
    'Adaptador neutro para equipamentos não listados; layout CSV simples.'
  ),
}

export function getAdapter(brand: string): ScaleAdapter {
  return ADAPTERS[brand?.toUpperCase()] ?? ADAPTERS.GENERIC!
}

export function listAdapters(): ScaleAdapter[] {
  return Object.values(ADAPTERS)
}
