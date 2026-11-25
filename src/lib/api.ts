// BAKERY ERP - Client HTTP para consumo das APIs (uso exclusivo no client side)

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`GET ${url} falhou (${res.status})`)
  return res.json()
}

export async function apiSend<T>(url: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    let msg = `${method} ${url} falhou (${res.status})`
    try {
      const err = await res.json()
      if (err?.error) msg = err.error
    } catch {
      /* ignore */
    }
    throw new Error(msg)
  }
  return res.json()
}

export const apiPost = <T>(url: string, body?: unknown) => apiSend<T>(url, 'POST', body)
export const apiPatch = <T>(url: string, body?: unknown) => apiSend<T>(url, 'PATCH', body)
export const apiDelete = <T>(url: string) => apiSend<T>(url, 'DELETE')
