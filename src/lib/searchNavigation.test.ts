import { describe, expect, it } from 'vitest'
import type { Canvas } from '../types'
import { getSearchTargetBounds, getSearchTargetViewport } from './searchNavigation'

describe('search result navigation', () => {
  const canvas: Canvas = {
    id: 'board', name: '白板',
    cards: [{ id: 'card', title: '回调', content: '', x: 1200, y: -500, width: 400, height: 300 }],
    labels: [{ id: 'label', text: '标题', level: 1, x: -700, y: -900, width: 300 }],
    texts: [{ id: 'text', text: '文本', x: 50, y: 500, width: 200, height: 100 }],
    sections: [{ id: 'section', name: '分区', x: -1000, y: -1200, width: 4000, height: 3000, color: '#888' }],
  }

  it('centers a distant card at a readable scale', () => {
    const bounds = getSearchTargetBounds(canvas, { canvasId: 'board', type: 'card', id: 'card' })!
    const viewport = getSearchTargetViewport(bounds, 1200, 800)
    expect(viewport.scale).toBe(1)
    expect(viewport.panX + (bounds.x + bounds.width / 2) * viewport.scale).toBe(600)
    expect(viewport.panY + (bounds.y + bounds.height / 2) * viewport.scale).toBe(400)
  })

  it('shows a large section completely within the viewport', () => {
    const bounds = getSearchTargetBounds(canvas, { canvasId: 'board', type: 'section', id: 'section' })!
    const viewport = getSearchTargetViewport(bounds, 1200, 800)
    expect(bounds.width * viewport.scale).toBeLessThanOrEqual(1200 - 160)
    expect(bounds.height * viewport.scale).toBeLessThanOrEqual(800 - 160)
    expect(viewport.scale).toBeLessThan(1)
  })

  it('fits a board containing only titles and text', () => {
    const textBoard = { ...canvas, cards: [], sections: [] }
    expect(getSearchTargetBounds(textBoard, { canvasId: 'board', type: 'board', id: 'board' })).toEqual({
      x: -700, y: -900, width: 950, height: 1500,
    })
  })

  it('ignores missing results and results dispatched for another board', () => {
    expect(getSearchTargetBounds(canvas, { canvasId: 'other', type: 'card', id: 'card' })).toBeNull()
    expect(getSearchTargetBounds(canvas, { canvasId: 'board', type: 'text', id: 'missing' })).toBeNull()
    expect(getSearchTargetBounds(canvas, { canvasId: 'board', type: 'board', id: 'missing' })).toBeNull()
  })

  it('handles an empty board and unmeasured cards', () => {
    expect(getSearchTargetBounds({ id: 'empty', name: '', cards: [] }, { canvasId: 'empty', type: 'board', id: 'empty' })).toBeNull()
    const unmeasured = { ...canvas, cards: [{ ...canvas.cards[0], height: undefined }] }
    expect(getSearchTargetBounds(unmeasured, { canvasId: 'board', type: 'card', id: 'card' })?.height).toBe(200)
  })

  it('respects the minimum canvas zoom for exceptionally large sections', () => {
    const viewport = getSearchTargetViewport({ x: 0, y: 0, width: 100000, height: 100000 }, 320, 240)
    expect(viewport.scale).toBe(0.15)
    expect(Number.isFinite(viewport.panX)).toBe(true)
    expect(Number.isFinite(viewport.panY)).toBe(true)
  })
})
