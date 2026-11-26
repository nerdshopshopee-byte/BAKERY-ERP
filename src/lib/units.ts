// BAKERY ERP - Unidades de medida e arredondamento monetário
// Conversões para a base SI de cada grandeza (massa: KG; volume: L; contagem: UN)

export type Unit = 'UN' | 'KG' | 'G' | 'L' | 'ML'

export const MASS_UNITS: Unit[] = ['KG', 'G']
export const VOLUME_UNITS: Unit[] = ['L', 'ML']

/** Fator para converter a unidade para a base (KG para massa, L para volume, UN para contagem). */
export function toBaseFactor(unit: string): number {
  switch (unit) {
    case 'G':
      return 0.001
    case 'KG':
      return 1
    case 'ML':
      return 0.001
    case 'L':
      return 1
    case 'UN':
      return 1
    default:
      return 1
  }
}

/** Grandeza da unidade: massa, volume ou contagem. */
export function unitKind(unit: string): 'MASS' | 'VOLUME' | 'COUNT' {
  if (MASS_UNITS.includes(unit.toUpperCase() as Unit)) return 'MASS'
  if (VOLUME_UNITS.includes(unit.toUpperCase() as Unit)) return 'VOLUME'
  return 'COUNT'
}

/** Converte um valor entre unidades compatíveis (massa<->massa, volume<->volume).
 *  Retorna null quando as unidades são incompatíveis. */
export function convertUnit(value: number, from: string, to: string): number | null {
  const f = unitKind(from)
  const t = unitKind(to)
  if (f !== t) return null
  if (f === 'COUNT') return value // UN é a base de contagem
  return value * (toBaseFactor(from) / toBaseFactor(to))
}

/** Converte a quantidade para a unidade de exibição do produto pesável:
 *  KG (com 3 casas) ou UN/L diretos; G e ML exibidos convertidos para a base. */
export function displayQty(qty: number, unit: string): string {
  switch (unit) {
    case 'G': {
      const kg = convertUnit(qty, 'G', 'KG') ?? qty
      return `${kg.toFixed(3).replace('.', ',')} kg`
    }
    case 'ML': {
      const l = convertUnit(qty, 'ML', 'L') ?? qty
      return `${l.toFixed(3).replace('.', ',')} L`
    }
    case 'KG':
      return `${qty.toFixed(3).replace('.', ',')} kg`
    case 'L':
      return `${qty.toFixed(3).replace('.', ',')} L`
    default:
      return `${Number.isInteger(qty) ? qty : qty.toFixed(2).replace('.', ',')} un`
  }
}

/** Multiplicação monetária segura: quantidade x preço unitário com
 *  arredondamento comercial (half-up) para 2 casas decimais.
 *  Evita artefatos de ponto flutuante (ex.: 0.450 * 14.90 = 6.704999999). */
export function moneyMul(qty: number, unitPrice: number): number {
  const cents = Math.round(qty * unitPrice * 100 + Number.EPSILON)
  return Math.round(cents) / 100
}

/** Arredonda para 2 casas (padrão comercial do ERP). */
export function round2(value: number): number {
  return Math.round(value * 100 + Number.EPSILON) / 100
}

/** Arredonda para 3 casas (pesos em kg). */
export function round3(value: number): number {
  return Math.round(value * 1000 + Number.EPSILON) / 1000
}

/** Formata moeda BRL. */
export function brl(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
