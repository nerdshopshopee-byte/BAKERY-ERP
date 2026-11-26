// BAKERY ERP - Interpretador universal de etiquetas de balança
// Cada fabricante/modelo usa um formato próprio de código de barras com peso
// ou preço embutido. Este serviço é 100% configurável via ScaleBarcodeProfile:
// prefixo, tamanho do PLU, posição do campo variável, casas decimais e DV.
//
// Formatos de referência (EAN-13, 13 dígitos):
//   Peso:   "2" + PLU(5) + peso(5, 3 dec em kg, em gramas*10) + DV  -> 2 00123 00450 7
//   Preço:  "22" + PLU(5) + preço(5, 2 dec) + DV                    -> 22 00123 00670 9
//   Toledo antigo (sem DV, 12 dígitos): "2" + PLU(6) + peso(5, 3 dec)

export interface BarcodeProfileConfig {
  symbology?: string // EAN13 | CODE128
  payloadType: 'WEIGHT' | 'PRICE'
  prefix: string // 1-3 dígitos
  pluDigits: number
  payloadDigits: number
  payloadDecimals: number
  checkDigit: boolean
}

export interface DecodedLabel {
  kind: 'SCALE_LABEL' | 'PLAIN_BARCODE' | 'UNKNOWN'
  raw: string
  profileId?: string
  profileName?: string
  plu?: string
  weight?: number // kg (quando payload WEIGHT)
  price?: number // valor total embutido (quando payload PRICE)
  checkDigitValid?: boolean
  reason?: string // motivo quando não interpretada
}

/** Dígito verificador EAN-13 (módulo 10, pesos alternados 1/3). */
export function ean13CheckDigit(digits12: string): number | null {
  if (!/^\d{12}$/.test(digits12)) return null
  let sum = 0
  for (let i = 0; i < 12; i++) {
    sum += Number(digits12[i]) * (i % 2 === 0 ? 1 : 3)
  }
  return (10 - (sum % 10)) % 10
}

/** Valida o DV de um código EAN-13 completo (13 dígitos). */
export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) return false
  const expected = ean13CheckDigit(code.slice(0, 12))
  return expected !== null && expected === Number(code[12])
}

/** Gera um código EAN-13 válido a partir dos 12 primeiros dígitos. */
export function buildEan13(digits12: string): string | null {
  const dv = ean13CheckDigit(digits12)
  if (dv === null) return null
  return digits12 + String(dv)
}

/**
 * Interpreta um código lido no leitor contra um conjunto de perfis.
 * Retorna PLU + peso/valor quando é etiqueta de balança, ou UNKNOWN/PLAIN
 * quando não casa com nenhum perfil configurado.
 */
export function decodeBarcode(raw: string, profiles: BarcodeProfileConfig[]): DecodedLabel {
  const code = (raw ?? '').trim()
  if (!code) return { kind: 'UNKNOWN', raw, reason: 'Código vazio' }

  // Prefixos mais específicos primeiro: evita que um perfil genérico ("2")
  // absorva etiquetas de um perfil mais específico ("22")
  const ordered = [...profiles].sort((a, b) => b.prefix.length - a.prefix.length)

  for (const profile of ordered) {
    const { prefix, pluDigits, payloadDigits, payloadDecimals, payloadType, checkDigit } = profile
    const expectedLen = prefix.length + pluDigits + payloadDigits + (checkDigit ? 1 : 0)

    if (profile.symbology !== 'EAN13' && profile.symbology !== 'CODE128') continue
    if (!code.startsWith(prefix)) continue
    if (code.length !== expectedLen) continue
    if (!/^\d+$/.test(code)) continue

    // DV: em EAN13 com DV, o dígito final segue módulo 10 EAN-13;
    // em CODE128 aceita-se DV módulo 10 simples calculado sobre o corpo.
    if (checkDigit) {
      const body = code.slice(0, -1)
      const dv = Number(code.slice(-1))
      let valid = false
      if (profile.symbology === 'EAN13' && body.length === 12) {
        valid = isValidEan13(code)
      } else {
        // DV módulo 10 (pesos 2/1 da direita para a esquerda) usado por vários fabricantes
        let sum = 0
        for (let i = 0; i < body.length; i++) {
          const digit = Number(body[body.length - 1 - i])
          sum += i % 2 === 0 ? digit * 2 : digit
        }
        valid = (10 - (sum % 10)) % 10 === dv
      }
      if (!valid) {
        return {
          kind: 'SCALE_LABEL',
          raw: code,
          reason: `DV inválido para o perfil ${profile.name ?? ''}`.trim(),
          checkDigitValid: false,
        }
      }
    }

    const pluStart = prefix.length
    const plu = code.slice(pluStart, pluStart + pluDigits)
    const payloadRaw = code.slice(pluStart + pluDigits, pluStart + pluDigits + payloadDigits)
    const payloadValue = Number(payloadRaw) / Math.pow(10, payloadDecimals)

    if (payloadType === 'WEIGHT') {
      if (payloadValue <= 0) {
        return { kind: 'SCALE_LABEL', raw: code, plu, reason: 'Peso zero na etiqueta' }
      }
      return {
        kind: 'SCALE_LABEL',
        raw: code,
        plu,
        weight: payloadValue, // kg
        checkDigitValid: checkDigit ? true : undefined,
      }
    }
    // PRICE: valor total embutido; peso derivado depois com o preço/kg do produto
    if (payloadValue <= 0) {
      return { kind: 'SCALE_LABEL', raw: code, plu, reason: 'Valor zero na etiqueta' }
    }
    return {
      kind: 'SCALE_LABEL',
      raw: code,
      plu,
      price: payloadValue, // R$ total
      checkDigitValid: checkDigit ? true : undefined,
    }
  }

  return { kind: 'PLAIN_BARCODE', raw: code, reason: 'Não é etiqueta de balança configurada' }
}

/** Monta uma etiqueta EAN-13 válida a partir do perfil, PLU e payload. */
export function encodeLabel(profile: BarcodeProfileConfig, plu: string, payload: number): string {
  const symbology = profile.symbology ?? 'EAN13'
  const pluPart = String(plu).padStart(profile.pluDigits, '0').slice(-profile.pluDigits)
  const scaled = Math.round(payload * Math.pow(10, profile.payloadDecimals))
  const payloadPart = String(scaled).padStart(profile.payloadDigits, '0').slice(-profile.payloadDigits)
  const body = profile.prefix + pluPart + payloadPart
  if (!profile.checkDigit) return body
  if (symbology === 'EAN13' && body.length === 12) {
    return buildEan13(body) ?? body
  }
  // DV módulo 10 pesos 2/1 (mesma regra da validação)
  let sum = 0
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[body.length - 1 - i])
    sum += i % 2 === 0 ? digit * 2 : digit
  }
  return body + String((10 - (sum % 10)) % 10)
}
