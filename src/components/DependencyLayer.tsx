import type { ConnectorLayout } from '../lib/layout'
import { COLORS } from '../theme'

interface Props {
  connectors: ConnectorLayout[]
  activeId: string | null
}

/** Camada SVG dos conectores. Recalculada a cada mudança de layout, então segue as barras dinamicamente. */
export function DependencyLayer({ connectors, activeId }: Props) {
  // Conectores ativos (ligados à tarefa selecionada/hover) são desenhados por último, em destaque.
  const sorted = [...connectors].sort(
    (a, b) => Number(isActive(a, activeId)) - Number(isActive(b, activeId)),
  )
  return (
    <g className="dependency-layer" fill="none">
      {sorted.map((c) => {
        const active = isActive(c, activeId)
        const color = c.conflict ? COLORS.connectorConflict : active ? COLORS.connectorActive : COLORS.connector
        return (
          <g key={c.id} opacity={activeId && !active ? 0.45 : 1} data-from={c.fromId} data-to={c.toId}>
            <title>{c.conflict ? 'Conflito: a sucessora começa antes do fim da predecessora' : 'Dependência término → início'}</title>
            <path d={c.path} stroke={color} strokeWidth={active ? 2.2 : 1.6} strokeLinejoin="round" />
            <polygon points={c.arrow.map((p) => p.join(',')).join(' ')} fill={color} stroke="none" />
          </g>
        )
      })}
    </g>
  )
}

function isActive(c: ConnectorLayout, id: string | null): boolean {
  return id !== null && (c.fromId === id || c.toId === id)
}
