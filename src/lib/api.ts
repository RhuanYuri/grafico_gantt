import type { Task, User } from '../types'

export interface ChartState {
  users: User[]
  tasks: Task[]
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  })
  if (!res.ok) throw new Error(`API respondeu ${res.status}`)
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

export const api = {
  getState: () => request<ChartState>('/api/state'),
  saveTask: (task: Task) => request<Task>(`/api/tasks/${task.id}`, { method: 'PUT', body: JSON.stringify(task) }),
  deleteTask: (id: string) => request<void>(`/api/tasks/${id}`, { method: 'DELETE' }),
  reset: () => request<ChartState>('/api/reset', { method: 'POST' }),
}
