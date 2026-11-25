// BAKERY ERP - Helpers de formatação (pt-BR)

export function brl(v: number | undefined | null): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0)
}

export function num(v: number | undefined | null, decimals = 0): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(v ?? 0)
}

export function pct(v: number | undefined | null, decimals = 1): string {
  return `${num(v ?? 0, decimals)}%`
}

export function dt(iso: string | Date | undefined | null): string {
  if (!iso) return '-'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function hr(iso: string | Date | undefined | null): string {
  if (!iso) return '-'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function dthr(iso: string | Date | undefined | null): string {
  if (!iso) return '-'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return `${dt(d)} ${hr(d)}`
}

export function elapsedSince(iso: string | Date | undefined | null): string {
  if (!iso) return '-'
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const mins = Math.max(0, Math.floor((Date.now() - d.getTime()) / 60000))
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  return `${h}h ${mins % 60}min`
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  DINHEIRO: 'Dinheiro',
  PIX: 'PIX',
  DEBITO: 'Cartão Débito',
  CREDITO: 'Cartão Crédito',
  VALE: 'Vale/Convênio',
  FIADO: 'Fiado',
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  AGUARDANDO: 'Aguardando',
  PREPARANDO: 'Preparando',
  PRONTO: 'Pronto',
  ENTREGUE: 'Entregue',
  CANCELADO: 'Cancelado',
}

export const ORDER_SOURCE_LABELS: Record<string, string> = {
  PDV: 'Balcão',
  ENCOMENDA: 'Encomenda',
  DELIVERY: 'Delivery',
  WHATSAPP: 'WhatsApp',
}

export const ROLE_LABELS: Record<string, string> = {
  PROPRIETARIO: 'Proprietário',
  GERENTE: 'Gerente',
  CAIXA: 'Caixa',
  PADEIRO: 'Padeiro',
  ATENDENTE: 'Atendente',
  FINANCEIRO: 'Financeiro',
  ESTOQUISTA: 'Estoquista',
}
