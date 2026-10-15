import type { Task, User } from '../types'
import {
  dayOfMonth,
  isWeekend,
  monthKey,
  monthLabel,
  toDay,
  weekday,
} from './dates'

/* ---------- Constantes de geometria (compartilhadas por DOM e exportação) ---------- */
export const ROW_H = 44
export const HEADER_H = 56
export const MONTH_H = 26
export const LIST_W = 320
export const BAR_H = 22
export const MIN_BAR_W = 20
export const AVATAR_SIZE = 22
export const AVATAR_STEP = 15
export const MAX_AVATARS = 3
const GAP = 12
const ARROW = 7
const RADIUS = 5

export interface DateRange {
  startDay: number
  endDay: number
}

export interface BarLayout {
  task: Task
  /** índice da linha (0 = resumo do projeto) */
  row: number
  x: number
  w: number
  /** centro vertical (coordenadas do corpo) */
  cy: number
  avatars: User[]
  extraAssignees: number
  avatarX: number
  avatarsW: number
  labelX: number
}

export interface ConnectorLayout {
  id: string
  fromId: string
  toId: string
  /** `d` de um <path> SVG (também aceito por Path2D no canvas) */
  path: string
  /** pontos do triângulo da seta */
  arrow: [number, number][]
  /** a sucessora começa antes do término da predecessora */
  conflict: boolean
}

export interface DayCell {
  day: number
  x: number
  label: string
  weekend: boolean
}

export interface MonthCell {
  key: string
  label: string
  x: number
  w: number
}

export interface ChartLayout {
  range: DateRange
  pxPerDay: number
  timelineWidth: number
  bodyHeight: number
  bars: BarLayout[]
  connectors: ConnectorLayout[]
  days: DayCell[]
  months: MonthCell[]
  todayX: number | null
  summary: { x: number; w: number; progress: number }
}

export function computeRange(tasks: Task[], today: number): DateRange {
  if (tasks.length === 0) return { startDay: today - 15, endDay: today + 45 }
  let min = today
  let max = today
  for (const t of tasks) {
    min = Math.min(min, toDay(t.start))
    max = Math.max(max, toDay(t.end))
  }
  return { startDay: min - 12, endDay: max + 21 }
}

/**
 * Calcula o intervalo focado exclusivamente nas tarefas do projeto,
 * removendo semanas vazias antes e depois. Ideal para exportações e relatórios.
 */
export function computeTightRange(tasks: Task[], padBefore = 2, padAfter = 3): DateRange {
  if (tasks.length === 0) {
    const today = toDay(new Date().toISOString().slice(0, 10))
    return { startDay: today - 5, endDay: today + 30 }
  }
  let min = Infinity
  let max = -Infinity
  for (const t of tasks) {
    min = Math.min(min, toDay(t.start))
    max = Math.max(max, toDay(t.end))
  }
  return {
    startDay: min - padBefore,
    endDay: max + padAfter,
  }
}

/* ---------- Roteamento ortogonal de conectores ---------- */

type Pt = [number, number]

function roundedPath(points: Pt[], r: number): string {
  let d = `M${points[0][0]} ${points[0][1]}`
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1]
    const [cx, cy] = points[i]
    const [nx, ny] = points[i + 1]
    const d1 = Math.hypot(cx - px, cy - py)
    const d2 = Math.hypot(nx - cx, ny - cy)
    const rr = Math.min(r, d1 / 2, d2 / 2)
    const ax = cx + ((px - cx) / d1) * rr
    const ay = cy + ((py - cy) / d1) * rr
    const bx = cx + ((nx - cx) / d2) * rr
    const by = cy + ((ny - cy) / d2) * rr
    d += ` L${ax} ${ay} Q${cx} ${cy} ${bx} ${by}`
  }
  const last = points[points.length - 1]
  return `${d} L${last[0]} ${last[1]}`
}

/**
 * Conector Finish-to-Start: sai do fim da predecessora e entra no início da sucessora.
 * Se a sucessora começa logo após, usa um "Z" (horizontal-vertical-horizontal);
 * caso contrário contorna pela divisa entre linhas para não cruzar barras.
 */
