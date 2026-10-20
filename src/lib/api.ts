import type { Task, User, Team, AdminUser } from '../types'

export interface ChartState {
  team?: Team | null
  users: User[]
  tasks: Task[]
}

export interface AuthResponse {
  token: string
  user: User
  teams: Team[]
  activeTeamId: string | null
}

const TOKEN_KEY = 'gantt_auth_token'
const ACTIVE_TEAM_KEY = 'gantt_active_team_id'
const MASTER_BACKUP_TOKEN_KEY = 'gantt_master_backup_token'

export function isImpersonating(): boolean {
  return !!localStorage.getItem(MASTER_BACKUP_TOKEN_KEY)
}

export function getMasterBackupToken(): string | null {
  return localStorage.getItem(MASTER_BACKUP_TOKEN_KEY)
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function getStoredActiveTeamId(): string | null {
  return localStorage.getItem(ACTIVE_TEAM_KEY)
}

export function setStoredActiveTeamId(teamId: string | null): void {
  if (teamId) localStorage.setItem(ACTIVE_TEAM_KEY, teamId)
  else localStorage.removeItem(ACTIVE_TEAM_KEY)
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const headers = new Headers(init?.headers)

  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(url, {
    ...init,
    headers,
  })

  if (res.status === 401) {
    // Se o token for inválido/expirado, remove do storage
    localStorage.removeItem(MASTER_BACKUP_TOKEN_KEY)
    setToken(null)
  }

  if (!res.ok) {
    let errorMsg = `Erro na requisição (${res.status})`
    try {
      const data = await res.json()
      if (data && data.error) errorMsg = data.error
    } catch {
      // Se não for JSON, usa mensagem genérica
    }
    throw new Error(errorMsg)
  }

  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

export const api = {
  // Autenticação
  login: async (email: string, password: string) => {
    const res = await request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    setToken(res.token)
    return res
  },

  register: async (name: string, email: string, password: string, color?: string) => {
    const res = await request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, color }),
    })
    setToken(res.token)
    return res
  },

  getMe: () =>
    request<{ user: User; teams: Team[]; activeTeamId: string | null }>('/api/auth/me'),

  updateProfile: (data: { name?: string; email?: string; color?: string; password?: string }) =>
    request<{ user: User }>('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  logout: () => {
    localStorage.removeItem(MASTER_BACKUP_TOKEN_KEY)
    setToken(null)
  },

  // Administração (Master)
  getAdminUsers: () => request<AdminUser[]>('/api/admin/users'),

  adminChangePassword: (userId: string, newPassword: string) =>
    request<{ message: string }>(`/api/admin/users/${userId}/password`, {
      method: 'PUT',
      body: JSON.stringify({ newPassword }),
    }),

  adminUpdateUser: (userId: string, data: { name?: string; email?: string; color?: string; isMaster?: boolean }) =>
    request<{ user: User }>(`/api/admin/users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  adminImpersonate: async (userId: string) => {
    const currentToken = getToken()
    const res = await request<AuthResponse>(`/api/admin/impersonate/${userId}`, {
      method: 'POST',
    })
    // Salva o token do master se ainda não estiver salvo
    if (currentToken && !localStorage.getItem(MASTER_BACKUP_TOKEN_KEY)) {
      localStorage.setItem(MASTER_BACKUP_TOKEN_KEY, currentToken)
    }
    setToken(res.token)
    return res
  },

  revertImpersonation: async () => {
    const masterToken = localStorage.getItem(MASTER_BACKUP_TOKEN_KEY)
    if (!masterToken) throw new Error('Nenhuma sessão master para restaurar.')
    localStorage.removeItem(MASTER_BACKUP_TOKEN_KEY)
    setToken(masterToken)
    const res = await request<{ user: User; teams: Team[]; activeTeamId: string | null }>('/api/auth/me')
    return {
      token: masterToken,
      user: res.user,
      teams: res.teams,
      activeTeamId: res.activeTeamId,
    } as AuthResponse
  },

  // Equipes
  getTeams: () => request<Team[]>('/api/teams'),

  createTeam: (name: string) =>
    request<Team>('/api/teams', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  getTeamMembers: (teamId: string) =>
    request<User[]>(`/api/teams/${teamId}/members`),

  addTeamMember: (teamId: string, email: string) =>
    request<{ message: string; addedUser: User; members: User[] }>(`/api/teams/${teamId}/members`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  removeTeamMember: (teamId: string, userId: string) =>
    request<void>(`/api/teams/${teamId}/members/${userId}`, {
      method: 'DELETE',
    }),

  // Tarefas e Gráfico
  getTeamState: (teamId: string) =>
    request<ChartState>(`/api/teams/${teamId}/state`),

  getState: (teamId?: string) =>
    request<ChartState>(teamId ? `/api/teams/${teamId}/state` : '/api/state'),

  saveTask: (task: Task, teamId?: string) =>
    request<Task>(`/api/tasks/${task.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...task, teamId }),
    }),

  deleteTask: (id: string) =>
    request<void>(`/api/tasks/${id}`, { method: 'DELETE' }),

  resetTeam: (teamId: string) =>
    request<ChartState>(`/api/teams/${teamId}/reset`, { method: 'POST' }),

  reset: () =>
    request<ChartState>('/api/reset', { method: 'POST' }),
}
