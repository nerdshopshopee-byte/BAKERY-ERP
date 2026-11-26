// POST /api/scales/decode — interpretador universal de etiquetas para o PDV
// Recebe o código lido pelo leitor, interpreta contra os perfis ativos,
// resolve o produto por PLU e devolve a linha pronta para o carrinho.
// Códigos desconhecidos são recusados (nunca lançados como produto comum).
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'
import { decodeBarcode, type BarcodeProfileConfig } from '@/lib/scales/barcode-interpreter'
import { moneyMul, round3 } from '@/lib/units'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const g = await guardApi(request, 'sales.view')
  if (!g.ok) return g.response

  const body = (await request.json().catch(() => ({}))) as { code?: string; deviceId?: string }
  const code = typeof body.code === 'string' ? body.code.trim() : ''
  if (!code) return Response.json({ error: 'Informe o código lido' }, { status: 400 })

  const profiles = await db.scaleBarcodeProfile.findMany({ where: { active: true } })
  const configs: BarcodeProfileConfig[] = profiles.map((p) => ({
    payloadType: p.payloadType === 'PRICE' ? 'PRICE' : 'WEIGHT',
    prefix: p.prefix,
    pluDigits: p.pluDigits,
    payloadDigits: p.payloadDigits,
    payloadDecimals: p.payloadDecimals,
    checkDigit: p.checkDigit,
    symbology: p.symbology,
  }))

  const decoded = decodeBarcode(code, configs)

  // 1) Etiqueta de balança reconhecida
  if (decoded.kind === 'SCALE_LABEL') {
    if (decoded.reason?.includes('DV inválido')) {
      return Response.json(
        { error: `Etiqueta de balança rejeitada: ${decoded.reason}`, decoded },
        { status: 422 },
      )
    }
    if (!decoded.plu) {
      return Response.json({ error: decoded.reason ?? 'Etiqueta inválida', decoded }, { status: 422 })
    }

    // Resolve PLU: prioriza mapeamento do equipamento; senão qualquer mapeamento;
    // senão PLU global do produto
    let product = null
    if (body.deviceId) {
      const mapping = await db.scaleProductMapping.findUnique({
        where: { deviceId_plu: { deviceId: body.deviceId, plu: decoded.plu } },
      })
      if (mapping) {
        product = await db.product.findUnique({ where: { id: mapping.productId } })
      }
    }
    if (!product) {
      const anyMapping = await db.scaleProductMapping.findFirst({
        where: { plu: decoded.plu },
        orderBy: { updatedAt: 'desc' },
      })
      if (anyMapping) {
        product = await db.product.findUnique({ where: { id: anyMapping.productId } })
      }
    }
    if (!product) {
      product = await db.product.findFirst({ where: { plu: decoded.plu, active: true } })
    }
    if (!product) {
      return Response.json(
        { error: `PLU ${decoded.plu} não vinculado a nenhum produto cadastrado`, decoded },
        { status: 404 },
      )
    }
    if (!product.active) {
      return Response.json({ error: `Produto inativo: ${product.name}` }, { status: 400 })
    }

    // Calcula quantidade e total com arredondamento monetário controlado
    let qty: number
    let total: number
    if (decoded.weight !== undefined) {
      qty = round3(decoded.weight)
      total = moneyMul(qty, product.price)
    } else if (decoded.price !== undefined && product.price > 0) {
      total = Math.round(decoded.price * 100 + Number.EPSILON) / 100
      qty = round3(total / product.price)
    } else {
      return Response.json({ error: 'Etiqueta sem peso/valor válido' }, { status: 422 })
    }

    // Auditoria da leitura (origem LABEL)
    await db.scaleReading.create({
      data: {
        deviceId: body.deviceId ?? null,
        productId: product.id,
        plu: decoded.plu,
        weight: qty,
        unitPrice: product.price,
        total,
        raw: code,
        source: 'LABEL',
        stable: true,
      },
    })

    return Response.json({
      kind: 'SCALE_LABEL',
      product: {
        id: product.id,
        name: product.name,
        saleUnit: product.saleUnit,
        unitPrice: product.price,
        price: product.price,
        cost: product.cost,
        byWeight: product.byWeight,
        isWeighable: product.isWeighable,
        isKitchen: product.isKitchen,
        active: product.active,
      },
      qty,
      unitPrice: product.price,
      total,
      plu: decoded.plu,
      raw: code,
      decoded,
    })
  }

  // 2) Código de barras simples: busca direta por barcode/plu exato
  const direct = await db.product.findFirst({
    where: { OR: [{ barcode: code }, { plu: code }], active: true },
  })
  if (direct) {
    return Response.json({
      kind: 'PLAIN_BARCODE',
      product: {
        id: direct.id,
        name: direct.name,
        saleUnit: direct.saleUnit,
        unitPrice: direct.price,
        price: direct.price,
        cost: direct.cost,
        byWeight: direct.byWeight,
        isWeighable: direct.isWeighable,
        isKitchen: direct.isKitchen,
        active: direct.active,
      },
      qty: 1,
      unitPrice: direct.price,
      total: direct.price,
      raw: code,
    })
  }

  return Response.json(
    { error: 'Código desconhecido: não é etiqueta de balança configurada nem produto cadastrado', kind: 'UNKNOWN' },
    { status: 404 },
  )
}
