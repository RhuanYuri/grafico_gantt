import type { ChartLayout } from '../lib/layout'
import { HEADER_H, MONTH_H } from '../lib/layout'

export function TimelineHeader({ layout }: { layout: ChartLayout }) {
  const { days, months, pxPerDay, timelineWidth, todayX } = layout
  return (
    <svg className="timeline-header" width={timelineWidth} height={HEADER_H} aria-hidden="true">
      {days.map((d) =>
        d.weekend ? <rect key={`w${d.day}`} x={d.x} y={MONTH_H} width={pxPerDay} height={HEADER_H - MONTH_H} fill="var(--weekend)" /> : null,
      )}
      {months.map((m) => (
        <g key={m.key}>
          <line x1={m.x + 0.5} x2={m.x + 0.5} y1={0} y2={MONTH_H} stroke="var(--grid)" />
          <text x={m.x + 8} y={MONTH_H / 2} dominantBaseline="middle" className="month-label">
            {m.label}
          </text>
        </g>
      ))}
      <line x1={0} x2={timelineWidth} y1={MONTH_H - 0.5} y2={MONTH_H - 0.5} stroke="var(--grid)" />
      {days.map((d) =>
        d.label ? (
          <text
            key={d.day}
            x={d.x + pxPerDay / 2}
            y={MONTH_H + (HEADER_H - MONTH_H) / 2}
            textAnchor="middle"
            dominantBaseline="middle"
            className={`day-label${d.weekend ? ' weekend' : ''}`}
          >
            {d.label}
          </text>
        ) : null,
      )}
      {todayX !== null && <circle cx={todayX} cy={HEADER_H - 6} r={4} fill="var(--today)" />}
    </svg>
  )
}
