// POST /api/employees/[id]/punch — bater ponto (entrada/saída)
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

function toErrorResponse(error: unknown): Response {
  console.error('[api/employees/[id]/punch]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const employee = await db.employee.findUnique({ where: { id } })
    if (!employee) {
      return Response.json({ error: 'Funcionário não encontrado' }, { status: 404 })
    }

    const now = new Date()
    const openLog = await db.timeLog.findFirst({
      where: { employeeId: id, checkOut: null },
      orderBy: { checkIn: 'desc' },
    })

    if (openLog) {
      // Fecha o ponto aberto (saída)
      const updated = await db.timeLog.update({
        where: { id: openLog.id },
        data: { checkOut: now },
      })
      return Response.json(updated)
    }

    // Abre novo ponto (entrada)
    const created = await db.timeLog.create({
      data: { employeeId: id, checkIn: now },
    })
    return Response.json(created)
  } catch (error) {
    return toErrorResponse(error)
  }
}
