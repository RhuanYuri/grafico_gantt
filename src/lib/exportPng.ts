import type { Task, User } from '../types'
import { COLORS, FONT_FAMILY, STATUS_STYLE } from '../theme'
import {
  AVATAR_SIZE,
  AVATAR_STEP,
  BAR_H,
  HEADER_H,
  LIST_W,
  MONTH_H,
  ROW_H,
  computeLayout,
  computeTightRange,
  type ChartLayout,
} from './layout'
import { todayDay } from './dates'
import { userInitials } from './users'

export interface ExportConfig {
  /**
   * 'optimized': corta margens vazias de dias antes/depois e calibra a largura para proporção widescreen limpa (~16:9).
   * 'current': exporta com o zoom e o intervalo exatos da tela atual.
   */
  mode: 'optimized' | 'current'
  /** Multiplicador de nitidez (2 = 2x Retina Ultra-HD, padrão) */
  scale: 1 | 2
}

export interface ExportInput {
  title: string
  tasks: Task[]
  users: User[]
  currentLayout: ChartLayout
  config?: Partial<ExportConfig>
}

const BANNER_H = 76
const MAX_CANVAS_SIDE = 16000

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (ctx.measureText(text.slice(0, mid) + '…').width <= maxW) lo = mid
    else hi = mid - 1
  }
  return text.slice(0, lo) + '…'
}

