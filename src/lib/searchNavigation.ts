import type { Canvas, CanvasViewport } from '../types'

export interface SearchNavigationTarget {
  canvasId: string
  type: 'board' | 'card' | 'label' | 'text' | 'section'
  id: string
}

export interface SearchTargetBounds {
  x: number
  y: number
  width: number
  height: number
}

/** Fallback geometry also works for cards currently outside the rendered viewport. */
export function getSearchTargetBounds(canvas: Canvas, target: SearchNavigationTarget): SearchTargetBounds | null {
  if (canvas.id !== target.canvasId) return null

  if (target.type === 'card') {
    const card = canvas.cards.find((item) => item.id === target.id)
    return card ? { ...card, height: card.height ?? 200 } : null
  }
  if (target.type === 'label') {
    const label = canvas.labels?.find((item) => item.id === target.id)
    return label ? { ...label, height: 50 } : null
  }
  if (target.type === 'text') {
    const text = canvas.texts?.find((item) => item.id === target.id)
    return text ? { ...text, height: text.height ?? 24 } : null
  }
  if (target.type === 'section') {
    return canvas.sections?.find((item) => item.id === target.id) ?? null
  }
  if (target.type !== 'board' || target.id !== canvas.id) return null

  const bounds: SearchTargetBounds[] = [
    ...canvas.cards.map((card) => ({ ...card, height: card.height ?? 200 })),
    ...(canvas.labels ?? []).map((label) => ({ ...label, height: 50 })),
    ...(canvas.texts ?? []).map((text) => ({ ...text, height: text.height ?? 24 })),
    ...(canvas.sections ?? []),
  ]
  if (bounds.length === 0) return null

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const item of bounds) {
    minX = Math.min(minX, item.x)
    minY = Math.min(minY, item.y)
    maxX = Math.max(maxX, item.x + item.width)
    maxY = Math.max(maxY, item.y + item.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

export function getSearchTargetViewport(
  bounds: SearchTargetBounds,
  viewportWidth: number,
  viewportHeight: number,
): CanvasViewport {
  const padding = Math.min(80, viewportWidth * 0.1, viewportHeight * 0.1)
  const fitScale = Math.min(
    Math.max(1, viewportWidth - padding * 2) / Math.max(1, bounds.width),
    Math.max(1, viewportHeight - padding * 2) / Math.max(1, bounds.height),
  )
  // Keep small results legible; fit large cards and sections within the normal zoom limits.
  const scale = Math.max(0.15, Math.min(1, fitScale))
  return {
    panX: viewportWidth / 2 - (bounds.x + bounds.width / 2) * scale,
    panY: viewportHeight / 2 - (bounds.y + bounds.height / 2) * scale,
    scale,
  }
}
