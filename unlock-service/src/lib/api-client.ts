// Typed fetch wrapper that talks to the standalone backend
const BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `Request failed: ${res.status}`)
  return data as T
}

export const api = {
  auth: {
    register: (body: object) => request('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
    login:    (email: string, password: string) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    me:       () => request('/auth/me'),
    logout:   () => request('/auth/logout', { method: 'POST' }),
  },
  imei: {
    check: (imei: string) => request<{ valid: boolean; brand: string | null; model: string | null }>(`/imei/check?imei=${imei}`),
  },
  unlock: {
    submit: (body: object) => request<{ orderId: string; estimatedMinutes: number }>('/unlock', { method: 'POST', body: JSON.stringify(body) }),
    list:   (params?: { status?: string; page?: number }) => {
      const qs = new URLSearchParams(params as Record<string, string>).toString()
      return request<{ orders: unknown[]; total: number }>(`/unlock${qs ? '?' + qs : ''}`)
    },
    get: (id: string) => request(`/unlock/${id}`),
  },
  subscription: {
    get:      () => request('/subscription'),
    checkout: (body: object) => request<{ url: string }>('/subscription/checkout', { method: 'POST', body: JSON.stringify(body) }),
    portal:   () => request<{ url: string }>('/subscription/portal', { method: 'POST' }),
  },
  admin: {
    stats:        () => request('/admin/stats'),
    orders:       (params?: object) => request(`/admin/orders?${new URLSearchParams(params as Record<string, string>)}`),
    updateOrder:  (id: string, body: object) => request(`/admin/orders/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    users:        (params?: object) => request(`/admin/users?${new URLSearchParams(params as Record<string, string>)}`),
    updateRole:   (id: string, role: string) => request(`/admin/users/${id}/role`, { method: 'PUT', body: JSON.stringify({ role }) }),
    addCredits:   (id: string, credits: number) => request(`/admin/users/${id}/credits`, { method: 'POST', body: JSON.stringify({ credits }) }),
    transactions: (page?: number) => request(`/admin/transactions?page=${page ?? 1}`),
  },
}
