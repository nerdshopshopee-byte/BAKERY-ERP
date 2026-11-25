// BAKERY ERP - Tipos compartilhados entre frontend e backend
// Espelham o schema Prisma (models planos, ids string)

export type CategoryDTO = {
  id: string
  name: string
  imageUrl?: string | null
  emoji?: string | null
  sortOrder: number
}

export type ProductDTO = {
  id: string
  name: string
  categoryId?: string | null
  unit: string
  price: number
  cost: number
  barcode?: string | null
  byWeight: boolean
  isKitchen: boolean
  active: boolean
  notes?: string | null
  categoryName?: string | null
  categoryEmoji?: string | null
  categoryImageUrl?: string | null
}

export type IngredientDTO = {
  id: string
  name: string
  unit: string
  costPerUnit: number
  stock: number
  minStock: number
  supplierId?: string | null
  supplierName?: string | null
}

export type StockMovementDTO = {
  id: string
  itemType: string // INGREDIENT | PRODUCT
  ingredientId?: string | null
  productId?: string | null
  itemName?: string | null
  type: string // ENTRADA | SAIDA | AJUSTE | PERDA | PRODUCAO | VENDA
  qty: number
  unitCost?: number | null
  reason?: string | null
  refId?: string | null
  createdAt: string
}

export type RecipeItemDTO = {
  id: string
  recipeId: string
  ingredientId: string
  qty: number
  ingredientName?: string | null
  unit?: string | null
  costPerUnit?: number | null
}

export type RecipeDTO = {
  id: string
  name: string
  productId?: string | null
  yieldQty: number
  unit: string
  laborCost: number
  notes?: string | null
  items: RecipeItemDTO[]
  totalCost: number // custo dos ingredientes do lote + mão de obra
  costPerUnit: number
}

export type ProductionOrderDTO = {
  id: string
  code: string
  recipeId: string
  recipeName: string
  plannedQty: number
  producedQty?: number | null
  status: 'PLANEJADA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA'
  operator?: string | null
  notes?: string | null
  startedAt?: string | null
  finishedAt?: string | null
  createdAt: string
}

export type SupplierDTO = {
  id: string
  name: string
  contact?: string | null
  phone?: string | null
  email?: string | null
  items?: string | null
  active: boolean
}

export type PurchaseItemDTO = {
  id: string
  purchaseId: string
  ingredientId: string
  name: string
  unit: string
  qty: number
  unitCost: number
}

export type PurchaseDTO = {
  id: string
  code: string
  supplierId: string
  supplier: string
  status: 'PENDENTE' | 'RECEBIDA' | 'CANCELADA'
  total: number
  notes?: string | null
  receivedAt?: string | null
  createdAt: string
  items: PurchaseItemDTO[]
}

export type CustomerDTO = {
  id: string
  name: string
  phone?: string | null
  address?: string | null
  birthday?: string | null
  points: number
  creditBalance: number
  notes?: string | null
}

export type EmployeeDTO = {
  id: string
  name: string
  role: string
  salary: number
  phone?: string | null
  hiredAt: string
  active: boolean
}

export type TimeLogDTO = {
  id: string
  employeeId: string
  checkIn: string
  checkOut?: string | null
}

export type CashSessionDTO = {
  id: string
  operatorName: string
  openingBalance: number
  closingBalance?: number | null
  expectedBalance?: number | null
  status: 'ABERTO' | 'FECHADO'
  openedAt: string
  closedAt?: string | null
}

export type CashMovementDTO = {
  id: string
  sessionId: string
  type: string // VENDA | SANGRIA | SUPRIMENTO | AJUSTE
  method?: string | null
  amount: number
  description?: string | null
  refId?: string | null
  createdAt: string
}

export type SaleItemDTO = {
  id: string
  saleId: string
  productId: string
  name: string
  qty: number
  unitPrice: number
  unit: string
  subtotal: number
}

export type SalePaymentDTO = {
  id: string
  saleId: string
  method: string
  amount: number
}

