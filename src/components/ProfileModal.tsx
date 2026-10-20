import { useState, useRef, useEffect, type FormEvent } from 'react'
import type { User } from '../types'
import { api } from '../lib/api'
import { Avatar } from './Avatar'

interface Props {
  user: User
  onClose: () => void
  onUserUpdated: (updatedUser: User) => void
}

const PALETTE = ['#2f6fe0', '#7b4fd6', '#e8772e', '#14919b', '#c2417a', '#10b981', '#f59e0b', '#6366f1']

export function ProfileModal({ user, onClose, onUserUpdated }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [color, setColor] = useState(user.color)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    const cleanName = name.trim()
    const cleanEmail = email.trim()

    if (!cleanName) {
      setError('O nome não pode estar em branco.')
      return
    }

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Informe um e-mail válido.')
      return
    }

    setLoading(true)
    try {
      const payload: { name: string; email: string; color: string; password?: string } = {
        name: cleanName,
        email: cleanEmail,
        color,
      }
      if (password.trim()) {
        if (password.length < 6) {
          setError('A nova senha deve ter no mínimo 6 caracteres.')
          setLoading(false)
          return
        }
        payload.password = password
      }

      const res = await api.updateProfile(payload)
      setSuccess('Perfil atualizado com sucesso!')
      onUserUpdated(res.user)
      setPassword('')
    } catch (err) {
      setError((err as Error).message || 'Falha ao atualizar perfil.')
    } finally {
      setLoading(false)
    }
  }

  // Objeto temporário para preview em tempo real do avatar
  const previewUser: User = {
    ...user,
    name: name || user.name,
    color,
    email: email || user.email,
  }

  return (
    <dialog ref={dialogRef} className="modal profile-modal" onCancel={onClose} onClose={onClose} aria-labelledby="profile-title">
      <form onSubmit={handleSubmit} className="modal-content">
        <div className="modal-header">
          <div>
            <h2 id="profile-title">Meu Perfil</h2>
            <p className="modal-desc">Atualize seus dados pessoais e credenciais de acesso.</p>
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

        <div className="profile-preview-card">
          <Avatar user={previewUser} size={52} />
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>{previewUser.name}</h3>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--muted)' }}>{previewUser.email}</p>
          </div>
        </div>

        <label className="auth-field">
          <span>Nome Completo</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={loading}
          />
        </label>

        <label className="auth-field">
          <div className="auth-field-header">
            <span>E-mail de Acesso</span>
            <span className="auth-hint-text">Deve ser único no sistema</span>
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />
        </label>

        <label className="auth-field">
          <span>Cor do Avatar</span>
          <div className="color-palette-row">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                className={`color-dot ${color === c ? 'selected' : ''}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                aria-label={`Cor ${c}`}
              />
            ))}
          </div>
        </label>

        <label className="auth-field">
          <div className="auth-field-header">
            <span>Nova Senha</span>
            <span className="auth-hint-text">Deixe em branco para manter a atual</span>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Digite caso queira alterar sua senha"
            disabled={loading}
          />
        </label>

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button type="submit" className="btn primary" disabled={loading}>
            {loading ? 'Salvando…' : 'Salvar Alterações'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
