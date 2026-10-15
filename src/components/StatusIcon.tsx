import type { TaskStatus } from '../types'
import { STATUS_STYLE } from '../theme'

export function StatusIcon({ status, size = 18 }: { status: TaskStatus; size?: number }) {
  const color = STATUS_STYLE[status].solid
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" role="img" aria-label={STATUS_STYLE[status].label} className="status-icon">
      {status === 'pending' ? (
        <circle cx="9" cy="9" r="7" fill="none" stroke={color} strokeWidth="2" />
      ) : (
        <circle cx="9" cy="9" r="8" fill={color} />
      )}
      {status === 'done' && (
        <path d="M5.3 9.2l2.4 2.4 5-5.2" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {status === 'in_progress' && <circle cx="9" cy="9" r="3" fill="#fff" />}
    </svg>
  )
}
