import type { AppData, InstantModeTarget } from '../types'
import { applyInstantCardSave } from '../lib/instantNotes'
import { INSTANT_DRAFT_KEY, INSTANT_TITLE_KEY, INSTANT_RECOVERY_KEY, RECENT_INSTANT_KEY } from '../lib/instantNotes'
import { mergeAppData } from '../lib/mergeData'

type Listener = (payload?: any) => void
interface PreviewHost {
  data: AppData
  target: InstantModeTarget | null
  editingId: string | null
  failSaves: boolean
  listeners: Map<string, Set<Listener>>
  show: (visible: boolean) => void
  emit: (event: string, payload?: any) => void
  persist: () => void
}
const DATA_KEY = 'float-anchor-interactive-preview-v1'
export function resetPreview() {
  for (const key of [DATA_KEY, INSTANT_DRAFT_KEY, INSTANT_TITLE_KEY, INSTANT_RECOVERY_KEY, RECENT_INSTANT_KEY]) localStorage.removeItem(key)
  window.location.reload()
}
export const seed: AppData = {
  canvases: [
    { id: 'work', name: '工作记录', cards: [
      { id: 'discussion', title: '产品讨论记录', content: '## 今天的想法\n\n让记录可以随时继续，不打断正在做的事。\n\n- 先记下关键结论\n- 在同一篇笔记里继续补充\n- 整理到白板后，仍然可以随时打开', x: 65, y: 90, width: 373, height: 255 },
      { id: 'reading', title: '阅读摘记', content: '把零散的想法放在一起，慢慢形成自己的理解。', x: 475, y: 90, width: 300, height: 170 },
    ], sections: [{ id: 'ideas', name: '灵感收集', x: 40, y: 35, width: 760, height: 340, color: '#34d399', cardIds: ['discussion', 'reading'] }], connections: [] },
    { id: 'life', name: '生活随记', cards: [{ id: 'weekend', title: '周末徒步计划', content: '确认路线，准备饮水和轻便装备。', x: 65, y: 90, width: 373, height: 220 }] },
  ], activeCanvasId: 'work', activeView: 'boards', boardViewMode: 'canvas', journal: { entriesByDate: {} },
}
export function createPreviewHost(show: PreviewHost['show']): PreviewHost {
  let data = structuredClone(seed)
  try { const saved = JSON.parse(localStorage.getItem(DATA_KEY) ?? 'null'); if (saved?.canvases?.length) data = saved } catch {}
  const host: PreviewHost = {
    data, target: null, editingId: null, failSaves: false, listeners: new Map(), show,
    emit(event, payload) { host.listeners.get(event)?.forEach((fn) => fn(payload)) },
    persist() { localStorage.setItem(DATA_KEY, JSON.stringify(host.data)) },
  }
  ;(window as any).__floatAnchorPreview = host
  return host
}
export function installPreviewBridge() {
  const host = (window.parent as any).__floatAnchorPreview as PreviewHost
  let baseline = structuredClone(host.data)
  const subscriptions: Array<() => void> = []
  const on = (name: string, fn: Listener) => {
    if (!host.listeners.has(name)) host.listeners.set(name, new Set())
    host.listeners.get(name)!.add(fn)
    const off = () => { host.listeners.get(name)?.delete(fn) }
    subscriptions.push(off)
    return off
  }
  window.addEventListener('unload', () => subscriptions.forEach((off) => off()))
  let settings = { theme: localStorage.getItem('float-anchor-preview-theme') || 'light', syncProvider: 'none' }
  const api = {
    readData: async () => { baseline = structuredClone(host.data); return structuredClone(host.data) },
    writeData: async (data: AppData) => {
      if (host.failSaves) return false
      try { host.data = mergeAppData(baseline, data, host.data); baseline = structuredClone(data); host.persist(); return true } catch { return false }
    },
    readSettings: async () => settings,
    writeSettings: async (value: typeof settings) => { settings = { ...value, syncProvider: 'none' }; localStorage.setItem('float-anchor-preview-theme', settings.theme); return true },
    getPlatform: async () => 'darwin',
    openInstantMode: async (cardId?: string) => {
      if (cardId || !host.target) host.target = { cardId: cardId ?? null, requestId: Date.now() }
      host.show(true); host.emit('target', host.target); return true
    },
    getInstantTarget: async () => host.target,
    onInstantTarget: (cb: Listener) => on('target', cb),
    saveInstantCard: async (request: any) => {
      if (host.failSaves) return { success: false, reason: 'error', error: '保存失败，内容已保留，请重试。（预览模拟）' }
      const output = applyInstantCardSave(host.data, request)
      if (output.result.success) { host.data = output.data; host.persist(); host.emit('data') }
      return output.result
    },
    setInstantEditingCard: async (id: string | null) => { host.editingId = id; host.emit('editing', id) },
    getInstantEditingCard: async () => host.editingId,
    onInstantEditingCardChanged: (cb: Listener) => on('editing', cb),
    onInstantCloseRequested: (cb: Listener) => on('close-request', cb),
    closeInstantMode: () => { host.editingId = null; host.target = null; host.emit('editing', null); host.emit('closed'); host.show(false) },
    hideInstantMode: () => host.show(false),
    setInstantAlwaysOnTop: async (value: boolean) => value,
    instantDataChanged: () => host.emit('data'),
    onInstantDataChanged: (cb: Listener) => on('data', cb),
    showCardInBoard: async (id: string) => { api.closeInstantMode(); host.emit('navigate', id) },
    onShowCardInBoard: (cb: Listener) => on('navigate', cb),
    syncAuto: async () => ({ success: true, action: 'up-to-date' }),
    syncStartup: async () => ({ success: true, action: 'up-to-date' }),
    syncPeriodic: async () => ({ success: true, action: 'up-to-date' }),
    checkUpdate: async () => ({ hasUpdate: false, currentVersion: '本地预览' }),
    githubHasToken: async () => ({ has: false }),
    saveImage: async () => ({}),
  }
  window.electronAPI = new Proxy(api, { get(target, key: keyof typeof api) { return target[key] ?? (String(key).startsWith('on') ? () => () => {} : async () => null) } }) as any
}
