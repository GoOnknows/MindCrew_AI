import axios from 'axios'
import { ElMessage } from 'element-plus'

// ─── Shared Types ────────────────────────────────────────────────────────

export interface Task {
  id: string; topic: string; status: string; progress: number
  agents: string[]; researcherCount: number; sourcesFound: number; createdAt: string
}

export interface AgentLog {
  id: string; agent: string; action: string; content: string; createdAt: string
}

export interface TaskDetail extends Task {
  report?: string | null; agentLogs: AgentLog[]
}

const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
})

// ─── Request interceptor ───
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ─── Response interceptor ───
api.interceptors.response.use(
  (r) => r.data,
  (error) => {
    if (error.response?.status === 401) {
      ElMessage.error('登录已过期或用户不存在，请重新登录')
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      // 延迟跳转，让用户看到提示消息
      setTimeout(() => {
        window.location.href = '/login'
      }, 500)
    }
    return Promise.reject(error)
  },
)

export default api

// ================================================================
//  Typed API helpers
// ================================================================

// ─── Auth ───
export const authApi = {
  login: (data: { username: string; password: string }) =>
    api.post('/auth/login', data) as Promise<{ token: string; user: any }>,
  register: (data: { username: string; email: string; password: string }) =>
    api.post('/auth/register', data) as Promise<{ token: string; user: any }>,
  profile: () => api.get('/auth/profile'),
  logout: () => api.post('/auth/logout'),
}

// ─── Users ───
export const usersApi = {
  list: (params?: { search?: string; role?: string; page?: number; pageSize?: number }) =>
    api.get('/users', { params }) as Promise<{ list: any[]; total: number; page: number; pageSize: number }>,
  get: (id: string) => api.get(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  update: (id: string, data: any) => api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
  roles: () => api.get('/users/roles') as Promise<{ name: string; key: string; permissions: string }[]>,
  updatePermissions: (id: string, role: string) => api.put(`/users/${id}/permissions`, { role }),
}

// ─── Chat ───
export const chatApi = {
  sessions: () => api.get('/chat/sessions') as Promise<any[]>,
  createSession: () => api.post('/chat/sessions'),
  deleteSession: (id: string) => api.delete(`/chat/sessions/${id}`),
  getMessages: (sessionId: string) =>
    api.get(`/chat/sessions/${sessionId}/messages`) as Promise<any[]>,
  /**
   * SSE stream URL builder — use with EventSource or fetch
   */
  streamUrl: (query: string, sessionId?: string, modelId?: string) => {
    const token = localStorage.getItem('token')
    const params = new URLSearchParams({ query })
    if (sessionId) params.set('sessionId', sessionId)
    if (modelId) params.set('modelId', modelId)
    return `/api/chat/stream?${params.toString()}&token=${token}`
  },
}

// ─── Knowledge ───
export const knowledgeApi = {
  list: (params?: { search?: string; status?: string; page?: number; pageSize?: number }) =>
    api.get('/knowledge/documents', { params }) as Promise<{ list: any[]; total: number }>,
  get: (id: string) => api.get(`/knowledge/documents/${id}`),
  upload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/knowledge/documents', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  delete: (id: string) => api.delete(`/knowledge/documents/${id}`),
  preview: (id: string) => api.get(`/knowledge/documents/${id}/preview`),
  reindex: (id: string) => api.post(`/knowledge/documents/${id}/reindex`),
  stats: () => api.get('/knowledge/stats') as Promise<{
    totalDocuments: number
    indexedDocuments: number
    totalChunks: number
  }>,
  /** 数据恢复：从 uploads 目录重新导入残留文件 */
  recover: () => api.post('/knowledge/recover') as Promise<{
    message: string
    count: number
    total: number
    results: { file: string; status: string; error?: string }[]
  }>,
}

// ─── Research ───
export const researchApi = {
  list: (params?: { status?: string; page?: number; pageSize?: number }) =>
    api.get('/research/tasks', { params }) as Promise<{ list: Task[]; total: number }>,
  get: (id: string) => api.get(`/research/tasks/${id}`) as Promise<TaskDetail>,
  create: (data: { topic: string; researcherCount?: number }) =>
    api.post('/research/tasks', data),
  delete: (id: string) => api.delete(`/research/tasks/${id}`),
  streamUrl: (id: string) => `/api/research/tasks/${id}/stream`,
}

// ─── Dashboard ───
export const dashboardApi = {
  stats: () => api.get('/dashboard/stats') as Promise<{
    todayQA: number; qaChange: number; totalDocuments: number
    totalChunks: number; researchTasks: number; runningResearches: number
    tokenUsed: number
  }>,
  qaTrends: (range?: string) =>
    api.get('/dashboard/qa-trends', { params: { range } }) as Promise<{ dates: string[]; qaData: number[]; userData: number[] }>,
  toolUsage: () =>
    api.get('/dashboard/tool-usage') as Promise<{ value: number; name: string }[]>,
  hotQuestions: () =>
    api.get('/dashboard/hot-questions') as Promise<{ name: string; count: number }[]>,
  modelLatency: (range?: string) =>
    api.get('/dashboard/model-latency', { params: { range } }) as Promise<{ dates: string[]; values: number[] }>,
  activities: () => api.get('/dashboard/activities') as Promise<{ icon: string; text: string; time: string }[]>,
}

// ─── Config ───
export const configApi = {
  get: () => api.get('/config') as Promise<any>,
  update: (data: any) => api.put('/config', data),
}

// ─── 模型管理 ───
export interface ModelConfig {
  id: string
  name: string
  modelName: string
  baseUrl: string
  apiKey: string
  temperature: number
  maxTokens: number
  isDefault: boolean
  order: number
}

export const modelApi = {
  list: () => api.get('/config/models') as Promise<ModelConfig[]>,
  create: (data: { name: string; modelName: string; baseUrl: string; apiKey: string; temperature?: number; maxTokens?: number }) =>
    api.post('/config/models', data) as Promise<ModelConfig>,
  update: (id: string, data: Partial<ModelConfig>) =>
    api.put(`/config/models/${id}`, data) as Promise<ModelConfig>,
  delete: (id: string) => api.delete(`/config/models/${id}`) as Promise<{ message: string }>,
}

// ─── MCP ───
export const mcpApi = {
  tools: () => api.get('/mcp/tools') as Promise<any[]>,
  toggle: (name: string, enabled: boolean) => api.put(`/mcp/tools/${name}/toggle`, { enabled }),
  test: (tool: string, params: any) => api.post('/mcp/tools/test', { tool, params }),
  stats: () => api.get('/mcp/tools/stats'),
}
