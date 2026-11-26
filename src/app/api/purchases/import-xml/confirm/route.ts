// POST /api/purchases/import-xml/confirm — fase 2 da importação de NF-e
// Incorpora as mercadorias da nota ao estoque (insumos e/ou produtos de revenda),
// aplica a regra OPCIONAL de margem de lucro sobre os preços de venda dos produtos,
// registra a compra (status RECEBIDA) e gera a conta a pagar.
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

const round2 = (v: number) => Math.round(v * 100) / 100

interface ConfirmItem {
  index?: number
  targetType?: string // INGREDIENT | PRODUCT | SKIP
  targetId?: string | null
  newName?: string
  newUnit?: string
  qty?: number
  unitCost?: number
}

interface ConfirmBody {
  header?: {
    number?: string
    series?: string
    issuedAt?: string | null
    natOp?: string
    issuerName?: string
    issuerCnpj?: string
    total?: number
  }
  sourceXml?: string
  items?: ConfirmItem[]
  applyMargin?: boolean
  marginPct?: number
  supplierId?: string
  newSupplierName?: string
  createPayable?: boolean
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (value.trim() !== '' && Number.isFinite(parsed)) return parsed
  }
  return null
}

export async function POST(request: NextRequest) {
  const g = await guardApi(request, 'purchases.create')
  if (!g.ok) return g.response

  const body = (await request.json().catch(() => null)) as ConfirmBody | null
  if (!body?.header || !Array.isArray(body.items) || body.items.length === 0) {
    return Response.json({ error: 'Dados da nota incompletos' }, { status: 400 })
  }

  const margin = body.applyMargin ? num(body.marginPct) : null
  if (body.applyMargin && (margin === null || margin < 0 || margin > 500)) {
    return Response.json({ error: 'Margem de lucro inválida (0 a 500%)' }, { status: 400 })
  }

  const header = body.header
  const nfeLabel = header.number ? `NF-e nº ${header.number}${header.series ? ` série ${header.series}` : ''}` : 'NF-e importada'
  const createPayable = body.createPayable !== false

  // ---------- Resolve fornecedor ----------
  let supplier = null as null | { id: string; name: string }
  const supplierId = typeof body.supplierId === 'string' && body.supplierId.trim() !== '' ? body.supplierId.trim() : null
  const fallbackName = (body.newSupplierName?.trim() || header.issuerName?.trim() || '').slice(0, 120)

  if (supplierId) {
    const found = await db.supplier.findUnique({ where: { id: supplierId } })
    if (!found) return Response.json({ error: 'Fornecedor selecionado não encontrado' }, { status: 400 })
    supplier = { id: found.id, name: found.name }
  } else if (fallbackName) {
    const existing = await db.supplier.findFirst({
      where: { name: { equals: fallbackName } },
    })
    if (existing) {
      supplier = { id: existing.id, name: existing.name }
    } else {
      const created = await db.supplier.create({ data: { name: fallbackName, active: true } })
      supplier = { id: created.id, name: created.name }
    }
  } else {
    return Response.json({ error: 'Informe o fornecedor (existente ou nome do emitente da nota)' }, { status: 400 })
  }

  // ---------- Normaliza itens a incorporar ----------
  type Planned =
    | { kind: 'INGREDIENT'; name: string; unit: string; qty: number; unitCost: number; targetId: string | null }
    | { kind: 'PRODUCT'; name: string; unit: string; qty: number; unitCost: number; targetId: string | null }

  const planned: Planned[] = []
  for (const item of body.items) {
    const targetType = item?.targetType
    if (targetType === 'SKIP') continue
    if (targetType !== 'INGREDIENT' && targetType !== 'PRODUCT') {
      return Response.json({ error: `Tipo de destino inválido no item ${item?.index ?? '?'}` }, { status: 400 })
    }
    const qty = num(item.qty)
    const unitCost = num(item.unitCost)
    if (qty === null || qty <= 0) {
      return Response.json({ error: `Quantidade inválida no item ${item?.index ?? '?'}` }, { status: 400 })
    }
    if (unitCost === null || unitCost < 0) {
      return Response.json({ error: `Custo unitário inválido no item ${item?.index ?? '?'}` }, { status: 400 })
    }

    if (item.targetId) {
      const id = item.targetId
      if (targetType === 'INGREDIENT') {
        const found = await db.ingredient.findUnique({ where: { id } })
        if (!found) return Response.json({ error: `Insumo selecionado no item ${item.index} não encontrado` }, { status: 400 })
        planned.push({ kind: 'INGREDIENT', name: found.name, unit: found.unit, qty, unitCost, targetId: id })
      } else {
        const found = await db.product.findUnique({ where: { id } })
        if (!found) return Response.json({ error: `Produto selecionado no item ${item.index} não encontrado` }, { status: 400 })
        planned.push({ kind: 'PRODUCT', name: found.name, unit: found.unit, qty, unitCost, targetId: id })
      }
    } else {
      const name = item.newName?.trim() || `Item ${item.index ?? ''}`
      const unit = item.newUnit?.trim()?.toUpperCase() || 'UN'
      planned.push({ kind: targetType, name, unit, qty, unitCost, targetId: null })
    }
  }

  if (planned.length === 0) {
    return Response.json({ error: 'Nenhum item marcado para incorporação' }, { status: 400 })
  }

  const total = round2(planned.reduce((acc, p) => acc + p.qty * p.unitCost, 0))
  const sourceXml = typeof body.sourceXml === 'string' && body.sourceXml.length <= 512 * 1024 ? body.sourceXml : null

  try {
    const result = await db.$transaction(async (tx) => {
      const count = await tx.purchase.count()
      const code = `PC-${String(1000 + count + 1)}`

      const purchase = await tx.purchase.create({
        data: {
          code,
          supplierId: supplier.id,
          supplier: supplier.name,
          status: 'RECEBIDA',
          total,
          notes: header.natOp ? `${nfeLabel} · Natureza: ${header.natOp}` : nfeLabel,
          documentType: 'NFE',
          documentNumber: header.number || null,
          documentSeries: header.series || null,
          issuerName: header.issuerName || null,
          issuerCnpj: header.issuerCnpj || null,
          sourceXml,
          receivedAt: new Date(),
          items: {
            create: planned.map((p) => ({
              ingredientId: p.kind === 'INGREDIENT' ? p.targetId : null,
              productId: p.kind === 'PRODUCT' ? p.targetId : null,
              name: p.name,
              unit: p.unit,
              qty: p.qty,
              unitCost: p.unitCost,
            })),
          },
        },
      })

      let ingredientsCreated = 0
      let productsCreated = 0
      let ingredientsUpdated = 0
      let productsUpdated = 0
      let pricesApplied = 0

      for (const p of planned) {
        if (p.kind === 'INGREDIENT') {
          let ingredientId = p.targetId
          if (ingredientId) {
            await tx.ingredient.update({
              where: { id: ingredientId },
              data: { costPerUnit: p.unitCost, supplierId: supplier.id },
            })
            ingredientsUpdated++
          } else {
            const created = await tx.ingredient.create({
              data: {
                name: p.name,
                unit: p.unit,
                costPerUnit: p.unitCost,
                stock: 0,
                minStock: 0,
                supplierId: supplier.id,
              },
            })
            ingredientId = created.id
            ingredientsCreated++
          }
          await tx.ingredient.update({
            where: { id: ingredientId },
            data: { stock: { increment: p.qty } },
          })
          await tx.stockMovement.create({
            data: {
              itemType: 'INGREDIENT',
              ingredientId,
              type: 'ENTRADA',
              qty: p.qty,
              unitCost: p.unitCost,
              refId: purchase.id,
              reason: `${nfeLabel} - ${supplier.name}`,
            },
          })
        } else {
          const priceWithMargin = round2(p.unitCost * (1 + (margin ?? 0) / 100))
          let productId = p.targetId
          if (productId) {
            await tx.product.update({
              where: { id: productId },
              data: {
                cost: p.unitCost,
                ...(body.applyMargin ? { price: priceWithMargin } : {}),
              },
            })
            productsUpdated++
            if (body.applyMargin) pricesApplied++
          } else {
            const created = await tx.product.create({
              data: {
                name: p.name,
                unit: p.unit === 'KG' || p.unit === 'G' ? 'KG' : 'UN',
                saleUnit: p.unit,
                price: body.applyMargin ? priceWithMargin : p.unitCost,
                cost: p.unitCost,
                trackStock: true,
                stock: 0,
                minStock: 0,
                isKitchen: false,
                active: true,
              },
            })
            productId = created.id
            productsCreated++
            if (body.applyMargin) pricesApplied++
          }
          await tx.product.update({
            where: { id: productId },
            data: { stock: { increment: p.qty } },
          })
          await tx.stockMovement.create({
            data: {
              itemType: 'PRODUCT',
              productId,
              type: 'ENTRADA',
              qty: p.qty,
              unitCost: p.unitCost,
              refId: purchase.id,
              reason: `${nfeLabel} - ${supplier.name}`,
            },
          })
        }
      }

      if (createPayable && total > 0) {
        await tx.payable.create({
          data: {
            description: `${nfeLabel} - ${supplier.name}`,
            supplierId: supplier.id,
            supplier: supplier.name,
            category: 'INSUMOS',
            amount: total,
            dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          },
        })
      }

      return {
        purchaseId: purchase.id,
        code,
        total,
        incorporated: planned.length,
        ingredientsCreated,
        ingredientsUpdated,
        productsCreated,
        productsUpdated,
        pricesApplied,
        payableCreated: createPayable && total > 0,
      }
    })

    return Response.json(result)
  } catch (err) {
    console.error('[api/purchases/import-xml/confirm]', err)
    return Response.json({ error: 'Erro ao incorporar os itens da nota ao estoque' }, { status: 500 })
  }
}
