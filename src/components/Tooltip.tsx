import type { Task, User } from '../types'
import { STATUS_STYLE } from '../theme'
import { durationDays, formatBR } from '../lib/dates'

interface Props {
  task: Task
  users: User[]
  tasks: Task[]
  x: number
  y: number
}

export function Tooltip({ task, users, tasks, x, y }: Props) {
  const st = STATUS_STYLE[task.status]
  const people = task.assigneeIds.map((id) => users.find((u) => u.id === id)?.name).filter(Boolean)
  const preds = task.predecessors.map((p) => tasks.find((t) => t.id === p.taskId)?.title).filter(Boolean)
  const left = Math.min(x + 14, window.innerWidth - 300)
  const top = Math.min(y + 14, window.innerHeight - 220)
  return (
    <div className="tooltip" style={{ left, top }} role="tooltip">
      <div className="tooltip-title">{task.title}</div>
      <div className="tooltip-status" style={{ color: st.solid }}>
        ● {st.label}
      </div>
      <dl>
        <dt>Período</dt>
        <dd>
          {formatBR(task.start)} → {formatBR(task.end)} ({durationDays(task.start, task.end)} dias)
        </dd>
        <dt>Responsáveis</dt>
        <dd>{people.join(', ') || '—'}</dd>
        {preds.length > 0 && (
          <>
            <dt>Depende de</dt>
            <dd>{preds.join('; ')}</dd>
          </>
        )}
      </dl>
      {task.description && <p>{task.description}</p>}
    </div>
  )
}