export type SaleDTO = {
  id: string
  code: string
  customerId?: string | null
  customer?: string | null
  sessionId?: string | null
  total: number
  discount: number
  status: 'CONCLUIDA' | 'CANCELADA'
  channel: string
  operator?: string | null
  createdAt: string
  items: SaleItemDTO[]
  payments: SalePaymentDTO[]
}

export type OrderItemDTO = {
  id: string
  orderId: string
  productId?: string | null
  name: string
  qty: number
  notes?: string | null
}

export type OrderDTO = {
  id: string
  code: string
  customerName?: string | null
  phone?: string | null
  source: string // PDV | ENCOMENDA | DELIVERY | WHATSAPP
  status: 'AGUARDANDO' | 'PREPARANDO' | 'PRONTO' | 'ENTREGUE' | 'CANCELADO'
  notes?: string | null
  expectedAt?: string | null
  saleId?: string | null
  startedAt?: string | null
  readyAt?: string | null
  deliveredAt?: string | null
  createdAt: string
  items: OrderItemDTO[]
}

export type PayableDTO = {
  id: string
  description: string
  supplierId?: string | null
  supplier?: string | null
  category?: string | null
  amount: number
  dueDate: string
  status: 'PENDENTE' | 'PAGO'
  paidAt?: string | null
  createdAt: string
}

export type ReceivableDTO = {
  id: string
  description: string
  customerId?: string | null
  customer?: string | null
  saleId?: string | null
  amount: number
  dueDate: string
  status: 'PENDENTE' | 'RECEBIDO'
  paidAt?: string | null
  createdAt: string
}

export type TransactionDTO = {
  id: string
  type: 'RECEITA' | 'DESPESA'
  category?: string | null
  description: string
  amount: number
  method?: string | null
  refId?: string | null
  date: string
  createdAt: string
}

export type PaymentDTO = {
  id: string
  provider: string
  externalId?: string | null
  method: string // PIX | CREDITO | DEBITO
  amount: number
  fee: number
  netAmount: number
  status: 'PENDENTE' | 'PAGO' | 'CANCELADO'
  pixCode?: string | null
  qrImageUrl?: string | null
  description?: string | null
  saleId?: string | null
  orderId?: string | null
  customerId?: string | null
  createdAt: string
  paidAt?: string | null
}

export type AlertDTO = {
  id: string
  level: string
  title: string
  message: string
  read: boolean
  createdAt: string
}

// ============ DASHBOARD ============

export type DashboardDTO = {
  revenueToday: number
  revenueWeek: number
  revenueMonth: number
  salesCountToday: number
  avgTicketToday: number
  profitToday: number
  marginToday: number
  revenueHistory: { date: string; label: string; total: number }[]
  categorySales: { name: string; emoji?: string | null; total: number }[]
  topProducts: { name: string; qty: number; total: number }[]
  cashBalance: number
  payablesPending: number
  payablesOverdue: number
  receivablesPending: number
  ordersOpen: number
  productionPending: number
  lowStockIngredients: { name: string; stock: number; minStock: number; unit: string }[]
  alerts: AlertDTO[]
  paymentMethods: { method: string; total: number }[]
}

// ============ DELIVERY ============

export type DelivererDTO = {
  id: string
  name: string
  phone?: string | null
  vehicle?: string | null
  active: boolean
}

export type DeliveryZoneDTO = {
  id: string
  name: string
  fee: number
  active: boolean
}

export type DeliveryDTO = {
  id: string
  code: string
  orderId?: string | null
  customerName?: string | null
  phone?: string | null
  address?: string | null
  zoneId?: string | null
  zoneName?: string | null
  delivererId?: string | null
  delivererName?: string | null
  fee: number
  status: string // PENDENTE | EM_ROTA | ENTREGUE | FALHOU
  dispatchedAt?: string | null
  deliveredAt?: string | null
  notes?: string | null
  createdAt: string
}

// ============ ENCOMENDAS ============

