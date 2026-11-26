// GET  /api/scales — visão agregada: equipamentos, perfis, PLUs, jobs, adapters
// POST /api/scales — cria equipamento de balança (guard: scales.manage)
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'
import { listAdapters } from '@/lib/scales/adapters'

export const dynamic = 'force-dynamic'

function parseJsonSafe(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const g = await guardApi(request, 'scales.view')
  if (!g.ok) return g.response

  const [devices, profiles, mappings, jobs, readings, products] = await Promise.all([
    db.scaleDevice.findMany({
      include: { profile: true },
      orderBy: { createdAt: 'desc' },
    }),
    db.scaleBarcodeProfile.findMany({ orderBy: { createdAt: 'desc' } }),
    db.scaleProductMapping.findMany({ orderBy: { updatedAt: 'desc' } }),
    db.scaleSyncJob.findMany({ orderBy: { startedAt: 'desc' }, take: 30, include: { items: true } }),
    db.scaleReading.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
    db.product.findMany({
      where: { active: true },
      select: { id: true, name: true, plu: true, saleUnit: true, price: true, byWeight: true, isWeighable: true },
      orderBy: { name: 'asc' },
    }),
  ])

  return Response.json({
    devices: devices.map((d) => ({ ...d, connectionConfigParsed: parseJsonSafe(d.connectionConfig) })),
    profiles,
    mappings,
    syncJobs: jobs,
    readings,
    products,
    adapters: listAdapters().map((a) => ({
      id: a.id,
      brand: a.brand,
      label: a.label,
      homologation: a.homologation,
      capabilities: a.capabilities,
      notes: a.notes,
    })),
  })
}

export async function POST(request: NextRequest) {
  const g = await guardApi(request, 'scales.manage')
  if (!g.ok) return g.response

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return Response.json({ error: 'Nome do equipamento é obrigatório' }, { status: 400 })

  const brand = typeof body.brand === 'string' && body.brand ? body.brand.toUpperCase() : 'GENERIC'
  const connectionType = typeof body.connectionType === 'string' && body.connectionType
    ? body.connectionType.toUpperCase()
    : 'SIMULATED'
  const connectionConfig =
    body.connectionConfig && typeof body.connectionConfig === 'object'
      ? JSON.stringify(body.connectionConfig)
      : null

  const adapter = listAdapters().find((a) => a.brand === brand)
  const homologationStatus = adapter?.homologation ?? 'PLANEJADO'

  const device = await db.scaleDevice.create({
    data: {
      name,
      brand,
      model: typeof body.model === 'string' ? body.model.trim() || null : null,
      connectionType,
      connectionConfig,
      profileId: typeof body.profileId === 'string' ? body.profileId : null,
      branchId: typeof body.branchId === 'string' ? body.branchId : null,
      department: typeof body.department === 'string' ? body.department.trim() || null : null,
      homologationStatus,
      status: connectionType === 'SIMULATED' ? 'ONLINE' : 'OFFLINE',
      notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
    },
    include: { profile: true },
  })

  return Response.json({ ...device, connectionConfigParsed: parseJsonSafe(device.connectionConfig) }, { status: 201 })
}
