import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Task, User } from './types'
import { GanttChart } from './components/GanttChart'
import { TaskDetails } from './components/TaskDetails'
import { TaskForm } from './components/TaskForm'
import { ExportModal } from './components/ExportModal'
import { PROJECT_TITLE } from './data/sampleData'
import { computeLayout, computeRange } from './lib/layout'
import { todayDay } from './lib/dates'
import { moveTask, removeTask, upsertTask } from './lib/tasks'
import { exportChartToPng, type ExportConfig } from './lib/exportPng'
import { api } from './lib/api'
import { STATUS_STYLE } from './theme'

const ZOOM_LEVELS = [5, 8, 12, 18, 28, 40, 60]
const DEFAULT_ZOOM = 4

type Editing = { task: Task | null } | null

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [drag, setDrag] = useState<{ id: string; delta: number } | null>(null)
  const [editing, setEditing] = useState<Editing>(null)
  const [todayToken, setTodayToken] = useState(0)
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const today = useMemo(todayDay, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const s = await api.getState()
      setTasks(s.tasks)
      setUsers(s.users)
      setError(null)
    } catch (e) {
      setError(`Não foi possível carregar os dados do banco (${(e as Error).message}). Verifique se o Postgres e a API estão rodando.`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /** Atualização otimista com persistência no Postgres; recarrega o estado em caso de falha. */
  const persist = useCallback(
    (next: Task[], op: Promise<unknown>) => {
      setTasks(next)
      op.catch((e: Error) => {
        setError(`Falha ao salvar no banco: ${e.message}`)
        void load()
      })
    },
    [load],
  )

  // O intervalo é calculado das tarefas reais, para não "pular" durante o arraste.
  const range = useMemo(() => computeRange(tasks, today), [tasks, today])
  const displayTasks = useMemo(
    () => (drag ? tasks.map((t) => (t.id === drag.id ? moveTask(t, drag.delta) : t)) : tasks),
    [tasks, drag],
  )
  const layout = useMemo(
    () => computeLayout(displayTasks, users, range, ZOOM_LEVELS[zoom], today),
    [displayTasks, users, range, zoom, today],
  )

  const onZoom = useCallback((dir: 1 | -1) => {
    setZoom((z) => Math.min(ZOOM_LEVELS.length - 1, Math.max(0, z + dir)))
  }, [])

  const selected = tasks.find((t) => t.id === selectedId) ?? null

  const handleRemove = (t: Task) => {
    if (!window.confirm(`Remover a tarefa "${t.title}"? As dependências ligadas a ela também serão removidas.`)) return
    persist(removeTask(tasks, t.id), api.deleteTask(t.id))
    setSelectedId(null)
  }

  const handleMove = (id: string, delta: number) => {
    const moved = tasks.find((t) => t.id === id)
    if (!moved) return
    const updated = moveTask(moved, delta)
    persist(upsertTask(tasks, updated), api.saveTask(updated))
  }

  const handleReset = async () => {
    if (!window.confirm('Restaurar os dados do projeto (conforme o relatório)? Suas alterações serão perdidas.')) return
    try {
      const s = await api.reset()
      setTasks(s.tasks)
      setUsers(s.users)
      setSelectedId(null)
    } catch (e) {
      setError(`Falha ao restaurar: ${(e as Error).message}`)
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">▤</span>
          <div>
            <h1>{PROJECT_TITLE}</h1>
            <p>Cronograma do projeto · {tasks.length} tarefas</p>
          </div>
        </div>
        <ul className="legend" aria-label="Legenda de status">
          {(['done', 'in_progress', 'pending'] as const).map((s) => (
            <li key={s}>
              <i style={{ background: STATUS_STYLE[s].bar, borderColor: STATUS_STYLE[s].barBorder }} />
              {STATUS_STYLE[s].label}
            </li>
          ))}
          <li><i className="today-key" />Hoje</li>
        </ul>
        <div className="actions">
          <button type="button" className="btn" onClick={() => setTodayToken((n) => n + 1)}>Hoje</button>
          <button type="button" className="btn" onClick={() => setEditing({ task: null })} disabled={loading}>+ Nova tarefa</button>
          <button type="button" className="btn primary" onClick={() => setExportModalOpen(true)} disabled={loading}>
            Exportar gráfico
          </button>
          <button type="button" className="btn ghost" title="Restaurar dados do relatório" onClick={handleReset}>
            Restaurar dados
          </button>
        </div>
      </header>

      {error && (
        <div className="banner" role="alert">
          {error}
          <button type="button" className="btn" onClick={() => void load()}>Tentar novamente</button>
        </div>
      )}

      <main className="workspace">
        {loading && tasks.length === 0 ? (
          <p className="loading">Carregando…</p>
        ) : (
          <GanttChart
            projectTitle={PROJECT_TITLE}
            tasks={displayTasks}
            users={users}
            layout={layout}
            selectedId={selectedId}
            scrollToTodayToken={todayToken}
            onSelect={setSelectedId}
            onOpen={(id) => setEditing({ task: tasks.find((t) => t.id === id) ?? null })}
            onDragPreview={setDrag}
            onMoveTask={handleMove}
            onZoom={onZoom}
          />
        )}
        {selected && (
          <TaskDetails
            task={selected}
            tasks={tasks}
            users={users}
            onEdit={() => setEditing({ task: selected })}
            onRemove={() => handleRemove(selected)}
            onClose={() => setSelectedId(null)}
            onSelect={setSelectedId}
          />
        )}
      </main>

      {editing && (
        <TaskForm
          key={editing.task?.id ?? 'new'}
          task={editing.task}
          tasks={tasks}
          users={users}
          onCancel={() => setEditing(null)}
          onSave={(t) => {
            persist(upsertTask(tasks, t), api.saveTask(t))
            setSelectedId(t.id)
            setEditing(null)
          }}
        />
      )}

      {exportModalOpen && (
        <ExportModal
          projectTitle={PROJECT_TITLE}
          tasks={tasks}
          users={users}
          currentLayout={layout}
          onExport={async (config: ExportConfig) => {
            await exportChartToPng({
              title: PROJECT_TITLE,
              tasks,
              users,
              currentLayout: layout,
              config,
            })
          }}
          onClose={() => setExportModalOpen(false)}
        />
      )}
    </div>
  )
}
