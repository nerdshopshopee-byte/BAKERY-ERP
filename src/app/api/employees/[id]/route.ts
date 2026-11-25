// PATCH /api/employees/[id] — atualização | DELETE — só sem registros de ponto
import { type NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { guardApi } from '@/lib/auth/guard'

export const dynamic = 'force-dynamic'

const round2 = (value: number) => Math.round(value * 100) / 100

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (value.trim() !== '' && Number.isFinite(parsed)) return parsed
  }
  return null
}

function strField(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function toErrorResponse(error: unknown): Response {
  console.error('[api/employees/[id]]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

interface EmployeePatchBody {
  name?: string
  role?: string
  salary?: number
  phone?: string
  active?: boolean
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await guardApi(request, 'employees.manage')
    if (!g.ok) return g.response

    const { id } = await params
    const body = (await request.json().catch(() => null)) as EmployeePatchBody | null
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
    }

    const existing = await db.employee.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ error: 'Funcionário não encontrado' }, { status: 404 })
    }

    const data: {
      name?: string
      role?: string
      salary?: number
      phone?: string | null
      active?: boolean
    } = {}

    if (body.name !== undefined) {
      const name = strField(body.name)
      if (!name) {
        return Response.json({ error: 'Nome é obrigatório' }, { status: 400 })
      }
      data.name = name
    }
    if (body.role !== undefined) {
      const role = strField(body.role)
      if (role) data.role = role
    }
    if (body.salary !== undefined) {
      const salary = num(body.salary)
      if (salary === null || salary < 0) {
        return Response.json(
          { error: 'Salário deve ser um número maior ou igual a zero' },
          { status: 400 }
        )
      }
      data.salary = round2(salary)
    }
    if (body.phone !== undefined) data.phone = strField(body.phone)
    if (typeof body.active === 'boolean') data.active = body.active

    if (Object.keys(data).length === 0) {
      return Response.json({ error: 'Nenhum campo para atualizar' }, { status: 400 })
    }

    const updated = await db.employee.update({ where: { id }, data })
    return Response.json(updated)
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const g = await guardApi(request, 'employees.manage')
    if (!g.ok) return g.response

    const { id } = await params
    const existing = await db.employee.findUnique({ where: { id } })
    if (!existing) {
      return Response.json({ error: 'Funcionário não encontrado' }, { status: 404 })
    }

    const logCount = await db.timeLog.count({ where: { employeeId: id } })
    if (logCount > 0) {
      return Response.json(
        { error: 'Funcionário possui registros de ponto e não pode ser excluído' },
        { status: 400 }
      )
    }

    await db.employee.delete({ where: { id } })
    return Response.json({ deleted: true })
  } catch (error) {
    return toErrorResponse(error)
  }
}
