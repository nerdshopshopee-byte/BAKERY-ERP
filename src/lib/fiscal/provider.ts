// BAKERY ERP - Interface de provedores fiscais (plugável).
// O ERP não fica acoplado a um único fornecedor de comunicação com SEFAZ:
// qualquer provedor implementa a mesma interface e é selecionável na configuração.

import { buildXml, generateAccessKey, isValidCnpj, isValidCpf, onlyDigits, type XmlDocInput } from './engine'

export type TransmitInput = {
  doc: XmlDocInput
  accessKey: string
}

export type ProviderResult = {
  authorized: boolean
  protocol?: string
  rejectCode?: string
  rejectMessage?: string
  receivedAt: Date
}

export interface FiscalProvider {
  readonly id: string
  readonly label: string
  transmit(input: TransmitInput): Promise<ProviderResult>
  cancel(input: { accessKey: string; protocol: string; reason: string; xml: string }): Promise<ProviderResult>
  inquire(input: { accessKey: string }): Promise<{ found: boolean; status?: string; protocol?: string }>
}

/**
 * Provedor LOCAL_SIMULADO: valida estrutura do XML e emula o retorno de
 * homologação da SEFAZ. Determinístico: autoriza documentos válidos e
 * rejeita com códigos reais quando a estrutura está inconsistente.
 */
class LocalSimuladoProvider implements FiscalProvider {
  readonly id = 'LOCAL_SIMULADO'
  readonly label = 'Simulado local (homologação)'

  private validate(doc: XmlDocInput): { ok: true } | { ok: false; code: string; message: string } {
    if (!isValidCnpj(doc.issuerCnpj)) {
      return { ok: false, code: '203', message: 'Rejeição: Emissor com CNPJ inválido' }
    }
    if (doc.type === 'NFE' && !doc.customerDoc) {
      return { ok: false, code: '817', message: 'Rejeição: Destinatário obrigatório em NF-e' }
    }
    if (doc.type === 'NFE' && doc.customerDoc && onlyDigits(doc.customerDoc).length === 11 && !isValidCpf(doc.customerDoc)) {
      return { ok: false, code: '611', message: 'Rejeição: CPF do destinatário inválido' }
    }
    if (doc.type === 'NFE' && doc.customerDoc && onlyDigits(doc.customerDoc).length === 14 && !isValidCnpj(doc.customerDoc)) {
      return { ok: false, code: '601', message: 'Rejeição: CNPJ do destinatário inválido' }
    }
    if (!doc.items || doc.items.length === 0) {
      return { ok: false, code: '225', message: 'Rejeição: Falha no schema XML - inexistente elemento det' }
    }
    if (!doc.payments || doc.payments.length === 0) {
      return { ok: false, code: '840', message: 'Rejeição: Grupo detPag inexistente ou ausente' }
    }
    return { ok: true }
  }

  async transmit({ doc }: TransmitInput): Promise<ProviderResult> {
    // Validação de estrutura: XML é reconstruído; exceção significa schema inválido
    try {
      buildXml(doc)
    } catch (error) {
      return {
        authorized: false,
        rejectCode: '225',
        rejectMessage: `Rejeição: Falha no schema XML do lote (${error instanceof Error ? error.message : 'desconhecida'})`,
        receivedAt: new Date(),
      }
    }
    const check = this.validate(doc)
    await delay(60)
    if (!check.ok) {
      return { authorized: false, rejectCode: check.code, rejectMessage: check.message, receivedAt: new Date() }
    }
    // CNPJ de teste em ambiente de produção é rejeitado pela SEFAZ
    if (doc.environment === 'PRODUCAO' && onlyDigits(doc.issuerCnpj).endsWith('000190')) {
      return {
        authorized: false,
        rejectCode: '587',
        rejectMessage: 'Rejeição: Usuário sem credenciamento para emissão de NFC-e (CNPJ de teste em produção)',
        receivedAt: new Date(),
      }
    }
    return {
      authorized: true,
      protocol: `135${Date.now().toString().slice(-12)}`,
      receivedAt: new Date(),
    }
  }

  async cancel(): Promise<ProviderResult> {
    await delay(40)
    return { authorized: true, protocol: `135${Date.now().toString().slice(-12)}`, receivedAt: new Date() }
  }

  async inquire({ accessKey }: { accessKey: string }): Promise<{ found: boolean; status?: string; protocol?: string }> {
    await delay(30)
    return { found: accessKey.length === 44, status: 'AUTORIZADA' }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const PROVIDERS: Record<string, FiscalProvider> = {
  LOCAL_SIMULADO: new LocalSimuladoProvider(),
}

export function getProvider(id: string | null | undefined): FiscalProvider {
  return PROVIDERS[id ?? 'LOCAL_SIMULADO'] ?? PROVIDERS.LOCAL_SIMULADO
}

export function listProviders(): { id: string; label: string }[] {
  return Object.values(PROVIDERS).map((provider) => ({ id: provider.id, label: provider.label }))
}

/** Gera a chave de acesso com base no documento (helper de conveniência). */
export function keyFor(input: Parameters<typeof generateAccessKey>[0]): string {
  return generateAccessKey(input)
}