export type BookingDTO = {
  id: string
  code: string
  customerName: string
  phone?: string | null
  kind: string // BOLO | FESTA | SALGADOS | OUTROS
  description: string
  serveQty?: number | null
  dueDate: string
  totalAmount: number
  deposit: number
  status: string // ORCAMENTO | CONFIRMADA | EM_PRODUCAO | PRONTA | RETIRADA | CANCELADA
  notes?: string | null
  createdAt: string
}

// ============ QUALIDADE / DESPERDÍCIO ============

export type WasteRecordDTO = {
  id: string
  itemType: string // PRODUCT | INGREDIENT
  productId?: string | null
  ingredientId?: string | null
  name: string
  qty: number
  unit?: string | null
  reason: string // VENCIDO | QUEIMADO | ERRO_PRODUCAO | DEVOLUCAO | OUTROS
  cost: number
  actor?: string | null
  notes?: string | null
  createdAt: string
}

// ============ RELATÓRIOS / INTELIGÊNCIA ============

export type ReportSummaryDTO = {
  period: { from: string; to: string; days: number }
  dre: {
    revenue: number
    cogs: number
    grossProfit: number
    expensesByCategory: { category: string; amount: number }[]
    totalExpenses: number
    netProfit: number
    margin: number
  }
  salesByCategory: { category: string; amount: number }[]
  topProducts: { name: string; qty: number; amount: number }[]
  salesByMethod: { method: string; amount: number }[]
  wasteByReason: { reason: string; amount: number; count: number }[]
  production: { planned: number; done: number; accuracy: number }
  orders: { total: number; delivered: number; avgMinutes: number | null }
}

// ============ MOTOR FISCAL (Etapa 06) ============

export type FiscalConfigDTO = {
  id: string
  companyName: string
  cnpj: string
  ie: string | null
  uf: string
  crt: string // SIMPLES_NACIONAL | LUCRO_REAL | LUCRO_PRESUMIDO
  environment: string // HOMOLOGACAO | PRODUCAO
  provider: string
  nfceSeries: number
  nfceNextNumber: number
  nfeSeries: number
  nfeNextNumber: number
  autoEmit: boolean
  contingency: boolean
  contingencyReason: string | null
  contingencySince: string | null
  certA1Name: string | null
  certA1Expires: string | null
  certStatus: string // MISSING | VALID | EXPIRING | EXPIRED
  taxVersion: string
}

export type TaxTableDTO = {
  id: string
  version: string
  ncm: string
  description: string
  cfop: string
  origin: string
  csosn: string
  cst?: string | null
  icmsRate: number
  pisRate: number
  cofinsRate: number
  ibsRate: number
  cbsRate: number
  reducedIbs: boolean
  active: boolean
}

export type FiscalDocumentDTO = {
  id: string
  type: string // NFCE | NFE
  serie: number
  number: number
  accessKey: string
  saleId?: string | null
  saleCode?: string | null
  productsTotal: number
  discount: number
  icmsTotal: number
  ibsTotal: number
  cbsTotal: number
  total: number
  issuerName: string
  issuerCnpj: string
  customerName: string | null
  customerDoc: string | null
  status: string // PENDENTE | CONTINGENCIA | TRANSMITIDA | REJEITADA | CANCELADA | INUTILIZADA
  environment: string
  contingency: boolean
  protocol?: string | null
  receivedAt?: string | null
  rejectCode?: string | null
  rejectMessage?: string | null
  attempts: number
  operator?: string | null
  issuedAt: string
}

export type FiscalEventDTO = {
  id: string
  documentId: string | null
  type: string // EMISSAO | AUTORIZACAO | REJEICAO | REENVIO | CANCELAMENTO | INUTILIZACAO | CONTINGENCIA_ON | CONTINGENCIA_OFF
  accessKey: string | null
  description: string
  author: string | null
  createdAt: string
}

export type FiscalDocumentDetailDTO = FiscalDocumentDTO & {
  xml?: string | null
  danfeMeta?: string | null
  events: FiscalEventDTO[]
}

export type DanfeMetaDTO = {
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
  ambiente: string
  contingencia: boolean
  emitidoEm: string
  consulta: string
}
