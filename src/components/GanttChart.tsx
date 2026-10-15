import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import type { Task, User } from '../types'
import { HEADER_H, LIST_W, ROW_H, type ChartLayout } from '../lib/layout'
import { toDay } from '../lib/dates'
import { COLORS } from '../theme'
import { TaskList } from './TaskList'
import { TimelineHeader } from './TimelineHeader'
import { DependencyLayer } from './DependencyLayer'
import { TaskBars } from './TaskBars'
import { Tooltip } from './Tooltip'

interface Props {
  projectTitle: string
  tasks: Task[]
  users: User[]
  layout: ChartLayout
  selectedId: string | null
  scrollToTodayToken: number
  onSelect: (id: string | null) => void
  onOpen: (id: string) => void
  /** Pré-visualização durante o arraste (null encerra) */
  onDragPreview: (drag: { id: string; delta: number } | null) => void
  onMoveTask: (id: string, delta: number) => void
  onZoom: (direction: 1 | -1) => void
}

interface DragRef {
  id: string
  startX: number
  delta: number
  moved: boolean
  startDay: number
  endDay: number
}

export function GanttChart(props: Props) {
  const { projectTitle, tasks, users, layout, selectedId, onSelect, onOpen, onDragPreview, onMoveTask, onZoom } = props
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragRef | null>(null)
  const centerDayRef = useRef<number | null>(null)
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const { pxPerDay, range } = layout

  const visibleWidth = () => (scrollRef.current?.clientWidth ?? 0) - LIST_W

  // Mantém o dia central ao mudar o zoom
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || centerDayRef.current === null) return
    el.scrollLeft = (centerDayRef.current - range.startDay) * pxPerDay - visibleWidth() / 2
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pxPerDay])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    centerDayRef.current = range.startDay + (el.scrollLeft + visibleWidth() / 2) / pxPerDay
  }

  const scrollToToday = useCallback(() => {
    const el = scrollRef.current
    if (!el || layout.todayX === null) return
    el.scrollTo({ left: layout.todayX - visibleWidth() * 0.45, behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.todayX])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || layout.todayX === null) return
    el.scrollLeft = layout.todayX - visibleWidth() * 0.45
    centerDayRef.current = range.startDay + (el.scrollLeft + visibleWidth() / 2) / pxPerDay
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const firstToken = useRef(props.scrollToTodayToken)
  useEffect(() => {
    if (firstToken.current === props.scrollToTodayToken) return
    scrollToToday()
  }, [props.scrollToTodayToken, scrollToToday])

  // Ctrl + roda do mouse = zoom
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      onZoom(e.deltaY < 0 ? 1 : -1)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [onZoom])

  /* ---------- Arraste ---------- */
  const onPointerDown = (e: PointerEvent<SVGGElement>, task: Task) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    onSelect(task.id)
    dragRef.current = {
      id: task.id,
      startX: e.clientX,
      delta: 0,
      moved: false,
      startDay: toDay(task.start),
      endDay: toDay(task.end),
    }
  }

  const onPointerMove = (e: PointerEvent<SVGGElement>, task: Task) => {
    const d = dragRef.current
    if (!d || d.id !== task.id) {
      setHover((h) => (h && h.id === task.id ? { ...h, x: e.clientX, y: e.clientY } : h))
      return
    }
    const dx = e.clientX - d.startX
    if (!d.moved && Math.abs(dx) < 4) return
    if (!d.moved) {
      d.moved = true
      setDraggingId(d.id)
      setHover(null)
    }
    let delta = Math.round(dx / pxPerDay)
    delta = Math.max(delta, range.startDay - d.startDay)
    delta = Math.min(delta, range.endDay - d.endDay)
    if (delta !== d.delta) {
      d.delta = delta
      onDragPreview({ id: d.id, delta })
    }
  }

  const onPointerUp = (e: PointerEvent<SVGGElement>, task: Task) => {
    const d = dragRef.current
    if (!d || d.id !== task.id) return
    dragRef.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    setDraggingId(null)
    onDragPreview(null)
    if (d.moved && d.delta !== 0) onMoveTask(d.id, d.delta)
  }

  const onKeyDown = (e: KeyboardEvent<SVGGElement>, task: Task) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(task.id)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      onMoveTask(task.id, e.key === 'ArrowLeft' ? -1 : 1)
    } else if (e.key === 'Escape') {
      onSelect(null)
    }
  }

  const onHover = (id: string | null, e?: PointerEvent<SVGGElement>) => {
    if (dragRef.current?.moved) return
    setHover(id && e ? { id, x: e.clientX, y: e.clientY } : null)
  }

  const hoverId = hover?.id ?? null
  const activeId = draggingId ?? hoverId ?? selectedId
  const hoverTask = hover ? tasks.find((t) => t.id === hover.id) : undefined
  const rows = layout.bars.length + 1

  return (
    <div className="gantt">
      <div className="zoom-controls" role="group" aria-label="Zoom">
        <button type="button" onClick={() => onZoom(1)} aria-label="Aumentar zoom" title="Aumentar zoom">+</button>
        <button type="button" onClick={() => onZoom(-1)} aria-label="Diminuir zoom" title="Diminuir zoom">−</button>
      </div>
      <div className="gantt-scroll" ref={scrollRef} onScroll={onScroll} tabIndex={-1}>
        <div
          className="gantt-grid"
          style={{
            gridTemplateColumns: `${LIST_W}px ${layout.timelineWidth}px`,
            gridTemplateRows: `${HEADER_H}px ${layout.bodyHeight}px`,
            width: LIST_W + layout.timelineWidth,
          }}
        >
          <div className="corner">Tarefas</div>
          <div className="header-cell">
            <TimelineHeader layout={layout} />
          </div>
          <div className="list-cell">
            <TaskList
              projectTitle={projectTitle}
              bars={layout.bars}
              selectedId={selectedId}
              hoverId={hoverId}
              onSelect={onSelect}
              onOpen={onOpen}
              onHover={(id) => setHover(id ? { id, x: 0, y: 0 } : null)}
            />
          </div>
          <svg
            className="body-svg"
            width={layout.timelineWidth}
            height={layout.bodyHeight}
            onClick={(e) => e.target === e.currentTarget && onSelect(null)}
          >
            {layout.days.map((d) =>
              d.weekend ? (
                <rect key={d.day} x={d.x} y={0} width={pxPerDay} height={layout.bodyHeight} fill="var(--weekend)" />
              ) : null,
            )}
            {Array.from({ length: rows }, (_, r) => (
              <line key={r} x1={0} x2={layout.timelineWidth} y1={(r + 1) * ROW_H - 0.5} y2={(r + 1) * ROW_H - 0.5} stroke="var(--grid)" />
            ))}
            {layout.bars.map((b) =>
              selectedId === b.task.id || hoverId === b.task.id ? (
                <rect key={b.task.id} x={0} y={b.row * ROW_H} width={layout.timelineWidth} height={ROW_H} fill="var(--selected)" opacity={0.7} pointerEvents="none" />
              ) : null,
            )}
            {layout.summary.w > 0 && (
              <g>
                <title>{`Progresso geral: ${Math.round(layout.summary.progress * 100)}%`}</title>
                <rect x={layout.summary.x} y={ROW_H / 2 - 4} width={layout.summary.w} height={8} rx={4} fill="#cfe9d8" />
                <rect x={layout.summary.x} y={ROW_H / 2 - 4} width={Math.max(8, layout.summary.w * layout.summary.progress)} height={8} rx={4} fill={COLORS.summary} />
              </g>
            )}
            {layout.todayX !== null && (
              <line x1={layout.todayX} x2={layout.todayX} y1={0} y2={layout.bodyHeight} stroke={COLORS.today} strokeWidth={2} pointerEvents="none" />
            )}
            <DependencyLayer connectors={layout.connectors} activeId={activeId} />
            <TaskBars
              bars={layout.bars}
              selectedId={selectedId}
              draggingId={draggingId}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onHover={onHover}
              onKeyDown={onKeyDown}
              onOpen={onOpen}
            />
          </svg>
        </div>
      </div>
      {hover && hoverTask && hover.x > 0 && !draggingId && (
        <Tooltip task={hoverTask} users={users} tasks={tasks} x={hover.x} y={hover.y} />
      )}
    </div>
  )
}
