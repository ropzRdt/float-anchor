import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useStore } from '../store'
import type { Card, ConnectionSide } from '../types'
import type { CardPort } from './CardConnectionPorts'
import type { ConnectionPoint } from '../cardConnections'

interface PortConnectionDraft {
  canvasId: string
  source: CardPort
  target: CardPort | null
  pointer: ConnectionPoint
}

interface ActiveDrag {
  canvasId: string
  source: CardPort
  pointerId: number
  element: HTMLButtonElement
}

function targetAtPoint(x: number, y: number, source: CardPort): CardPort | null {
  const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-port-card-id][data-connection-side]')
  const cardId = element?.dataset.portCardId
  const side = element?.dataset.connectionSide as ConnectionSide | undefined
  if (!cardId || cardId === source.cardId || !side || !['top', 'right', 'bottom', 'left'].includes(side)) return null
  return { cardId, side }
}

export function useCardPortConnection(
  canvasId: string | undefined,
  cards: Card[],
  toCanvasCoords: (x: number, y: number) => ConnectionPoint,
) {
  const [draft, setDraft] = useState<PortConnectionDraft | null>(null)
  const active = useRef<ActiveDrag | null>(null)

  const cancel = useCallback(() => {
    const drag = active.current
    if (!drag) return
    active.current = null
    if (drag.element.hasPointerCapture(drag.pointerId)) drag.element.releasePointerCapture(drag.pointerId)
    setDraft(null)
  }, [])

  const start = useCallback((event: ReactPointerEvent<HTMLButtonElement>, source: CardPort) => {
    if (event.button !== 0 || !event.isPrimary || !canvasId) return
    event.preventDefault()
    event.stopPropagation()
    cancel()
    const element = event.currentTarget
    active.current = { canvasId, source, pointerId: event.pointerId, element }
    element.setPointerCapture(event.pointerId)
    setDraft({ canvasId, source, target: null, pointer: toCanvasCoords(event.clientX, event.clientY) })
  }, [canvasId, cancel, toCanvasCoords])

  const lostCapture = useCallback((pointerId: number) => {
    if (active.current?.pointerId === pointerId) cancel()
  }, [cancel])

  useEffect(() => {
    const drag = active.current
    if (drag && (drag.canvasId !== canvasId || !cards.some((card) => card.id === drag.source.cardId))) cancel()
  }, [canvasId, cards, cancel])

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = active.current
      if (!drag || event.pointerId !== drag.pointerId) return
      if (event.buttons === 0) { cancel(); return }
      event.preventDefault()
      setDraft({
        canvasId: drag.canvasId,
        source: drag.source,
        target: targetAtPoint(event.clientX, event.clientY, drag.source),
        pointer: toCanvasCoords(event.clientX, event.clientY),
      })
    }
    const onUp = (event: PointerEvent) => {
      const drag = active.current
      if (!drag || event.pointerId !== drag.pointerId || event.button !== 0) return
      const target = targetAtPoint(event.clientX, event.clientY, drag.source)
      const store = useStore.getState()
      if (target && store.activeCanvasId === drag.canvasId) {
        store.addConnection(drag.source.cardId, target.cardId, { fromSide: drag.source.side, toSide: target.side })
      }
      cancel()
    }
    const onCancel = (event: PointerEvent) => {
      if (event.pointerId === active.current?.pointerId) cancel()
    }
    const onKey = (event: KeyboardEvent) => {
      if (!active.current || event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      cancel()
    }
    const onWheel = (event: WheelEvent) => {
      if (!active.current) return
      // Keep port hit targets still until the pointer gesture finishes.
      event.preventDefault()
      event.stopPropagation()
    }
    document.addEventListener('pointermove', onMove, { passive: false })
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onCancel)
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('wheel', onWheel, { passive: false, capture: true })
    window.addEventListener('blur', cancel)
    window.addEventListener('fa-before-search', cancel)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onCancel)
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('wheel', onWheel, true)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('fa-before-search', cancel)
      const drag = active.current
      active.current = null
      if (drag?.element.hasPointerCapture(drag.pointerId)) drag.element.releasePointerCapture(drag.pointerId)
    }
  }, [cancel, toCanvasCoords])

  return { draft, active, start, cancel, lostCapture }
}
