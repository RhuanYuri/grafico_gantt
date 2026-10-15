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
  color: string
  avatarUrl?: string
}

export interface Task {
  id: string
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
