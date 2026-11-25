// GET /api/employees — funcionários | POST — criação
import { db } from '@/lib/db'

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
  console.error('[api/employees]', error)
  return Response.json({ error: 'Erro interno do servidor' }, { status: 500 })
}

interface EmployeeBody {
  name?: string
  role?: string
  salary?: number
  phone?: string
}

export async function GET() {
  try {
    const employees = await db.employee.findMany({ orderBy: { name: 'asc' } })
    return Response.json(employees)
  } catch (error) {
    return toErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as EmployeeBody | null
    if (!body || typeof body !== 'object') {
      return Response.json({ error: 'Corpo da requisição inválido' }, { status: 400 })
    }

    const name = strField(body.name)
    if (!name) {
      return Response.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }

    const salary = num(body.salary)
    if (salary === null || salary < 0) {
      return Response.json({ error: 'Salário deve ser um número maior ou igual a zero' }, { status: 400 })
    }

    const employee = await db.employee.create({
      data: {
        name,
        role: strField(body.role) ?? 'ATENDENTE',
        salary: round2(salary),
        phone: strField(body.phone),
      },
    })
    return Response.json(employee)
  } catch (error) {
    return toErrorResponse(error)
  }
}
