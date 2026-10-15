import type { BarLayout } from '../lib/layout'
import { ROW_H } from '../lib/layout'
import { StatusIcon } from './StatusIcon'

interface Props {
  projectTitle: string
  bars: BarLayout[]
  selectedId: string | null
  hoverId: string | null
  onSelect: (id: string) => void
  onOpen: (id: string) => void
  onHover: (id: string | null) => void
}

export function TaskList({ projectTitle, bars, selectedId, hoverId, onSelect, onOpen, onHover }: Props) {
  return (
    <div className="task-list" role="list" aria-label="Lista de tarefas">
      <div className="task-row project-row" style={{ height: ROW_H }}>
        <strong>{projectTitle}</strong>
      </div>
      {bars.map(({ task }) => (
        <button
          key={task.id}
          role="listitem"
          type="button"
          className={`task-row${selectedId === task.id ? ' selected' : ''}${hoverId === task.id ? ' hover' : ''}`}
          style={{ height: ROW_H }}
          title={task.title}
          onClick={() => onSelect(task.id)}
          onDoubleClick={() => onOpen(task.id)}
          onMouseEnter={() => onHover(task.id)}
          onMouseLeave={() => onHover(null)}
        >
          <StatusIcon status={task.status} />
          <span className="task-title">{task.title}</span>
        </button>
      ))}
    </div>
  )
}
