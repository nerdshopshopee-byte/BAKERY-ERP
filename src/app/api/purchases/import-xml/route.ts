// POST /api/purchases/import-xml — upload e parsing de NF-e XML (fase 1)
// Retorna o rascunho (cabeçalho + itens) para revisão/mapeamento na tela de compras.
// Não escreve no banco: a incorporação acontece na confirmação (/import-xml/confirm).
import { type NextRequest } from 'next/server'
import { guardApi } from '@/lib/auth/guard'
import { parseNfeXml } from '@/lib/nfe-import'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const g = await guardApi(request, 'purchases.create')
  if (!g.ok) return g.response

  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    return Response.json({ error: 'Envie o arquivo XML via multipart/form-data' }, { status: 400 })
  }

  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return Response.json({ error: 'Campo "file" é obrigatório' }, { status: 400 })
    }
    if (file.size > 10 * 1024 * 1024) {
      return Response.json({ error: 'Arquivo muito grande (limite de 10 MB)' }, { status: 400 })
    }

    const xml = await file.text()
    if (!/<\?xml|<nfeProc|<NFe|<procNFe/i.test(xml)) {
      return Response.json({ error: 'O arquivo não parece ser um XML de NF-e' }, { status: 400 })
    }

    const draft = parseNfeXml(xml)
    return Response.json({ filename: file.name, draft })
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Falha ao processar o XML' },
      { status: 400 },
    )
  }
}
