export type TaskStatus = 'pending' | 'in_progress' | 'done'

/**
 * Tipos de dependência. Hoje apenas Finish-to-Start (FS) é desenhado;
 * o campo existe para permitir SS, FF e SF no futuro sem alterar o modelo.
 */
export type DependencyType = 'FS'

export interface Dependency {
  /** Id da tarefa predecessora */
  taskId: string
  type: DependencyType
}

export interface User {
  id: string
  name: string
  email: string
  color: string
  avatarUrl?: string
}

export interface Team {
  id: string
  name: string
  role?: 'owner' | 'member'
  memberCount?: number
  createdAt?: string
}

export interface TeamMember {
  teamId: string
  userId: string
  role: string
  joinedAt: string
}

export interface Task {
  id: string
  teamId?: string
  title: string
  description: string
  /** Data ISO (YYYY-MM-DD), inclusiva */
  start: string
  /** Data ISO (YYYY-MM-DD), inclusiva */
  end: string
  status: TaskStatus
  assigneeIds: string[]
  predecessors: Dependency[]
}

export interface AuthUser extends User {}

export interface AuthState {
  token: string | null
  user: AuthUser | null
  teams: Team[]
  activeTeamId: string | null
}
