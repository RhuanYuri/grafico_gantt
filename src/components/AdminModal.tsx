import { useState, useRef, useEffect, type FormEvent } from 'react'
import type { AdminUser, User, Team } from '../types'
import { api } from '../lib/api'
import { Avatar } from './Avatar'

interface Props {
  currentUserId: string
  onClose: () => void
  onImpersonate: (user: User, teams: Team[], activeTeamId: string | null) => void
}

export function AdminModal({ currentUserId, onClose, onImpersonate }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Estado para alteração de senha
  const [passwordTargetUser, setPasswordTargetUser] = useState<AdminUser | null>(null)
  const [newPassword, setNewPassword] = useState('')

  // Estado para edição cadastral
  const [editTargetUser, setEditTargetUser] = useState<AdminUser | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')

  useEffect(() => {
    dialogRef.current?.showModal()
    loadUsers()
  }, [])

  const loadUsers = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getAdminUsers()
      setUsers(data)
    } catch (err) {
      setError((err as Error).message || 'Falha ao carregar usuários.')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenPasswordModal = (user: AdminUser) => {
    setPasswordTargetUser(user)
    setNewPassword('12345678')
    setError(null)
    setSuccess(null)
  }

  const handleSavePassword = async (e: FormEvent) => {
    e.preventDefault()
    if (!passwordTargetUser) return

    if (!newPassword || newPassword.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.')
      return
    }

    setActionLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await api.adminChangePassword(passwordTargetUser.id, newPassword)
      setSuccess(res.message || `Senha de ${passwordTargetUser.name} alterada com sucesso!`)
      setPasswordTargetUser(null)
      setNewPassword('')
    } catch (err) {
      setError((err as Error).message || 'Falha ao alterar senha.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleOpenEditModal = (user: AdminUser) => {
    setEditTargetUser(user)
    setEditName(user.name)
    setEditEmail(user.email)
    setError(null)
    setSuccess(null)
  }

  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault()
    if (!editTargetUser) return

    setActionLoading(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await api.adminUpdateUser(editTargetUser.id, {
        name: editName,
        email: editEmail,
      })
      setSuccess(`Dados de ${res.user.name} atualizados com sucesso!`)
      setEditTargetUser(null)
      await loadUsers()
    } catch (err) {
      setError((err as Error).message || 'Falha ao atualizar dados do usuário.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleImpersonate = async (user: AdminUser) => {
    if (!window.confirm(`Entrar na conta de ${user.name} (${user.email})?\n\nVocê visualizará o sistema exatamente como este usuário e poderá retornar à conta Master a qualquer momento.`)) {
      return
    }

    setActionLoading(true)
    setError(null)
    try {
      const authData = await api.adminImpersonate(user.id)
      onImpersonate(authData.user, authData.teams, authData.activeTeamId)
      onClose()
    } catch (err) {
      setError((err as Error).message || 'Falha ao acessar conta do usuário.')
      setActionLoading(false)
    }
  }

  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase().trim()
    if (!q) return true
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.id.toLowerCase().includes(q)
    )
  })

  return (
    <dialog
      ref={dialogRef}
      className="modal admin-modal"
      onCancel={onClose}
      onClose={onClose}
      aria-labelledby="admin-modal-title"
    >
      <div className="modal-content admin-modal-content">
        <div className="modal-header">
          <div>
            <div className="modal-title-with-badge">
              <span className="master-icon" aria-hidden="true">🛡️</span>
              <h2 id="admin-modal-title">Painel Master do Sistema</h2>
              <span className="badge master-pill">Produção</span>
            </div>
            <p className="modal-desc">
              Gerencie todas as contas, altere senhas de usuários e acesse qualquer conta diretamente para suporte.
            </p>
          </div>
          <button type="button" className="btn-close" onClick={onClose} aria-label="Fechar">✕</button>
        </div>

        {error && (
          <div className="banner error-banner" role="alert">
            <span>⚠️ {error}</span>
          </div>
        )}

        {success && (
          <div className="banner success-banner" role="status">
            <span>✓ {success}</span>
          </div>
        )}

        {/* Estatísticas Rápidas */}
        <div className="admin-stats-grid">
          <div className="stat-card">
            <span className="stat-value">{users.length}</span>
            <span className="stat-label">Total de Usuários</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{users.filter((u) => u.isMaster).length}</span>
            <span className="stat-label">Administradores Master</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{users.filter((u) => !u.isMaster).length}</span>
            <span className="stat-label">Usuários Comuns</span>
          </div>
        </div>

        {/* Barra de Pesquisa */}
        <div className="admin-search-bar">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, e-mail ou identificador…"
            className="search-input"
          />
          {search && (
            <button type="button" className="btn ghost" onClick={() => setSearch('')}>
              Limpar
            </button>
          )}
        </div>

        {/* Lista de Usuários */}
        <div className="admin-users-table-container">
          {loading ? (
            <div className="loading-state">
              <span className="spinner" aria-hidden="true">⌛</span>
              <p>Carregando usuários do sistema…</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <p className="empty-message">Nenhum usuário corresponde aos critérios de busca.</p>
          ) : (
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>E-mail</th>
                  <th>Privilégio</th>
                  <th>Equipes</th>
                  <th style={{ textAlign: 'right' }}>Ações Administrativas</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => {
                  const isCurrent = u.id === currentUserId
                  return (
                    <tr key={u.id} className={u.isMaster ? 'master-row' : ''}>
                      <td>
                        <div className="user-info-cell">
                          <Avatar user={u} size={32} />
                          <div>
                            <strong className="user-name">{u.name}</strong>
                            {isCurrent && <span className="you-pill">Você</span>}
                            <span className="user-id-sub">ID: {u.id}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="email-badge">{u.email}</span>
                      </td>
                      <td>
                        {u.isMaster ? (
                          <span className="role-tag master-tag">🛡️ Master</span>
                        ) : (
                          <span className="role-tag user-tag">Membro</span>
                        )}
                      </td>
                      <td>
                        <div className="user-teams-cell">
                          {u.teams && u.teams.length > 0 ? (
                            u.teams.map((t) => (
                              <span key={t.id} className="team-subtag" title={`Papel: ${t.role}`}>
                                {t.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-muted">Sem equipes</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="admin-actions-cell">
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => handleOpenPasswordModal(u)}
                            disabled={actionLoading}
                            title="Definir nova senha para este usuário"
                          >
                            🔑 Senha
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => handleOpenEditModal(u)}
                            disabled={actionLoading}
                            title="Editar dados cadastrais"
                          >
                            ✏️ Editar
                          </button>
                          {!isCurrent && (
                            <button
                              type="button"
                              className="btn btn-sm primary impersonate-btn"
                              onClick={() => handleImpersonate(u)}
                              disabled={actionLoading}
                              title="Acessar o sistema diretamente com a conta deste usuário"
                            >
                              👤 Acessar Conta
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Sub-modal: Alterar Senha */}
        {passwordTargetUser && (
          <div className="sub-modal-backdrop" onClick={() => setPasswordTargetUser(null)}>
            <div className="sub-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="sub-modal-header">
                <h3>Alterar Senha de {passwordTargetUser.name}</h3>
                <button type="button" className="btn-close" onClick={() => setPasswordTargetUser(null)}>✕</button>
              </div>
              <p className="modal-desc">
                Digite a nova senha de acesso para o e-mail <strong>{passwordTargetUser.email}</strong>.
              </p>
              <form onSubmit={handleSavePassword}>
                <div className="form-group">
                  <label htmlFor="admin-new-password">Nova Senha:</label>
                  <input
                    id="admin-new-password"
                    type="text"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres (padrão: 12345678)"
                    required
                    minLength={6}
                    autoFocus
                  />
                  <small className="field-hint">
                    Dica: Você pode redefinir para a senha padrão <code>12345678</code> ou qualquer outra senha segura.
                  </small>
                </div>
                <div className="sub-modal-actions">
                  <button type="button" className="btn" onClick={() => setPasswordTargetUser(null)} disabled={actionLoading}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn primary" disabled={actionLoading}>
                    {actionLoading ? 'Salvando…' : 'Salvar Nova Senha'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Sub-modal: Editar Dados Cadastrais */}
        {editTargetUser && (
          <div className="sub-modal-backdrop" onClick={() => setEditTargetUser(null)}>
            <div className="sub-modal-content" onClick={(e) => e.stopPropagation()}>
              <div className="sub-modal-header">
                <h3>Editar Dados de {editTargetUser.name}</h3>
                <button type="button" className="btn-close" onClick={() => setEditTargetUser(null)}>✕</button>
              </div>
              <form onSubmit={handleSaveEdit}>
                <div className="form-group">
                  <label htmlFor="admin-edit-name">Nome Completo:</label>
                  <input
                    id="admin-edit-name"
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="admin-edit-email">E-mail (deve ser único):</label>
                  <input
                    id="admin-edit-email"
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="sub-modal-actions">
                  <button type="button" className="btn" onClick={() => setEditTargetUser(null)} disabled={actionLoading}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn primary" disabled={actionLoading}>
                    {actionLoading ? 'Salvando…' : 'Atualizar Usuário'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn primary" onClick={onClose}>
            Fechar Painel
          </button>
        </div>
      </div>
    </dialog>
  )
}
