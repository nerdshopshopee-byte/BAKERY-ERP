// POST /api/scales/simulate — simulador de balança para desenvolvimento/testes
// Gera etiqueta EAN-13 conforme o perfil do equipamento e registra a leitura.
// Também simula leitura de peso em tempo real (peso estável, validação, tara).
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'
import { encodeLabel, decodeBarcode, type BarcodeProfileConfig } from '@/lib/scales/barcode-interpreter'
import { moneyMul, round3 } from '@/lib/units'

export const dynamic = 'force-dynamic'

/** Peso estável simulado: determinístico por produto+randomização leve, entre
 *  0,100 kg e 2,000 kg (ou peso informado). Respeita tara do produto. */
function simulateWeight(requested: number | null, taraGrams: number): number {
  const base = requested !== null && requested > 0 ? requested : 0.1 + Math.random() * 1.9
  const net = Math.max(0.001, base - taraGrams / 1000)
  return round3(net)
}

export async function POST(request: NextRequest) {
  const g = await guardApi(request, 'scales.sync')
  if (!g.ok) return g.response

  const body = (await request.json().catch(() => ({}))) as {
    deviceId?: string
    productId?: string
    weight?: number
    priceLabel?: boolean // gera etiqueta PRICE quando o perfil do equipamento for PRICE
  }

  if (!body.productId) return Response.json({ error: 'Produto é obrigatório' }, { status: 400 })
  const product = await db.product.findUnique({ where: { id: body.productId } })
  if (!product) return Response.json({ error: 'Produto não encontrado' }, { status: 404 })

  const device = body.deviceId
    ? await db.scaleDevice.findUnique({ where: { id: body.deviceId }, include: { profile: true } })
    : await db.scaleDevice.findFirst({ where: { active: true }, include: { profile: true } })
  if (!device) return Response.json({ error: 'Nenhum equipamento de balança cadastrado' }, { status: 400 })

  const profile = device.profile
    ?? (await db.scaleBarcodeProfile.findFirst({ where: { active: true } }))
  if (!profile) {
    return Response.json({ error: 'Nenhum perfil de etiqueta configurado' }, { status: 400 })
  }

  const config: BarcodeProfileConfig = {
    symbology: profile.symbology,
    payloadType: profile.payloadType === 'PRICE' ? 'PRICE' : 'WEIGHT',
    prefix: profile.prefix,
    pluDigits: profile.pluDigits,
    payloadDigits: profile.payloadDigits,
    payloadDecimals: profile.payloadDecimals,
    checkDigit: profile.checkDigit,
  }

  // Resolve PLU do produto no equipamento (mapping) ou PLU global
  const mapping = await db.scaleProductMapping.findUnique({
    where: { deviceId_productId: { deviceId: device.id, productId: product.id } },
  })
  const plu = mapping?.plu ?? product.plu
  if (!plu) {
    return Response.json(
      { error: `Produto "${product.name}" sem PLU associado a este equipamento` },
      { status: 400 },
    )
  }

  const weight = simulateWeight(typeof body.weight === 'number' ? body.weight : null, product.tara)
  const usePricePayload = body.priceLabel === true || config.payloadType === 'PRICE'

  // Gera a etiqueta conforme o tipo de payload do perfil
  const payload = usePricePayload ? moneyMul(weight, product.price) : weight
  const label = encodeLabel(config, plu, payload)

  // Confere decodificando (garantia do ciclo etiqueta -> PDV)
  const reDecoded = decodeBarcode(label, [config])

  let total: number
  let qty: number
  if (reDecoded.weight !== undefined) {
    qty = reDecoded.weight
    total = moneyMul(qty, product.price)
  } else if (reDecoded.price !== undefined && product.price > 0) {
    total = reDecoded.price
    qty = round3(total / product.price)
  } else {
    return Response.json({ error: 'Falha na geração/decodificação da etiqueta' }, { status: 500 })
  }

  await db.scaleReading.create({
    data: {
      deviceId: device.id,
      productId: product.id,
      plu,
      weight: qty,
      unitPrice: product.price,
      total,
      raw: label,
      source: 'SIMULATOR',
      stable: true,
    },
  })

  await db.scaleDevice.update({
    where: { id: device.id },
    data: { lastCommunicationAt: new Date(), status: 'ONLINE' },
  })

  return Response.json({
    label,
    profile: { id: profile.id, name: profile.name, payloadType: config.payloadType, prefix: config.prefix },
    device: { id: device.id, name: device.name, brand: device.brand },
    product: { id: product.id, name: product.name, saleUnit: product.saleUnit, unitPrice: product.price },
    qty,
    unitPrice: product.price,
    total,
    stable: true,
    decoded: reDecoded,
  })
}