function drawAvatar(
  ctx: CanvasRenderingContext2D,
  x: number,
  cy: number,
  fill: string,
  text: string,
  img?: HTMLImageElement | null,
) {
  const r = AVATAR_SIZE / 2
  ctx.save()
  ctx.beginPath()
  ctx.arc(x + r, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  if (img) {
    ctx.clip()
    ctx.drawImage(img, x, cy - r, AVATAR_SIZE, AVATAR_SIZE)
  }
  ctx.restore()
  ctx.beginPath()
  ctx.arc(x + r, cy, r, 0, Math.PI * 2)
  ctx.lineWidth = 1.5
  ctx.strokeStyle = '#fff'
  ctx.stroke()
  if (!img) {
    ctx.fillStyle = '#fff'
    ctx.font = `700 9px ${FONT_FAMILY}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, x + r, cy + 0.5)
    ctx.textAlign = 'left'
  }
}

function drawStatusIcon(ctx: CanvasRenderingContext2D, cx: number, cy: number, status: Task['status']) {
  const color = STATUS_STYLE[status].solid
  ctx.beginPath()
  ctx.arc(cx, cy, 8, 0, Math.PI * 2)
  if (status === 'pending') {
    ctx.lineWidth = 2
    ctx.strokeStyle = color
    ctx.stroke()
    return
  }
  ctx.fillStyle = color
  ctx.fill()
  if (status === 'done') {
    ctx.beginPath()
    ctx.moveTo(cx - 3.6, cy + 0.2)
    ctx.lineTo(cx - 0.8, cy + 3)
    ctx.lineTo(cx + 3.8, cy - 2.6)
    ctx.lineWidth = 2
    ctx.strokeStyle = '#fff'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
  } else {
    ctx.beginPath()
    ctx.arc(cx, cy, 3, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()
  }
}

/**
 * Calcula dimensões e layout de exportação ideais para evitar imagens
 * desproporcionalmente longas ou com textos borrados.
 */
export function getExportLayout(
  tasks: Task[],
  users: User[],
  currentLayout: ChartLayout,
  config?: Partial<ExportConfig>,
): { layout: ChartLayout; listW: number; scale: number } {
  const mode = config?.mode ?? 'optimized'
  const userScale = config?.scale ?? 2

  if (mode === 'current') {
    return { layout: currentLayout, listW: LIST_W, scale: userScale }
  }

  // Modo 'optimized': foca estritamente nas tarefas com margem elegante de 2 dias antes e 3 depois
  const tightRange = computeTightRange(tasks, 2, 3)
  const totalDays = tightRange.endDay - tightRange.startDay + 1

  // Escala calibrada: garante que cada dia tenha entre 20 e 24px, gerando imagem proporcional ~16:9
  let optimalPx = 22
  if (totalDays > 90) optimalPx = 18
  else if (totalDays < 30) optimalPx = 32

  const today = todayDay()
  const layout = computeLayout(tasks, users, tightRange, optimalPx, today)
  return { layout, listW: 340, scale: userScale }
}

/** Desenha o gráfico completo com alta nitidez e proporção equilibrada e baixa o PNG. */
export async function exportChartToPng({
  title,
  tasks,
  users,
  currentLayout,
  config,
}: ExportInput): Promise<void> {
  if (document.fonts?.ready) await document.fonts.ready

  const { layout, listW, scale: targetScale } = getExportLayout(tasks, users, currentLayout, config)

  const images = new Map<string, HTMLImageElement | null>()
  await Promise.all(
    users
      .filter((u) => u.avatarUrl)
      .map(async (u) => images.set(u.id, await loadImage(u.avatarUrl as string))),
  )

  const W = listW + layout.timelineWidth
  const bodyH = layout.bodyHeight
  const H = BANNER_H + HEADER_H + bodyH
  const scale = Math.min(targetScale, MAX_CANVAS_SIDE / Math.max(W, H))

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(W * scale)
  canvas.height = Math.round(H * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas indisponível')

  // Otimização de renderização e nitidez
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.scale(scale, scale)
  ctx.textBaseline = 'middle'

  // Fundo branco limpo
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  // ---- Banner superior com título e legenda ----
  ctx.fillStyle = COLORS.text
  ctx.font = `700 22px ${FONT_FAMILY}`
  ctx.fillText(title, 20, 28)

  const rows = layout.bars
  const doneCount = rows.filter((b) => b.task.status === 'done').length
  const sub = `${rows.length} tarefas · ${doneCount} concluídas · Cronograma Oficial · Exportado em ${new Date().toLocaleDateString('pt-BR')}`
  ctx.fillStyle = COLORS.textMuted
  ctx.font = `400 13px ${FONT_FAMILY}`
  ctx.fillText(sub, 20, 52)

  // Legenda no canto superior direito
  ctx.textAlign = 'right'
  let lx = W - 20
  for (const st of ['pending', 'in_progress', 'done'] as const) {
    const label = STATUS_STYLE[st].label
    ctx.font = `500 12px ${FONT_FAMILY}`
    ctx.fillStyle = COLORS.text
    ctx.fillText(label, lx, 40)
    lx -= ctx.measureText(label).width + 16

    ctx.fillStyle = STATUS_STYLE[st].bar
    ctx.strokeStyle = STATUS_STYLE[st].barBorder
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(lx - 4, 33, 14, 14, 4)
    ctx.fill()
    ctx.stroke()
    lx -= 24
  }
  ctx.textAlign = 'left'

  ctx.save()
  ctx.translate(0, BANNER_H)

  // ---- Cabeçalho da linha do tempo ----
  ctx.save()
  ctx.translate(listW, 0)
  ctx.beginPath()
  ctx.rect(0, 0, layout.timelineWidth, HEADER_H + bodyH)
  ctx.clip()

  ctx.fillStyle = COLORS.headerBg
  ctx.fillRect(0, 0, layout.timelineWidth, HEADER_H)

  // Fins de semana
  for (const d of layout.days) {
    if (d.weekend) {
      ctx.fillStyle = COLORS.weekend
      ctx.fillRect(d.x, MONTH_H, layout.pxPerDay, HEADER_H - MONTH_H + bodyH)
    }
  }

  // Linhas horizontais do grid
  ctx.strokeStyle = COLORS.grid
  ctx.lineWidth = 1
  for (let r = 0; r <= rows.length + 1; r++) {
    const y = HEADER_H + r * ROW_H - 0.5
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(layout.timelineWidth, y)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.moveTo(0, MONTH_H - 0.5)
  ctx.lineTo(layout.timelineWidth, MONTH_H - 0.5)
  ctx.stroke()

  // Meses
  ctx.font = `600 12px ${FONT_FAMILY}`
  for (const m of layout.months) {
    ctx.strokeStyle = COLORS.grid
    ctx.beginPath()
    ctx.moveTo(m.x + 0.5, 0)
    ctx.lineTo(m.x + 0.5, MONTH_H)
    ctx.stroke()
    ctx.fillStyle = COLORS.text
    ctx.fillText(fit(ctx, m.label, m.w - 12), m.x + 8, MONTH_H / 2)
  }

  // Dias
  ctx.font = `600 11px ${FONT_FAMILY}`
  ctx.textAlign = 'center'
  for (const d of layout.days) {
    if (d.label) {
      ctx.fillStyle = d.weekend ? COLORS.textMuted : COLORS.text
      ctx.fillText(d.label, d.x + layout.pxPerDay / 2, MONTH_H + (HEADER_H - MONTH_H) / 2)
    }
  }
  ctx.textAlign = 'left'
  ctx.strokeStyle = '#d6dae1'
  ctx.beginPath()
  ctx.moveTo(0, HEADER_H - 0.5)
  ctx.lineTo(layout.timelineWidth, HEADER_H - 0.5)
  ctx.stroke()

  // ---- Corpo do Cronograma ----
  ctx.save()
  ctx.translate(0, HEADER_H)

  // Linha vertical de Hoje (se estiver visível no intervalo)
  if (layout.todayX !== null) {
    ctx.strokeStyle = COLORS.today
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(layout.todayX, 0)
    ctx.lineTo(layout.todayX, bodyH)
    ctx.stroke()
  }

  // Resumo do projeto (barra verde no topo)
  const s = layout.summary
  if (s.w > 0) {
    ctx.fillStyle = '#cfe9d8'
    ctx.beginPath()
    ctx.roundRect(s.x, ROW_H / 2 - 4, s.w, 8, 4)
    ctx.fill()
    ctx.fillStyle = COLORS.summary
    ctx.beginPath()
    ctx.roundRect(s.x, ROW_H / 2 - 4, Math.max(8, s.w * s.progress), 8, 4)
    ctx.fill()
  }

  // Conectores ortogonais com setas (desenhados atrás das barras)
  for (const c of layout.connectors) {
    const color = c.conflict ? COLORS.connectorConflict : COLORS.connector
    ctx.strokeStyle = color
    ctx.lineWidth = 1.8
    ctx.lineJoin = 'round'
    ctx.stroke(new Path2D(c.path))
    ctx.fillStyle = color
    ctx.beginPath()
    c.arrow.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
    ctx.closePath()
    ctx.fill()
  }

  // Barras de tarefas, avatares e títulos
  for (const b of rows) {
    const st = STATUS_STYLE[b.task.status]
    ctx.fillStyle = st.bar
    ctx.strokeStyle = st.barBorder
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.roundRect(b.x + 0.5, b.cy - BAR_H / 2 + 0.5, b.w - 1, BAR_H - 1, 6)
    ctx.fill()
    ctx.stroke()

    let ax = b.avatarX
    b.avatars.forEach((u) => {
      drawAvatar(ctx, ax, b.cy, u.color, userInitials(u), images.get(u.id))
      ax += AVATAR_STEP
    })
    if (b.extraAssignees > 0) drawAvatar(ctx, ax, b.cy, '#8a93a3', `+${b.extraAssignees}`)

    // Título da tarefa à direita da barra:
    // Stroke suave de apenas 2.2px (em vez de 4px que antes deformava e borrava a fonte)
    ctx.font = `600 13px ${FONT_FAMILY}`
    ctx.lineWidth = 2.2
    ctx.strokeStyle = 'rgba(255,255,255,0.92)'
    ctx.lineJoin = 'round'
    ctx.strokeText(b.task.title, b.labelX, b.cy)
    ctx.fillStyle = COLORS.text
    ctx.fillText(b.task.title, b.labelX, b.cy)
  }
  ctx.restore() // corpo
  ctx.restore() // timeline

  // ---- Painel lateral esquerdo de tarefas ----
  ctx.fillStyle = COLORS.panelBg
  ctx.fillRect(0, 0, listW, HEADER_H + bodyH)
  ctx.fillStyle = COLORS.headerBg
  ctx.fillRect(0, 0, listW, HEADER_H)
  ctx.fillStyle = COLORS.textMuted
  ctx.font = `700 11px ${FONT_FAMILY}`
  ctx.fillText('TAREFAS', 16, HEADER_H / 2)

  ctx.strokeStyle = COLORS.grid
  ctx.lineWidth = 1
  for (let r = 0; r <= rows.length + 1; r++) {
    const y = HEADER_H + r * ROW_H - 0.5
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(listW, y)
    ctx.stroke()
  }

  // Linha de resumo do projeto no painel lateral
  ctx.fillStyle = COLORS.text
  ctx.font = `700 14px ${FONT_FAMILY}`
  ctx.fillText(fit(ctx, title, listW - 32), 16, HEADER_H + ROW_H / 2)

  // Cada linha de tarefa
  rows.forEach((b, i) => {
    const cy = HEADER_H + (i + 1) * ROW_H + ROW_H / 2
    drawStatusIcon(ctx, 24, cy, b.task.status)
    ctx.fillStyle = COLORS.text
    ctx.font = `500 13.5px ${FONT_FAMILY}`
    ctx.fillText(fit(ctx, b.task.title, listW - 56), 44, cy)
  })

  // Divisória vertical entre o painel lateral e a timeline
  ctx.strokeStyle = '#d6dae1'
  ctx.beginPath()
  ctx.moveTo(listW - 0.5, 0)
  ctx.lineTo(listW - 0.5, HEADER_H + bodyH)
  ctx.stroke()
  ctx.restore()

  // Converte canvas para PNG Blob
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'))
  if (!blob) throw new Error('Falha ao gerar PNG')

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const slug = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  a.href = url
  a.download = `gantt-${slug || 'projeto'}.png`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
