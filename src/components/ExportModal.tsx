import { useState } from 'react'
import type { Task, User } from '../types'
import type { ChartLayout } from '../lib/layout'
import {
  getExportLayout,
  type ExportConfig,
} from '../lib/exportPng'

interface Props {
  projectTitle: string
  tasks: Task[]
  users: User[]
  currentLayout: ChartLayout
  onExport: (config: ExportConfig) => Promise<void>
  onClose: () => void
}

export function ExportModal({
  tasks,
  users,
  currentLayout,
  onExport,
  onClose,
}: Props) {
  const [mode, setMode] = useState<ExportConfig['mode']>('optimized')
  const [scale, setScale] = useState<ExportConfig['scale']>(2)
  const [busy, setBusy] = useState(false)

  const preview = getExportLayout(tasks, users, currentLayout, { mode, scale })
  const baseW = preview.listW + preview.layout.timelineWidth
  const baseH = 76 + 56 + preview.layout.bodyHeight
  const finalW = Math.round(baseW * scale)
  const finalH = Math.round(baseH * scale)
  const ratio = (baseW / baseH).toFixed(1)

  const handleDownload = async () => {
    setBusy(true)
    try {
      await onExport({ mode, scale })
      onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog className="modal" open aria-labelledby="export-modal-title">
      <div className="modal-content">
        <h2 id="export-modal-title">Exportar Gráfico de Gantt em PNG</h2>
        <p className="modal-subtitle">
          Gera uma imagem nítida de alta resolução preservando todas as tarefas, conectores e datas.
        </p>

        <div className="export-options">
          <div className="option-group">
            <span className="option-group-title">Enquadramento do Gráfico</span>
            <label className={`option-card ${mode === 'optimized' ? 'active' : ''}`}>
              <input
                type="radio"
                name="export-mode"
                checked={mode === 'optimized'}
                onChange={() => setMode('optimized')}
              />
              <div className="option-card-body">
                <strong>Otimizado para Relatório / Apresentação (Recomendado)</strong>
                <p>
                  Elimina semanas vazias antes e depois do projeto e equilibra a escala temporal para uma proporção harmônica (~16:9), evitando que o texto fique borrado ou encolhido.
                </p>
              </div>
            </label>

            <label className={`option-card ${mode === 'current' ? 'active' : ''}`}>
              <input
                type="radio"
                name="export-mode"
                checked={mode === 'current'}
                onChange={() => setMode('current')}
              />
              <div className="option-card-body">
                <strong>Visão Atual da Tela (Zoom do Navegador)</strong>
                <p>
                  Exporta exatamente com a mesma escala temporal e margens em que você está navegando no navegador.
                </p>
              </div>
            </label>
          </div>

          <div className="option-group">
            <span className="option-group-title">Resolução & Nitidez</span>
            <div className="scale-chips">
              <label className={`scale-chip ${scale === 2 ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="export-scale"
                  checked={scale === 2}
                  onChange={() => setScale(2)}
                />
                <span>2x Ultra Nítido (Retina / 300 DPI)</span>
              </label>
              <label className={`scale-chip ${scale === 1 ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="export-scale"
                  checked={scale === 1}
                  onChange={() => setScale(1)}
                />
                <span>1x Padrão (Leve)</span>
              </label>
            </div>
          </div>

          <div className="export-preview-box">
            <div className="preview-stat">
              <span className="stat-label">Dimensão Final:</span>
              <span className="stat-value">{finalW} × {finalH} px</span>
            </div>
            <div className="preview-stat">
              <span className="stat-label">Proporção:</span>
              <span className="stat-value">{ratio} : 1 {mode === 'optimized' ? '• Proporcional (~16:9)' : '• Esticado'}</span>
            </div>
            <div className="preview-stat">
              <span className="stat-label">Total de Tarefas:</span>
              <span className="stat-value">{tasks.length} atividades incluídas</span>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={handleDownload}
            disabled={busy}
          >
            {busy ? 'Processando imagem…' : 'Baixar Imagem PNG'}
          </button>
        </div>
      </div>
    </dialog>
  )
}
