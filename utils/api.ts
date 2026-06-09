const BASE_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000').replace(/\/$/, '');

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (response.status === 204) return null as any;

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const err = await response.json();
      message = err.error || err.message || message;
    } catch {}
    throw new Error(message);
  }

  return response.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),

  post: <T>(path: string, body?: any) =>
    request<T>(path, { method: 'POST', body: body != null ? JSON.stringify(body) : undefined }),

  patch: <T>(path: string, body: any) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),

  put: <T>(path: string, body: any) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),

  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

// ── Tasks ──────────────────────────────────────────────────────────────────
export interface Task {
  id: string;
  user_goal: string;
  status: 'pending' | 'planning' | 'running' | 'waiting_for_approval' | 'completed' | 'failed' | 'cancelled';
  priority: number;
  output: string | null;
  error_log: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskStep {
  id: string;
  step_index: number;
  step_type: 'plan' | 'thought' | 'tool_call' | 'tool_result' | 'reflection' | 'final' | 'approval_request' | 'approval_response';
  content: string;
  tool_name: string | null;
  status: string;
  created_at: string;
}

export interface TaskDetail extends Task {
  current_step_index: number;
  steps: TaskStep[];
}

export const tasks = {
  list: (status?: string) =>
    api.get<{ tasks: Task[]; total: number }>(`/api/tasks${status ? `?status=${status}` : ''}`),
  get: (id: string) => api.get<TaskDetail>(`/api/tasks/${id}`),
  create: (body: { user_goal: string; model_provider_id?: string; tools_allowed?: string[]; requires_user_approval?: boolean; priority?: number }) =>
    api.post<Task>('/api/tasks', body),
  cancel: (id: string) => api.post<Task>(`/api/tasks/${id}/cancel`),
  approve: (id: string, stepId: string, approved: boolean, note?: string) =>
    api.post<{ ok: boolean; task_status: string }>(`/api/tasks/${id}/approve`, { step_id: stepId, approved, note }),
  delete: (id: string) => api.delete<void>(`/api/tasks/${id}`),
};

// ── Memory ─────────────────────────────────────────────────────────────────
export interface Memory {
  id: string;
  memory_type: string;
  content: string;
  tags: string[];
  importance_score: string;
  created_at: string;
  task_id: string | null;
}

export const memory = {
  list: (params?: { type?: string; task_id?: string }) => {
    const qs = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return api.get<Memory[]>(`/api/memory${qs}`);
  },
  create: (body: { memory_type: string; content: string; tags?: string[]; importance_score?: number }) =>
    api.post<Memory>('/api/memory', body),
  delete: (id: string) => api.delete<void>(`/api/memory/${id}`),
};

// ── Providers ──────────────────────────────────────────────────────────────
export interface Provider {
  id: string;
  name: string;
  provider_type: 'openai' | 'anthropic' | 'google' | 'openai_compatible' | 'custom_rest';
  base_url: string | null;
  default_model: string;
  supports_tools: boolean;
  supports_vision: boolean;
  enabled: boolean;
  has_key: boolean;
  created_at: string;
}

export const providers = {
  list: () => api.get<Provider[]>('/api/providers'),
  create: (body: { name: string; provider_type: string; api_key: string; default_model: string; base_url?: string; supports_tools?: boolean; supports_vision?: boolean }) =>
    api.post<Provider>('/api/providers', body),
  update: (id: string, body: any) => api.patch<Provider>(`/api/providers/${id}`, body),
  delete: (id: string) => api.delete<void>(`/api/providers/${id}`),
  test: (id: string) => api.post<{ ok: boolean; message: string }>(`/api/providers/${id}/test`),
};

// ── Permissions ────────────────────────────────────────────────────────────
export interface Permissions {
  allow_file_read: boolean;
  allow_file_write: boolean;
  allow_file_delete: boolean;
  allow_github_read: boolean;
  allow_github_write: boolean;
  allow_web_access: boolean;
  allow_custom_apis: boolean;
  require_confirmation_for_risky: boolean;
  api_budget_usd_monthly: string;
}

export const permissions = {
  get: () => api.get<Permissions>('/api/permissions'),
  update: (body: Partial<Permissions>) => api.put<Permissions>('/api/permissions', body),
};

// ── GitHub ─────────────────────────────────────────────────────────────────
export const github = {
  status: () => api.get<{ connected: boolean; username?: string }>('/api/github/status'),
  connect: (pat: string) => api.post<{ username: string }>('/api/github/connect', { pat }),
  disconnect: () => api.delete<{ ok: boolean }>('/api/github/disconnect'),
  clone: (owner: string, repo: string) =>
    api.post<{ files: Array<{ path: string; size: number; type: string }> }>('/api/github/clone', { owner, repo }),
};

// ── Custom APIs ─────────────────────────────────────────────────────────────
export interface CustomApi {
  id: string;
  name: string;
  base_url: string;
  auth_type: 'none' | 'api_key' | 'bearer';
  has_secret: boolean;
  enabled: boolean;
  sensitive: boolean;
  endpoints: Array<{
    id: string;
    name: string;
    method: string;
    path: string;
    description: string | null;
    requires_confirmation: boolean;
    enabled: boolean;
  }>;
}

export const customApis = {
  list: () => api.get<CustomApi[]>('/api/custom-apis'),
  create: (body: { name: string; base_url: string; auth_type: string; auth_secret?: string; auth_header_name?: string; sensitive?: boolean }) =>
    api.post<CustomApi>('/api/custom-apis', body),
  update: (id: string, body: any) => api.patch<CustomApi>(`/api/custom-apis/${id}`, body),
  delete: (id: string) => api.delete<void>(`/api/custom-apis/${id}`),
  test: (id: string) => api.post<{ ok: boolean; status: number; message: string }>(`/api/custom-apis/${id}/test`),
  createEndpoint: (apiId: string, body: { name: string; method: string; path: string; description?: string; requires_confirmation?: boolean }) =>
    api.post<any>(`/api/custom-apis/${apiId}/endpoints`, body),
  deleteEndpoint: (apiId: string, endpointId: string) =>
    api.delete<void>(`/api/custom-apis/${apiId}/endpoints/${endpointId}`),
};

// ── Logs ────────────────────────────────────────────────────────────────────
export interface Log {
  id: string;
  task_id: string | null;
  level: 'info' | 'warn' | 'error';
  message: string;
  metadata: any;
  created_at: string;
}

export const logs = {
  list: (params?: { task_id?: string; level?: string; limit?: number }) => {
    const qs = params ? '?' + new URLSearchParams(params as any).toString() : '';
    return api.get<Log[]>(`/api/logs${qs}`);
  },
};
