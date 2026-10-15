import type { PointerEvent, KeyboardEvent } from 'react'
import type { Task } from '../types'
import { BAR_H, type BarLayout } from '../lib/layout'
import { COLORS, STATUS_STYLE } from '../theme'
import { formatBR } from '../lib/dates'
import { SvgAvatar } from './Avatar'

interface Props {
  bars: BarLayout[]
  selectedId: string | null
  draggingId: string | null
  onPointerDown: (e: PointerEvent<SVGGElement>, task: Task) => void
  onPointerMove: (e: PointerEvent<SVGGElement>, task: Task) => void
  onPointerUp: (e: PointerEvent<SVGGElement>, task: Task) => void
  onHover: (id: string | null, e?: PointerEvent<SVGGElement>) => void
  onKeyDown: (e: KeyboardEvent<SVGGElement>, task: Task) => void
  onOpen: (id: string) => void
}

export function TaskBars(p: Props) {
  return (
    <g className="task-bars">
      {p.bars.map((b) => {
        const st = STATUS_STYLE[b.task.status]
        const selected = p.selectedId === b.task.id
        return (
          <g
            key={b.task.id}
            className={`bar${selected ? ' selected' : ''}${p.draggingId === b.task.id ? ' dragging' : ''}`}
            tabIndex={0}
            role="button"
            aria-pressed={selected}
            aria-label={`${b.task.title}, ${st.label}, de ${formatBR(b.task.start)} a ${formatBR(b.task.end)}. Use as setas esquerda e direita para mover.`}
            onPointerDown={(e) => p.onPointerDown(e, b.task)}
            onPointerMove={(e) => p.onPointerMove(e, b.task)}
            onPointerUp={(e) => p.onPointerUp(e, b.task)}
            onPointerCancel={(e) => p.onPointerUp(e, b.task)}
            onPointerEnter={(e) => p.onHover(b.task.id, e)}
            onPointerLeave={() => p.onHover(null)}
            onKeyDown={(e) => p.onKeyDown(e, b.task)}
            onDoubleClick={() => p.onOpen(b.task.id)}
          >
            <rect
              className="bar-rect"
              x={b.x + 0.5}
              y={b.cy - BAR_H / 2 + 0.5}
              width={b.w - 1}
              height={BAR_H - 1}
              rx={6}
              fill={st.bar}
              stroke={selected ? COLORS.accent : st.barBorder}
              strokeWidth={selected ? 2 : 1}
            />
            {/* área de captura maior, para facilitar o arraste */}
            <rect x={b.x} y={b.cy - 18} width={b.w} height={36} fill="transparent" />
            {b.avatars.map((u, i) => (
              <SvgAvatar key={u.id} user={u} x={b.avatarX + i * 15} cy={b.cy} />
            ))}
            {b.extraAssignees > 0 && (
              <SvgAvatar x={b.avatarX + b.avatars.length * 15} cy={b.cy} label={`+${b.extraAssignees}`} />
            )}
            <text x={b.labelX} y={b.cy} dominantBaseline="middle" className="bar-label">
              {b.task.title}
            </text>
          </g>
        )
      })}
    </g>
  )
}
