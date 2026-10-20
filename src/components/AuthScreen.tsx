import { useState, type FormEvent } from 'react'
import type { AuthResponse } from '../lib/api'
import { api } from '../lib/api'

interface Props {
  onSuccess: (data: AuthResponse) => void
}

export function AuthScreen({ onSuccess }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [color, setColor] = useState('#2f6fe0')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (mode === 'login') {
        const res = await api.login(email.trim(), password)
        onSuccess(res)
      } else {
        const res = await api.register(name.trim(), email.trim(), password, color)
        onSuccess(res)
      }
    } catch (err) {
      setError((err as Error).message || 'Falha ao autenticar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-overlay">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo" aria-hidden="true">▤</div>
          <h2>Cronograma Gantt</h2>
          <p className="auth-subtitle">Gestão de Projetos e Equipes · Arquitetura de Computadores</p>
        </div>

        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError(null) }}
          >
            Entrar
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'register'}
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => { setMode('register'); setError(null) }}
          >
            Cadastrar-se
          </button>
        </div>

        {error && (
          <div className="auth-error-banner" role="alert">
            <span className="auth-error-icon">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'register' && (
            <>
              <label className="auth-field">
                <span>Nome completo</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Maria Silva"
                  required
                  autoFocus
                />
              </label>

              <label className="auth-field">
                <span>Cor do seu perfil</span>
                <div className="color-palette-row">
                  {['#2f6fe0', '#7b4fd6', '#e8772e', '#14919b', '#c2417a', '#10b981', '#f59e0b', '#6366f1'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`color-dot ${color === c ? 'selected' : ''}`}
                      style={{ background: c }}
                      onClick={() => setColor(c)}
                      aria-label={`Selecionar cor ${c}`}
                    />
                  ))}
                </div>
              </label>
            </>
          )}

          <label className="auth-field">
            <span>E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu.email@exemplo.com"
              required
              autoFocus={mode === 'login'}
            />
          </label>

          <label className="auth-field">
            <span>Senha</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'Mínimo 6 caracteres' : 'Sua senha'}
              required
            />
          </label>

          <button type="submit" className="btn primary auth-submit-btn" disabled={loading}>
            {loading ? 'Processando…' : mode === 'login' ? 'Entrar no Sistema' : 'Criar Conta e Começar'}
          </button>
        </form>
      </div>
    </div>
  )
}
