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
