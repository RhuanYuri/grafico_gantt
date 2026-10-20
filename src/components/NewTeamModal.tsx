import { useState, useRef, useEffect, type FormEvent } from 'react'
import type { Team } from '../types'
import { api } from '../lib/api'

interface Props {
  onClose: () => void
  onTeamCreated: (team: Team) => void
}

export function NewTeamModal({ onClose, onTeamCreated }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const cleanName = name.trim()
    if (!cleanName) return

    setError(null)
    setLoading(true)
    try {
      const created = await api.createTeam(cleanName)
      onTeamCreated(created)
      onClose()
    } catch (err) {
      setError((err as Error).message || 'Falha ao criar equipe.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <dialog ref={dialogRef} className="modal" onCancel={onClose} onClose={onClose} aria-labelledby="new-team-title">
      <form onSubmit={handleSubmit} className="modal-content">
        <div className="modal-header">
          <div>
            <h2 id="new-team-title">Criar Nova Equipe</h2>
            <p className="modal-desc">Inicie um novo projeto e adicione colaboradores.</p>
          </div>
          <button type="button" className="btn-close" onClick={onClose} aria-label="Fechar">✕</button>
        </div>

        {error && (
          <div className="banner error-banner" role="alert">
            <span>⚠️ {error}</span>
          </div>
        )}

        <label className="auth-field">
          <span>Nome da Equipe</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Sistemas Operacionais, Banco de Dados, etc."
            required
            autoFocus
            disabled={loading}
          />
        </label>

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={loading || !name.trim()}>
            {loading ? 'Criando…' : 'Criar Equipe'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
