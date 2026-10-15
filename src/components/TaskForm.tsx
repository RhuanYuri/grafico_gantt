import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { Task, TaskStatus, User } from '../types'
import { STATUS_STYLE } from '../theme'
import { shiftISO, todayISO } from '../lib/dates'
import { eligiblePredecessors } from '../lib/tasks'
import { Avatar } from './Avatar'

interface Props {
  /** null = nova tarefa */
  task: Task | null
  tasks: Task[]
  users: User[]
  onSave: (task: Task) => void
  onCancel: () => void
}

export function TaskForm({ task, tasks, users, onSave, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [start, setStart] = useState(task?.start ?? todayISO())
  const [end, setEnd] = useState(task?.end ?? shiftISO(todayISO(), 4))
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'pending')
  const [assignees, setAssignees] = useState<string[]>(task?.assigneeIds ?? [])
  const [preds, setPreds] = useState<string[]>(task?.predecessors.map((p) => p.taskId) ?? [])
  const options = eligiblePredecessors(tasks, task?.id ?? null)
  const invalidRange = end < start

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (invalidRange || !title.trim()) return
    onSave({
      id: task?.id ?? `t-${Date.now().toString(36)}`,
      title: title.trim(),
      description: description.trim(),
      start,
      end,
      status,
      assigneeIds: assignees,
      predecessors: preds.map((taskId) => ({ taskId, type: 'FS' as const })),
    })
  }

  return (
    <dialog ref={ref} className="modal" onCancel={onCancel} onClose={onCancel} aria-labelledby="form-title">
      <form onSubmit={submit}>
        <h2 id="form-title">{task ? 'Editar tarefa' : 'Nova tarefa'}</h2>
        <label>
          Título
          <input value={title} onChange={(e) => setTitle(e.target.value)} required autoFocus />
        </label>
        <label>
          Descrição
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </label>
        <div className="row">
          <label>
            Início
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
          </label>
          <label>
            Término
            <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required aria-invalid={invalidRange} />
          </label>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
              {(Object.keys(STATUS_STYLE) as TaskStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_STYLE[s].label}</option>
              ))}
            </select>
          </label>
        </div>
        {invalidRange && <p className="warn" role="alert">O término não pode ser anterior ao início.</p>}
        <fieldset>
          <legend>Responsáveis</legend>
          <div className="chips">
            {users.map((u) => (
              <label key={u.id} className={`chip${assignees.includes(u.id) ? ' on' : ''}`}>
                <input type="checkbox" checked={assignees.includes(u.id)} onChange={() => toggle(assignees, setAssignees, u.id)} />
                <Avatar user={u} size={20} /> {u.name}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Predecessoras (término → início)</legend>
          <div className="chips">
            {options.length === 0 && <span className="muted">Nenhuma tarefa disponível</span>}
            {options.map((t) => (
              <label key={t.id} className={`chip${preds.includes(t.id) ? ' on' : ''}`}>
                <input type="checkbox" checked={preds.includes(t.id)} onChange={() => toggle(preds, setPreds, t.id)} />
                {t.title}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="form-actions">
          <button type="button" className="btn" onClick={() => ref.current?.close()}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={invalidRange || !title.trim()}>Salvar</button>
        </div>
      </form>
    </dialog>
  )
}
