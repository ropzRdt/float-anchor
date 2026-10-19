import { useId } from 'react'
import { createPortal } from 'react-dom'
import type { KeyboardEvent, MouseEvent } from 'react'
import type { Connection } from '../types'
import type { CardConnectionGeometry } from '../cardConnections'
import { getConnectionAppearance } from '../connectionStyle'
import './ConnectionLine.css'

interface Props {
  connection: Connection & CardConnectionGeometry
  selected: boolean
  highlighted: boolean
  scale: number
  labelLayer: SVGSVGElement | null
  fromTitle: string
  toTitle: string
  onSelect: (event: MouseEvent<SVGGElement> | KeyboardEvent<SVGGElement>) => void
  onHover: (hovered: boolean) => void
}

export default function ConnectionLine({ connection, selected, highlighted, scale, labelLayer, fromTitle, toTitle, onSelect, onHover }: Props) {
  const markerId = `connection-arrow-${useId().replace(/:/g, '')}`
  const appearance = getConnectionAppearance(connection)
  const inverseScale = 1 / Math.max(0.15, scale)
  const markerSize = 10 + appearance.strokeWidth
  const hasStart = appearance.arrow === 'start' || appearance.arrow === 'both'
  const hasEnd = appearance.arrow === 'end' || appearance.arrow === 'both'
  const label = `连线：${fromTitle || '无标题卡片'} 与 ${toTitle || '无标题卡片'}${appearance.label ? `，${appearance.label}` : ''}`

  return (
    <g
      className={`connection-shape${selected ? ' is-selected' : ''}${highlighted ? ' is-highlighted' : ''}`}
      data-connection-id={connection.id}
      data-from-card-id={connection.fromCardId}
      data-to-card-id={connection.toCardId}
      data-from-side={connection.fromSide}
      data-to-side={connection.toSide}
      role="button"
      aria-label={label}
      aria-pressed={selected}
      tabIndex={0}
      onMouseDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        event.currentTarget.focus({ preventScroll: true })
        onSelect(event)
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        event.stopPropagation()
        if (!event.repeat) onSelect(event)
      }}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation() }}
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation() }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <defs>
        <marker
          id={markerId}
          markerWidth={markerSize * inverseScale}
          markerHeight={markerSize * inverseScale}
          viewBox="0 0 12 12"
          refX="11"
          refY="6"
          orient="auto-start-reverse"
          markerUnits="userSpaceOnUse"
        >
          <path d="M1 1 L11 6 L1 11 Z" className="connection-arrow" />
        </marker>
      </defs>
      {selected && (
        <path d={connection.path} className="connection-selection-halo" strokeWidth={appearance.strokeWidth + 7} vectorEffect="non-scaling-stroke" />
      )}
      <path d={connection.path} className="connection-hit-area" strokeWidth={Math.max(16, appearance.strokeWidth + 10)} vectorEffect="non-scaling-stroke" />
      <path
        d={connection.path}
        className="connection-stroke"
        strokeWidth={appearance.strokeWidth}
        strokeDasharray={appearance.lineStyle === 'dashed' ? '8 5' : undefined}
        markerStart={hasStart ? `url(#${markerId})` : undefined}
        markerEnd={hasEnd ? `url(#${markerId})` : undefined}
        vectorEffect="non-scaling-stroke"
      />
      {appearance.label && labelLayer && createPortal(
        <foreignObject
          className={`connection-label-container${selected ? ' is-selected' : ''}`}
          x={connection.midpoint.x - 130 * inverseScale}
          y={connection.midpoint.y - 15 * inverseScale}
          width={260 * inverseScale}
          height={30 * inverseScale}
        >
          <div className="connection-label-position" style={{ transform: `scale(${inverseScale})` }}>
            <span className="connection-label" data-connection-label-id={connection.id} title={appearance.label}>{appearance.label}</span>
          </div>
        </foreignObject>,
        labelLayer,
      )}
    </g>
  )
}
