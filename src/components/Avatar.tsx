import type { User } from '../types'
import { AVATAR_SIZE } from '../lib/layout'
import { userInitials } from '../lib/users'

export function Avatar({ user, size = 28 }: { user: User; size?: number }) {
  return (
    <span
      className="avatar"
      title={user.name}
      style={{ width: size, height: size, background: user.color, fontSize: size * 0.4 }}
    >
      {user.avatarUrl ? <img src={user.avatarUrl} alt={user.name} /> : userInitials(user)}
    </span>
  )
}

/** Avatar dentro de um <svg>; (x, cy) é o canto esquerdo e o centro vertical. */
export function SvgAvatar({
  user,
  x,
  cy,
  label,
  color,
}: {
  user?: User
  x: number
  cy: number
  label?: string
  color?: string
}) {
  const r = AVATAR_SIZE / 2
  const fill = user?.color ?? color ?? '#8a93a3'
  return (
    <g className="svg-avatar">
      {user && <title>{user.name}</title>}
      <circle cx={x + r} cy={cy} r={r} fill={fill} stroke="#fff" strokeWidth={2} />
      {user?.avatarUrl ? (
        <>
          <clipPath id={`clip-${user.id}-${Math.round(x)}-${Math.round(cy)}`}>
            <circle cx={x + r} cy={cy} r={r - 1} />
          </clipPath>
          <image
            href={user.avatarUrl}
            x={x}
            y={cy - r}
            width={AVATAR_SIZE}
            height={AVATAR_SIZE}
            clipPath={`url(#clip-${user.id}-${Math.round(x)}-${Math.round(cy)})`}
          />
        </>
      ) : (
        <text x={x + r} y={cy + 0.5} textAnchor="middle" dominantBaseline="middle" fontSize={9} fontWeight={700} fill="#fff">
          {user ? userInitials(user) : label}
        </text>
      )}
    </g>
  )
}
