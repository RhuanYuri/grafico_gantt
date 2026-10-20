import { useState, useRef, useEffect, type FormEvent } from 'react'
import type { Team, User } from '../types'
import { api } from '../lib/api'
import { Avatar } from './Avatar'

interface Props {
  team: Team
  members: User[]
  currentUserId: string
  onClose: () => void
  onMembersUpdated: (updatedMembers: User[]) => void
}

export function TeamModal({ team, members, currentUserId, onClose, onMembersUpdated }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [emailToAdd, setEmailToAdd] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  const handleAddMember = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    const cleanEmail = emailToAdd.trim()
    if (!cleanEmail) return

    setLoading(true)
    try {
      const res = await api.addTeamMember(team.id, cleanEmail)
      setSuccess(`${res.addedUser.name} (${res.addedUser.email}) foi adicionado(a) à equipe!`)
      setEmailToAdd('')
      onMembersUpdated(res.members)
    } catch (err) {
      setError((err as Error).message || 'Falha ao adicionar membro.')
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveMember = async (member: User) => {
    if (!window.confirm(`Remover ${member.name} da equipe "${team.name}"?`)) return
    setError(null)
    setSuccess(null)
    setLoading(true)
    try {
      await api.removeTeamMember(team.id, member.id)
      const nextMembers = members.filter((m) => m.id !== member.id)
      onMembersUpdated(nextMembers)
      setSuccess(`${member.name} foi removido(a) da equipe.`)
    } catch (err) {
      setError((err as Error).message || 'Falha ao remover membro.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <dialog ref={dialogRef} className="modal team-modal" onCancel={onClose} onClose={onClose} aria-labelledby="team-modal-title">
      <div className="modal-content">
        <div className="modal-header">
          <div>
            <h2 id="team-modal-title">Equipe: {team.name}</h2>
            <p className="modal-desc">
              Gerencie os membros com acesso ao cronograma desta equipe.
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

        <section className="team-section add-member-section">
          <h3>Adicionar Membro à Equipe</h3>
          <p className="field-hint">
            Basta digitar o e-mail do usuário cadastrado na base. A inclusão é imediata, sem necessidade de confirmação.
          </p>
          <form onSubmit={handleAddMember} className="inline-add-form">
            <input
              type="email"
              value={emailToAdd}
              onChange={(e) => setEmailToAdd(e.target.value)}
              placeholder="Digite o e-mail (ex: raynara@ufma.br)"
              required
              disabled={loading}
              className="input-fluid"
            />
            <button type="submit" className="btn primary" disabled={loading || !emailToAdd.trim()}>
              {loading ? 'Adicionando…' : '+ Adicionar à Equipe'}
            </button>
          </form>
        </section>

        <section className="team-section members-list-section">
          <h3>Membros Atuais ({members.length})</h3>
          <div className="members-grid">
            {members.map((m) => (
              <div key={m.id} className="member-card">
                <Avatar user={m} size={36} />
                <div className="member-info">
                  <div className="member-name-row">
                    <strong>{m.name}</strong>
                    {m.id === currentUserId && <span className="you-badge">Você</span>}
                  </div>
                  <span className="member-email">{m.email || 'Sem e-mail'}</span>
                </div>
                {members.length > 1 && (
                  <button
                    type="button"
                    className="btn ghost danger-text"
                    title={`Remover ${m.name} da equipe`}
                    onClick={() => handleRemoveMember(m)}
                    disabled={loading}
                  >
                    Remover
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Concluir
          </button>
        </div>
      </div>
    </dialog>
  )
}
