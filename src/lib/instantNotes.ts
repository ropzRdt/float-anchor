import type { AppData, Card, InstantCardSave, InstantCardSaveResult } from '../types'

export interface RecentInstantNote { cardId: string; openedAt: number }
export const RECENT_INSTANT_KEY = 'float-anchor-instant-recent'
export const INSTANT_DRAFT_KEY = 'float-anchor-instant-draft'
export const INSTANT_TITLE_KEY = 'float-anchor-instant-title-draft'
export const INSTANT_RECOVERY_KEY = 'float-anchor-instant-recovery'

export function rememberInstantNote(items: RecentInstantNote[], cardId: string, now = Date.now()): RecentInstantNote[] {
  return [{ cardId, openedAt: now }, ...items.filter((item) => item.cardId !== cardId)].slice(0, 10)
}

export function readRecentInstantNotes(storage: Pick<Storage, 'getItem'>): RecentInstantNote[] {
  try {
    const value = JSON.parse(storage.getItem(RECENT_INSTANT_KEY) ?? '[]')
    if (!Array.isArray(value)) return []
    const seen = new Set<string>()
    return value.filter((item) => {
      if (!item || typeof item.cardId !== 'string' || !Number.isFinite(item.openedAt) || seen.has(item.cardId)) return false
      seen.add(item.cardId)
      return true
    }).slice(0, 10)
  } catch { return [] }
}

export function findInstantNote(data: Pick<AppData, 'canvases'>, cardId: string) {
  for (const canvas of data.canvases) {
    const card = canvas.cards.find((item) => item.id === cardId)
    if (card) return { card, canvas, section: canvas.sections?.find((s) => s.cardIds?.includes(cardId)) }
  }
  return null
}

/** Apply only content to the latest snapshot. Never relocate/reflow or recreate the card. */
export function applyInstantCardSave(data: AppData, request: InstantCardSave): { data: AppData; result: InstantCardSaveResult } {
  const found = findInstantNote(data, request.cardId)
  if (!found) return { data, result: { success: false, reason: 'deleted', error: '原笔记已删除，编辑内容已保留，可另存为新笔记。' } }
  const { card } = found
  const alreadySaved = card.title === request.title && card.content === request.content
  if (!alreadySaved && (card.title !== request.baseTitle || card.content !== request.baseContent)) {
    return { data, result: { success: false, reason: 'conflict', error: '原笔记有新的修改，当前内容已保留。请另存为新笔记，避免覆盖。' } }
  }
  const updated: Card = { ...card, title: request.title, content: request.content }
  return {
    data: { ...data, canvases: data.canvases.map((canvas) => canvas.id !== found.canvas.id ? canvas : {
      ...canvas, cards: canvas.cards.map((item) => item.id === card.id ? updated : item),
    }) },
    result: { success: true, card: updated, canvasId: found.canvas.id },
  }
}
