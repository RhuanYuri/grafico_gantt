import type { TaskStatus } from './types'

export const FONT_FAMILY = "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"

export interface StatusStyle {
  label: string
  /** Cor de preenchimento da barra */
  bar: string
  /** Cor da borda da barra */
  barBorder: string
  /** Cor sólida (ícones, destaques) */
  solid: string
}

export const STATUS_STYLE: Record<TaskStatus, StatusStyle> = {
  done: { label: 'Concluída', bar: '#a9dbb8', barBorder: '#6cbf88', solid: '#2e9d5d' },
  in_progress: { label: 'Em andamento', bar: '#b8c9f6', barBorder: '#7e9eea', solid: '#2f6fe0' },
  pending: { label: 'Pendente', bar: '#e3e6ec', barBorder: '#bcc2cd', solid: '#8a93a3' },
}

export const COLORS = {
  text: '#1f2933',
  textMuted: '#6b7685',
  grid: '#e8ebf0',
  weekend: '#f0f2f5',
  headerBg: '#fafbfc',
  panelBg: '#ffffff',
  selected: '#eef3ff',
  today: '#e5484d',
  connector: '#7b8494',
  connectorActive: '#2f6fe0',
  connectorConflict: '#e5484d',
  summary: '#3fb36b',
  accent: '#2f6fe0',
}
