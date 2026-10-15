import type { Task, User } from '../types'
import { STATUS_STYLE } from '../theme'
import { durationDays, formatBR } from '../lib/dates'
import { Avatar } from './Avatar'
import { StatusIcon } from './StatusIcon'

interface Props {
  task: Task
  tasks: Task[]
  users: User[]
  onEdit: () => void
  onRemove: () => void
  onClose: () => void
  onSelect: (id: string) => void
}

export function TaskDetails({ task, tasks, users, onEdit, onRemove, onClose, onSelect }: Props) {
  const st = STATUS_STYLE[task.status]
  const assignees = task.assigneeIds.map((id) => users.find((u) => u.id === id)).filter((u): u is User => !!u)
  const preds = task.predecessors.map((p) => tasks.find((t) => t.id === p.taskId)).filter((t): t is Task => !!t)
  const succs = tasks.filter((t) => t.predecessors.some((p) => p.taskId === task.id))
  const conflicts = preds.filter((p) => p.end >= task.start)

  return (
    <aside className="details" aria-label="Detalhes da tarefa">
      <header>
        <span className="badge" style={{ color: st.solid, background: st.bar + '88' }}>
          <StatusIcon status={task.status} size={14} /> {st.label}
        </span>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar detalhes">×</button>
      </header>
      <h2>{task.title}</h2>
      {task.description && <p className="desc">{task.description}</p>}
      <dl>
        <dt>Início</dt>
        <dd>{formatBR(task.start)}</dd>
        <dt>Término</dt>
        <dd>{formatBR(task.end)}</dd>
        <dt>Duração</dt>
        <dd>{durationDays(task.start, task.end)} dias</dd>
      </dl>
      <h3>Responsáveis</h3>
      <ul className="people">
        {assignees.length === 0 && <li className="muted">Ninguém atribuído</li>}
        {assignees.map((u) => (
          <li key={u.id}>
            <Avatar user={u} size={26} /> {u.name}
          </li>
        ))}
      </ul>
      <h3>Predecessoras</h3>
      <ul className="links">
        {preds.length === 0 && <li className="muted">Nenhuma</li>}
        {preds.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => onSelect(p.id)}>{p.title}</button>
          </li>
        ))}
      </ul>
      {conflicts.length > 0 && (
        <p className="warn" role="alert">
          ⚠ Esta tarefa começa antes do término de: {conflicts.map((c) => c.title).join('; ')}.
        </p>
      )}
      <h3>Sucessoras</h3>
      <ul className="links">
        {succs.length === 0 && <li className="muted">Nenhuma</li>}
        {succs.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => onSelect(s.id)}>{s.title}</button>
          </li>
        ))}
      </ul>
      <footer>
        <button type="button" className="btn" onClick={onEdit}>Editar</button>
        <button type="button" className="btn danger" onClick={onRemove}>Remover</button>
      </footer>
    </aside>
  )
}
