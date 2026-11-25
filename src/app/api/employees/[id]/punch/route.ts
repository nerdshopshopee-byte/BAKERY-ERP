// POST /api/employees/[id]/punch — bater ponto (entrada/saída)
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

function toErrorResponse(error: unknown): Response {
  console.error('[api/employees/[id]/punch]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await guardApi(request, 'employees.timelog')
    if (!g.ok) return g.response

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