function routeFinishToStart(src: BarLayout, tgt: BarLayout): { path: string; arrow: [number, number][] } {
  const sx = src.x + src.w
  const sy = src.cy
  const tx = tgt.x
  const ty = tgt.cy
  const pts: Pt[] = [[sx, sy]]
  if (tx >= sx + GAP + ARROW + 4) {
    const mx = sx + GAP
    pts.push([mx, sy], [mx, ty])
  } else {
    const lane = sy + (ty >= sy ? ROW_H / 2 : -ROW_H / 2)
    pts.push([sx + GAP, sy], [sx + GAP, lane], [tx - GAP, lane], [tx - GAP, ty])
  }
  pts.push([tx - ARROW, ty])
  return {
    path: roundedPath(pts, RADIUS),
    arrow: [
      [tx, ty],
      [tx - ARROW, ty - 4],
      [tx - ARROW, ty + 4],
    ],
  }
}

export function computeLayout(
  tasks: Task[],
  users: User[],
  range: DateRange,
  pxPerDay: number,
  today: number,
): ChartLayout {
  const totalDays = range.endDay - range.startDay + 1
  const timelineWidth = totalDays * pxPerDay
  const userMap = new Map(users.map((u) => [u.id, u]))

  const bars: BarLayout[] = tasks.map((task, i) => {
    const s = toDay(task.start)
    const e = toDay(task.end)
    const x = (s - range.startDay) * pxPerDay
    const w = Math.max(MIN_BAR_W, (e - s + 1) * pxPerDay)
    const people = task.assigneeIds.map((id) => userMap.get(id)).filter((u): u is User => !!u)
    const avatars = people.slice(0, MAX_AVATARS)
    const shown = avatars.length + (people.length > MAX_AVATARS ? 1 : 0)
    const avatarsW = shown === 0 ? 0 : AVATAR_SIZE + (shown - 1) * AVATAR_STEP
    const avatarX = x + w + GAP + 10
    return {
      task,
      row: i + 1,
      x,
      w,
      cy: (i + 1) * ROW_H + ROW_H / 2,
      avatars,
      extraAssignees: Math.max(0, people.length - MAX_AVATARS),
      avatarX,
      avatarsW,
      labelX: avatarX + avatarsW + (shown ? 8 : 0),
    }
  })

  const byId = new Map(bars.map((b) => [b.task.id, b]))
  const connectors: ConnectorLayout[] = []
  for (const tgt of bars) {
    for (const dep of tgt.task.predecessors) {
      const src = byId.get(dep.taskId)
      if (!src) continue
      // Somente FS por enquanto; novos tipos entram como novos roteadores.
      const { path, arrow } = routeFinishToStart(src, tgt)
      connectors.push({
        id: `${src.task.id}->${tgt.task.id}`,
        fromId: src.task.id,
        toId: tgt.task.id,
        path,
        arrow,
        conflict: toDay(tgt.task.start) <= toDay(src.task.end),
      })
    }
  }

  const days: DayCell[] = []
  const months: MonthCell[] = []
  const step = pxPerDay >= 22 ? 1 : pxPerDay >= 12 ? 2 : 7
  for (let d = range.startDay; d <= range.endDay; d++) {
    const x = (d - range.startDay) * pxPerDay
    const show = step === 1 || (step === 2 ? dayOfMonth(d) % 2 === 1 : weekday(d) === 1)
    days.push({ day: d, x, label: show ? String(dayOfMonth(d)) : '', weekend: isWeekend(d) })
    const key = monthKey(d)
    const last = months[months.length - 1]
    if (last && last.key === key) last.w += pxPerDay
    else months.push({ key, label: monthLabel(d, true), x, w: pxPerDay })
  }
  for (const m of months) {
    if (m.w < 110) m.label = m.label.split(' ')[0].slice(0, m.w < 60 ? 3 : 20)
  }

  const todayX =
    today >= range.startDay && today <= range.endDay
      ? (today - range.startDay + 0.5) * pxPerDay
      : null

  let sMin = Infinity
  let eMax = -Infinity
  let done = 0
  for (const t of tasks) {
    sMin = Math.min(sMin, toDay(t.start))
    eMax = Math.max(eMax, toDay(t.end))
    if (t.status === 'done') done++
  }
  const summary =
    tasks.length === 0
      ? { x: 0, w: 0, progress: 0 }
      : {
          x: (sMin - range.startDay) * pxPerDay,
          w: (eMax - sMin + 1) * pxPerDay,
          progress: done / tasks.length,
        }

  return {
    range,
    pxPerDay,
    timelineWidth,
    bodyHeight: (tasks.length + 1) * ROW_H,
    bars,
    connectors,
    days,
    months,
    todayX,
    summary,
  }
}
