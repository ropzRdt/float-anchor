import type { CSSProperties, PointerEvent } from 'react'
import type { Card, ConnectionSide } from '../types'
import './CardConnectionPorts.css'

export interface CardPort {
  cardId: string
  side: ConnectionSide
}

const sides: { side: ConnectionSide; label: string }[] = [
  { side: 'top', label: '上' },
  { side: 'right', label: '右' },
  { side: 'bottom', label: '下' },
  { side: 'left', label: '左' },
]

interface Props {
  card: Card
  scale: number
  selected: boolean
  source?: CardPort
  target?: CardPort | null
  onStart: (event: PointerEvent<HTMLButtonElement>, port: CardPort) => void
  onLostCapture: (pointerId: number) => void
  onCancel: () => void
}

export default function CardConnectionPorts({ card, scale, selected, source, target, onStart, onLostCapture, onCancel }: Props) {
  return (
    <div
      className={`card-connection-ports${selected ? ' is-selected' : ''}${source ? ' is-connecting' : ''}`}
      style={{
        left: card.x,
        top: card.y,
        width: card.width,
        height: card.height ?? 200,
        '--port-inverse-scale': 1 / Math.max(0.15, scale),
      } as CSSProperties}
    >
      {sides.map(({ side, label }) => {
        const isSource = source?.cardId === card.id && source.side === side
        const isTarget = target?.cardId === card.id && target.side === side
        return (
          <button
            key={side}
            type="button"
            className={`card-connection-port port-${side}${isSource ? ' is-source' : ''}${isTarget ? ' is-target' : ''}`}
            data-port-card-id={card.id}
            data-connection-side={side}
            aria-label={`${card.title || '无标题卡片'}：${label}侧连接点`}
            title={`从${label}侧连接点拖到另一张卡片的连接点`}
            tabIndex={-1}
            onPointerDown={(event) => onStart(event, { cardId: card.id, side })}
            onLostPointerCapture={(event) => onLostCapture(event.pointerId)}
            onClick={(event) => { event.preventDefault(); event.stopPropagation() }}
            onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation() }}
            onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); onCancel() }}
          >
            <span />
          </button>
        )
      })}
    </div>
  )
}
