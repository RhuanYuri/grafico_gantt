import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Task, User, Team } from './types'
import { GanttChart } from './components/GanttChart'
import { TaskDetails } from './components/TaskDetails'
import { TaskForm } from './components/TaskForm'
import { ExportModal } from './components/ExportModal'
import { AuthScreen } from './components/AuthScreen'
import { TeamModal } from './components/TeamModal'
import { ProfileModal } from './components/ProfileModal'
import { NewTeamModal } from './components/NewTeamModal'
import { Avatar } from './components/Avatar'
import { computeLayout, computeRange } from './lib/layout'
import { todayDay } from './lib/dates'
import { moveTask, removeTask, upsertTask } from './lib/tasks'
import { exportChartToPng, type ExportConfig } from './lib/exportPng'
import { api, getToken, setToken, getStoredActiveTeamId, setStoredActiveTeamId, type AuthResponse } from './lib/api'
import { STATUS_STYLE } from './theme'

const ZOOM_LEVELS = [5, 8, 12, 18, 28, 40, 60]
const DEFAULT_ZOOM = 4

type Editing = { task: Task | null } | null

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [activeTeamId, setActiveTeamId] = useState<string | null>(getStoredActiveTeamId())
  const [checkingAuth, setCheckingAuth] = useState(true)

  const [tasks, setTasks] = useState<Task[]>([])
  const [teamUsers, setTeamUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [drag, setDrag] = useState<{ id: string; delta: number } | null>(null)
  const [editing, setEditing] = useState<Editing>(null)
  const [todayToken, setTodayToken] = useState(0)
  const [exportModalOpen, setExportModalOpen] = useState(false)

  // Modais de Equipe e Perfil
  const [teamModalOpen, setTeamModalOpen] = useState(false)
  const [profileModalOpen, setProfileModalOpen] = useState(false)
  const [newTeamModalOpen, setNewTeamModalOpen] = useState(false)
  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const today = useMemo(todayDay, [])

  // 1. Verificação de autenticação ao carregar
  useEffect(() => {
    const initAuth = async () => {
      const token = getToken()
      if (!token) {
        setCheckingAuth(false)
        return
      }
      try {
        const res = await api.getMe()
        setCurrentUser(res.user)
        setTeams(res.teams)
        const targetTeamId = activeTeamId && res.teams.some((t) => t.id === activeTeamId)
          ? activeTeamId
          : res.activeTeamId ?? res.teams[0]?.id ?? null
        setActiveTeamId(targetTeamId)
        setStoredActiveTeamId(targetTeamId)
      } catch {
        api.logout()
        setCurrentUser(null)
      } finally {
        setCheckingAuth(false)
      }
    }
    void initAuth()
  }, [])

  // 2. Carregar dados da equipe ativa
  const loadTeamData = useCallback(async (teamId: string) => {
    setLoading(true)
    try {
      const s = await api.getTeamState(teamId)
      setTasks(s.tasks)
      setTeamUsers(s.users)
      setError(null)
    } catch (e) {
      setError(`Não foi possível carregar os dados da equipe (${(e as Error).message}).`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (currentUser && activeTeamId) {
      void loadTeamData(activeTeamId)
    }
  }, [currentUser, activeTeamId, loadTeamData])

  const handleAuthSuccess = (data: AuthResponse) => {
    setToken(data.token)
    setCurrentUser(data.user)
    setTeams(data.teams)
    const targetTeamId = data.activeTeamId ?? data.teams[0]?.id ?? null
    setActiveTeamId(targetTeamId)
    setStoredActiveTeamId(targetTeamId)
  }

  const handleLogout = () => {
    api.logout()
    setCurrentUser(null)
    setTeams([])
    setActiveTeamId(null)
    setTasks([])
    setTeamUsers([])
    setUserMenuOpen(false)
    setTeamDropdownOpen(false)
  }

  const handleSelectTeam = (teamId: string) => {
    setActiveTeamId(teamId)
    setStoredActiveTeamId(teamId)
    setTeamDropdownOpen(false)
    setSelectedId(null)
  }

  const handleTeamCreated = (team: Team) => {
    setTeams((prev) => [...prev, team])
    setActiveTeamId(team.id)
    setStoredActiveTeamId(team.id)
    setSelectedId(null)
  }

  /** Atualização otimista com persistência no Postgres; recarrega o estado em caso de falha. */
  const persist = useCallback(
    (next: Task[], op: Promise<unknown>) => {
      setTasks(next)
      op.catch((e: Error) => {
        setError(`Falha ao salvar no banco: ${e.message}`)
        if (activeTeamId) void loadTeamData(activeTeamId)
      })
    },
    [activeTeamId, loadTeamData],
  )

  const activeTeam = useMemo(
    () => teams.find((t) => t.id === activeTeamId) ?? null,
    [teams, activeTeamId],
  )

  const currentProjectTitle = activeTeam ? activeTeam.name : 'Gráfico de Gantt'

  // O intervalo é calculado das tarefas reais, para não "pular" durante o arraste.
  const range = useMemo(() => computeRange(tasks, today), [tasks, today])
  const displayTasks = useMemo(
    () => (drag ? tasks.map((t) => (t.id === drag.id ? moveTask(t, drag.delta) : t)) : tasks),
    [tasks, drag],
  )
  const layout = useMemo(
    () => computeLayout(displayTasks, teamUsers, range, ZOOM_LEVELS[zoom], today),
    [displayTasks, teamUsers, range, zoom, today],
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
    persist(upsertTask(tasks, updated), api.saveTask(updated, activeTeamId ?? undefined))
  }

  const handleReset = async () => {
    if (!activeTeamId) return
    if (!window.confirm(`Restaurar os dados da equipe "${currentProjectTitle}"? As alterações não salvas serão substituídas pelas tarefas padrão.`)) return
    try {
      const s = await api.resetTeam(activeTeamId)
      setTasks(s.tasks)
      setTeamUsers(s.users)
      setSelectedId(null)
    } catch (e) {
      setError(`Falha ao restaurar: ${(e as Error).message}`)
    }
  }

  if (checkingAuth) {
    return (
      <div className="auth-overlay">
        <div className="loading-card">
          <span className="logo spin-logo" aria-hidden="true">▤</span>
          <p>Carregando sistema…</p>
        </div>
      </div>
    )
  }

  if (!currentUser) {
    return <AuthScreen onSuccess={handleAuthSuccess} />
  }

  return (
    <div className="app">
      <header className="topbar">
        {/* Marca e Seleção de Equipe */}
        <div className="brand-group">
          <div className="brand">
            <span className="logo" aria-hidden="true">▤</span>
            <div>
              <div className="project-title-row">
                <h1>{currentProjectTitle}</h1>
                {/* Seletor Dropdown de Equipes */}
                <div className="team-dropdown-container">
                  <button
                    type="button"
                    className="team-selector-btn"
                    onClick={() => { setTeamDropdownOpen((v) => !v); setUserMenuOpen(false) }}
                    title="Alternar equipe"
                    aria-expanded={teamDropdownOpen}
                  >
                    <span className="team-pill-badge">Equipe</span>
                    <span className="dropdown-caret">▾</span>
                  </button>

                  {teamDropdownOpen && (
                    <div className="dropdown-menu team-menu" onMouseLeave={() => setTeamDropdownOpen(false)}>
                      <div className="dropdown-header">Minhas Equipes</div>
                      <div className="team-options-list">
                        {teams.map((tm) => (
                          <button
                            key={tm.id}
                            type="button"
                            className={`dropdown-item team-option ${tm.id === activeTeamId ? 'active' : ''}`}
                            onClick={() => handleSelectTeam(tm.id)}
                          >
                            <span className="team-item-name">{tm.name}</span>
                            {tm.id === activeTeamId && <span className="check-mark">✓</span>}
                          </button>
                        ))}
                      </div>
                      <div className="dropdown-divider" />
                      <button
                        type="button"
                        className="dropdown-item new-team-item"
                        onClick={() => {
                          setTeamDropdownOpen(false)
                          setNewTeamModalOpen(true)
                        }}
                      >
                        + Criar nova equipe
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <p className="subtitle-text">
                {tasks.length} {tasks.length === 1 ? 'tarefa' : 'tarefas'} · {teamUsers.length} {teamUsers.length === 1 ? 'membro' : 'membros'}
              </p>
            </div>
          </div>
        </div>

        {/* Botão de Membros da Equipe */}
        {activeTeam && (
          <button
            type="button"
            className="team-members-btn"
            onClick={() => setTeamModalOpen(true)}
            title="Gerenciar membros da equipe e adicionar colaboradores por e-mail"
          >
            <div className="avatar-stack">
              {teamUsers.slice(0, 3).map((u) => (
                <Avatar key={u.id} user={u} size={24} />
              ))}
              {teamUsers.length > 3 && (
                <span className="avatar-extra-count">+{teamUsers.length - 3}</span>
              )}
            </div>
            <span className="team-members-label">Membros ({teamUsers.length})</span>
            <span className="add-member-badge">+ Convidar</span>
          </button>
        )}

        {/* Legenda de Status */}
        <ul className="legend" aria-label="Legenda de status">
          {(['done', 'in_progress', 'pending'] as const).map((s) => (
            <li key={s}>
              <i style={{ background: STATUS_STYLE[s].bar, borderColor: STATUS_STYLE[s].barBorder }} />
              {STATUS_STYLE[s].label}
            </li>
          ))}
          <li><i className="today-key" />Hoje</li>
        </ul>

        {/* Ações Rápidas */}
        <div className="actions">
          <button type="button" className="btn" onClick={() => setTodayToken((n) => n + 1)}>Hoje</button>
          <button type="button" className="btn" onClick={() => setEditing({ task: null })} disabled={loading}>+ Nova tarefa</button>
          <button type="button" className="btn primary" onClick={() => setExportModalOpen(true)} disabled={loading}>
            Exportar gráfico
          </button>
          {activeTeamId === 'team-arq-comp' && (
            <button type="button" className="btn ghost" title="Restaurar dados padrão da disciplina" onClick={handleReset}>
              Restaurar dados
            </button>
          )}
        </div>

        {/* Menu do Usuário Logado */}
        <div className="user-profile-container">
          <button
            type="button"
            className="user-profile-btn"
            onClick={() => { setUserMenuOpen((v) => !v); setTeamDropdownOpen(false) }}
            title="Menu do usuário"
            aria-expanded={userMenuOpen}
          >
            <Avatar user={currentUser} size={30} />
            <span className="user-name-text">{currentUser.name.split(' ')[0]}</span>
            <span className="dropdown-caret">▾</span>
          </button>

          {userMenuOpen && (
            <div className="dropdown-menu user-menu" onMouseLeave={() => setUserMenuOpen(false)}>
              <div className="user-menu-header">
                <strong>{currentUser.name}</strong>
                <span className="user-menu-email">{currentUser.email}</span>
              </div>
              <div className="dropdown-divider" />
              <button
                type="button"
                className="dropdown-item"
                onClick={() => {
                  setUserMenuOpen(false)
                  setProfileModalOpen(true)
                }}
              >
                ⚙️ Meu Perfil & E-mail
              </button>
              <button
                type="button"
                className="dropdown-item danger-text"
                onClick={handleLogout}
              >
                🚪 Sair da Conta
              </button>
            </div>
          )}
        </div>
      </header>

      {error && (
        <div className="banner" role="alert">
          {error}
          {activeTeamId && (
            <button type="button" className="btn" onClick={() => void loadTeamData(activeTeamId)}>Tentar novamente</button>
          )}
        </div>
      )}

      <main className="workspace">
        {loading && tasks.length === 0 ? (
          <p className="loading">Carregando tarefas…</p>
        ) : (
          <GanttChart
            projectTitle={currentProjectTitle}
            tasks={displayTasks}
            users={teamUsers}
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
            users={teamUsers}
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
          users={teamUsers}
          onCancel={() => setEditing(null)}
          onSave={(t) => {
            const taskWithTeam = { ...t, teamId: activeTeamId ?? undefined }
            persist(upsertTask(tasks, taskWithTeam), api.saveTask(taskWithTeam, activeTeamId ?? undefined))
            setSelectedId(t.id)
            setEditing(null)
          }}
        />
      )}

      {exportModalOpen && (
        <ExportModal
          projectTitle={currentProjectTitle}
          tasks={tasks}
          users={teamUsers}
          currentLayout={layout}
          onExport={async (config: ExportConfig) => {
            await exportChartToPng({
              title: currentProjectTitle,
              tasks,
              users: teamUsers,
              currentLayout: layout,
              config,
            })
          }}
          onClose={() => setExportModalOpen(false)}
        />
      )}

      {teamModalOpen && activeTeam && (
        <TeamModal
          team={activeTeam}
          members={teamUsers}
          currentUserId={currentUser.id}
          onClose={() => setTeamModalOpen(false)}
          onMembersUpdated={(updated) => {
            setTeamUsers(updated)
            // Atualiza contagem na lista de equipes
            setTeams((prev) =>
              prev.map((t) => (t.id === activeTeam.id ? { ...t, memberCount: updated.length } : t)),
            )
          }}
        />
      )}

      {profileModalOpen && (
        <ProfileModal
          user={currentUser}
          onClose={() => setProfileModalOpen(false)}
          onUserUpdated={(updated) => {
            setCurrentUser(updated)
            // Atualiza usuário também na lista da equipe se estiver nela
            setTeamUsers((prev) =>
              prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)),
            )
          }}
        />
      )}

      {newTeamModalOpen && (
        <NewTeamModal
          onClose={() => setNewTeamModalOpen(false)}
          onTeamCreated={handleTeamCreated}
        />
      )}
    </div>
  )
}
