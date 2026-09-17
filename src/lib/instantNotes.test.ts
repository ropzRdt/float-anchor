import { describe, expect, it } from 'vitest'
import type { AppData } from '../types'
import { applyInstantCardSave, rememberInstantNote, readRecentInstantNotes } from './instantNotes'
import { mergeAppData } from './mergeData'

const initial = (): AppData => ({ activeCanvasId: 'board', canvases: [{
  id: 'board', name: '工作记录', cards: [
    { id: 'a', title: 'A', content: 'original', x: 80, y: 60, width: 373, height: 230, instantOrder: 1 },
    { id: 'b', title: 'B', content: 'other', x: 480, y: 60, width: 373 },
  ], sections: [{ id: 's', name: '分区', x: 40, y: 20, width: 900, height: 500, color: '#fff', cardIds: ['a', 'b'] }],
  connections: [{ id: 'link', fromCardId: 'a', toCardId: 'b' }],
}] })
const request = { cardId: 'a', title: 'A', content: 'continued', baseTitle: 'A', baseContent: 'original' }

describe('即刻续写往返与多窗口保存', () => {
  it('续写只更新原笔记，保留 ID、布局、分区和连接', () => {
    const before = initial()
    const saved = applyInstantCardSave(before, request)
    expect(saved.result.success).toBe(true)
    expect(saved.data.canvases[0]).toEqual({ ...before.canvases[0], cards: [{ ...before.canvases[0].cards[0], content: 'continued' }, before.canvases[0].cards[1]] })
    expect(before.canvases[0].cards[0].content).toBe('original')
    expect(applyInstantCardSave(saved.data, request).data).toEqual(saved.data)
  })
  it('卡片跨白板移动后仍然更新同一个 ID', () => {
    const data = initial()
    const moved = data.canvases[0].cards.shift()!
    data.canvases.push({ id: 'destination', name: '目标白板', cards: [moved] })
    const saved = applyInstantCardSave(data, request)
    expect(saved.result).toMatchObject({ success: true, canvasId: 'destination' })
    expect(saved.data.canvases[0].cards).toHaveLength(1)
    expect(saved.data.canvases[1].cards[0].content).toBe('continued')
  })
  it('另一个窗口修改 B 后，续写 A 和旧主窗口快照均保留两份改动', () => {
    const base = initial()
    const instant = applyInstantCardSave(base, request).data
    const oldMain = structuredClone(base)
    oldMain.canvases[0].cards[1].content = 'new B'
    const merged = mergeAppData(base, oldMain, instant)
    expect(merged.canvases[0].cards.map((c) => c.content)).toEqual(['continued', 'new B'])
  })
  it('旧快照的几何修改不能覆盖即刻窗口的标题和正文', () => {
    const base = initial()
    const current = applyInstantCardSave(base, { ...request, title: 'new A' }).data
    const main = structuredClone(base)
    main.canvases[0].cards[0].x = 555
    const merged = mergeAppData(base, main, current)
    expect(merged.canvases[0].cards[0]).toMatchObject({ x: 555, title: 'new A', content: 'continued' })
  })
  it('同一正文发生冲突时拒绝覆盖，两种保存路径都保留最新内容', () => {
    const base = initial()
    const current = applyInstantCardSave(base, request).data
    const newer = { ...request, content: 'conflicting' }
    const saved = applyInstantCardSave(current, newer)
    expect(saved.result).toMatchObject({ success: false, reason: 'conflict' })
    expect(saved.data).toEqual(current)
    const main = structuredClone(base)
    main.canvases[0].cards[0].content = 'conflicting'
    expect(() => mergeAppData(base, main, current)).toThrow()
  })
  it('已删除的卡片不会被编辑或旧快照复活', () => {
    const base = initial()
    const current = structuredClone(base)
    current.canvases[0].cards.shift()
    expect(applyInstantCardSave(current, request).result).toMatchObject({ success: false, reason: 'deleted' })
    const stale = structuredClone(base)
    stale.canvases[0].cards[1].title = 'B changed'
    expect(mergeAppData(base, stale, current).canvases[0].cards.map((c) => c.id)).toEqual(['b'])
  })
  it('不同窗口同时新增卡片不会丢失任何一张', () => {
    const base = initial(), main = initial(), other = initial()
    main.canvases[0].cards.push({ id: 'new-main', title: 'main', content: '', x: 0, y: 0, width: 200 })
    other.canvases[0].cards.push({ id: 'new-instant', title: 'instant', content: '', x: 0, y: 0, width: 200 })
    expect(mergeAppData(base, main, other).canvases[0].cards.map((c) => c.id)).toEqual(['a', 'b', 'new-instant', 'new-main'])
  })
})

describe('最近笔记', () => {
  it('A → B → A 变成 A、B，不重复；序列化后可以恢复', () => {
    let items = rememberInstantNote([], 'a', 1)
    items = rememberInstantNote(items, 'b', 2)
    items = rememberInstantNote(items, 'a', 3)
    expect(items).toEqual([{ cardId: 'a', openedAt: 3 }, { cardId: 'b', openedAt: 2 }])
    expect(readRecentInstantNotes({ getItem: () => JSON.stringify(items) })).toEqual(items)
  })
  it('最多保留最近 10 篇，并容忍损坏的本地记录', () => {
    let items = rememberInstantNote([], 'a', 1)
    for (let i = 0; i < 12; i++) items = rememberInstantNote(items, String(i), i + 2)
    expect(items).toHaveLength(10)
    expect(items[0].cardId).toBe('11')
    expect(readRecentInstantNotes({ getItem: () => '{broken' })).toEqual([])
  })
})
