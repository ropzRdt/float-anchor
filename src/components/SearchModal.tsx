import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { useStore } from '../store'
import { buildSearchIndex, searchIndex, SEARCH_TYPE_LABELS, SEARCH_TYPE_OPTIONS } from '../lib/search'
import type { SearchResult, SearchType } from '../lib/search'
import './search.css'

function SearchIcon({ type }: { type?: SearchType }) {
  let shape: ReactNode
  switch (type) {
    case 'board': shape = <><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Z" /><path d="M9 3v16M15 5v16" /></>; break
    case 'card': shape = <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>; break
    case 'label': shape = <><path d="M5 5v14M19 5v14M5 12h14" /></>; break
    case 'text': shape = <><path d="M4 5h16M12 5v15M8 20h8" /></>; break
    case 'section': shape = <rect x="3" y="4" width="18" height="16" rx="2" strokeDasharray="4 3" />; break
    case 'journal': shape = <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 11h18M8 15h3" /></>; break
    default: shape = <><circle cx="10.5" cy="10.5" r="6.8" /><path d="m16 16 4.5 4.5" /></>
  }
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shape}</svg>
}

function Highlight({ text, query }: { text: string; query: string }) {
  const terms = [...new Set(query.trim().split(/\s+/).filter(Boolean))].sort((a, b) => b.length - a.length)
  if (!terms.length) return <>{text}</>
  const pattern = new RegExp(`(${terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'giu')
  return <>{text.split(pattern).map((part, index) => index % 2 ? <mark key={index}>{part}</mark> : part)}</>
}

const PAGE_SIZE = 30
const resultId = (key: string) => `search-result-${encodeURIComponent(key)}`

export default function SearchModal({ onClose }: { onClose: () => void }) {
  const canvases = useStore((state) => state.canvases)
  const journal = useStore((state) => state.journal)
  const [query, setQuery] = useState('')
  const [type, setType] = useState<SearchType | null>(null)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [groupLimits, setGroupLimits] = useState<Record<string, number>>({})
  // Keep typing responsive; every new input schedules a search, including IME composition.
  const deferredQuery = useDeferredValue(query)
  const index = useMemo(() => buildSearchIndex(canvases, journal), [canvases, journal])
  const results = useMemo(() => searchIndex(index, deferredQuery, type), [index, deferredQuery, type])
  const groups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; results: SearchResult[] }>()
    for (const result of results) {
      const id = result.type === 'journal' ? 'journal' : `board:${result.canvasId}`
      if (!map.has(id)) map.set(id, { id, name: result.canvasName, results: [] })
      map.get(id)!.results.push(result)
    }
    return [...map.values()]
  }, [results])
  const visibleResults = groups.flatMap((group) => group.results.slice(0, groupLimits[group.id] ?? PAGE_SIZE))
  const selected = visibleResults.find((result) => result.key === selectedKey) ?? visibleResults[0]
  const expanded = !!query.trim() || type !== null
  const pending = query !== deferredQuery
  const dialogRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigatingRef = useRef(false)
  const composingRef = useRef(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const body = document.querySelector<HTMLElement>('.app-body')
    const wasInert = body?.inert ?? false
    if (body) body.inert = true
    const frame = requestAnimationFrame(() => inputRef.current?.focus())
    return () => {
      cancelAnimationFrame(frame)
      if (body) body.inert = wasInert
      if (!navigatingRef.current && previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  useEffect(() => {
    if (selected) document.getElementById(resultId(selected.key))?.scrollIntoView({ block: 'nearest' })
  }, [selected?.key])

  const resetSelection = () => {
    setSelectedKey(null)
    setGroupLimits({})
    if (listRef.current) listRef.current.scrollTop = 0
  }

  const openResult = (result: SearchResult) => {
    const store = useStore.getState()
    navigatingRef.current = true
    if (result.type === 'journal') {
      store.setJournalSelectedDate(result.id)
      store.setJournalViewMode('detail')
    } else {
      store.setActiveCanvas(result.canvasId)
      const detail = { canvasId: result.canvasId, type: result.type, id: result.id }
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('fa-focus-search-result', { detail }))
      }))
    }
    onClose()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation()
    // Enter/Escape belong to the input method until the candidate has been committed.
    if (event.nativeEvent.isComposing || composingRef.current || event.keyCode === 229) return
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    } else if (event.key === 'Tab') {
      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('input, select, button:not([disabled]):not([tabindex="-1"]), [tabindex="0"]') ?? [])
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    } else if (event.target === inputRef.current && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      if (!visibleResults.length) return
      const current = visibleResults.findIndex((result) => result.key === selected?.key)
      const next = (current + (event.key === 'ArrowDown' ? 1 : -1) + visibleResults.length) % visibleResults.length
      setSelectedKey(visibleResults[next].key)
    } else if (event.target === inputRef.current && event.key === 'Enter' && selected && !pending) {
      event.preventDefault()
      openResult(selected)
    }
  }

  const selectedCanvas = selected && canvases.find((canvas) => canvas.id === selected.canvasId)
  const section = selected?.type === 'section' ? selectedCanvas?.sections?.find((item) => item.id === selected.id) : undefined
  const childCards = selected?.type === 'board' ? selectedCanvas?.cards : section ? selectedCanvas?.cards.filter((card) => section.cardIds?.includes(card.id)) : undefined

  return (
    <div className="search-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div ref={dialogRef} className={`search-dialog${expanded ? ' is-expanded' : ''}`} role="dialog" aria-modal="true" aria-label="搜索所有内容" onKeyDown={onKeyDown}>
        <div className="search-header">
          <div className="search-input-row">
            <input
              ref={inputRef}
              className="search-query"
              aria-label="搜索关键词"
              placeholder="搜索任何内容…"
              value={query}
              role="combobox"
              aria-expanded={expanded && visibleResults.length > 0}
              aria-controls={visibleResults.length ? 'global-search-results' : undefined}
              aria-autocomplete="list"
              aria-activedescendant={selected ? resultId(selected.key) : undefined}
              onChange={(event) => { setQuery(event.target.value); resetSelection() }}
              onCompositionStart={() => { composingRef.current = true }}
              onCompositionEnd={() => { composingRef.current = false }}
              autoComplete="off"
              spellCheck={false}
            />
            {query && <button className="search-clear-query" aria-label="清空关键词" onClick={() => { setQuery(''); resetSelection(); inputRef.current?.focus() }}>×</button>}
            <button className="search-close" onClick={onClose} aria-label="关闭搜索">Esc</button>
          </div>
          <div className="search-filter-row">
            <div className={`search-type${type ? ' is-filtered' : ''}`}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="2" y="2" width="6" height="6" rx="1" /><rect x="12" y="2" width="6" height="6" rx="1" /><rect x="2" y="12" width="6" height="6" rx="1" /><rect x="12" y="12" width="6" height="6" rx="1" /></svg>
              <select aria-label="搜索类型" value={type ?? ''} onChange={(event) => { setType((event.target.value || null) as SearchType | null); resetSelection(); inputRef.current?.focus() }}>
                <option value="">Type</option>
                {SEARCH_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
            </div>
            {type && <button className="search-clear-type" onClick={() => { setType(null); resetSelection(); inputRef.current?.focus() }} aria-label="清除类型筛选" title="搜索所有类型">×</button>}
            <span className="search-scope">{type ? `只查找${SEARCH_TYPE_LABELS[type]}` : '所有白板 · 所有类型'}</span>
            {pending && <span className="search-pending" role="status">查询中…</span>}
          </div>
        </div>

        {!expanded ? (
          <div className="search-idle"><SearchIcon /><span>输入关键词，即时查找并预览你的内容</span></div>
        ) : results.length === 0 ? (
          <div className="search-empty" role="status">
            <span className="search-empty-icon"><SearchIcon /></span>
            <strong>{pending ? '正在查找…' : '没有找到相关内容'}</strong>
            <p>{type ? '试试其他关键词，或清除类型筛选扩大范围。' : '换个关键词试试，支持搜索标题和正文。'}</p>
          </div>
        ) : (
          <div className="search-content" aria-busy={pending}>
            <div className="search-results" ref={listRef}>
              <div id="global-search-results" role="listbox" aria-label="搜索结果" className="search-result-groups">
                {groups.map((group) => (
                  <div className="search-result-group" role="group" aria-label={group.name} key={group.id}>
                    <div className="search-group-heading"><SearchIcon type={group.id === 'journal' ? 'journal' : 'board'} /><span>{group.name}</span><small>{group.results.length}</small></div>
                    {group.results.slice(0, groupLimits[group.id] ?? PAGE_SIZE).map((result) => (
                      <button
                        id={resultId(result.key)}
                        key={result.key}
                        className={`search-result${selected?.key === result.key ? ' is-selected' : ''}`}
                        type="button"
                        role="option"
                        tabIndex={-1}
                        aria-selected={selected?.key === result.key}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => { setSelectedKey(result.key); inputRef.current?.focus() }}
                        onDoubleClick={() => { if (!pending) openResult(result) }}
                      >
                        <span className={`search-result-icon type-${result.type}`}><SearchIcon type={result.type} /></span>
                        <span className="search-result-copy">
                          <span className="search-result-title"><Highlight text={result.title} query={deferredQuery} /></span>
                          {result.excerpt && <span className="search-result-excerpt"><Highlight text={result.excerpt} query={deferredQuery} /></span>}
                          <span className="search-result-meta">{SEARCH_TYPE_LABELS[result.type]}{result.date ? ` · ${result.date}` : ''}</span>
                        </span>
                        {selected?.key === result.key && <span className="search-result-enter" aria-hidden="true">↵</span>}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
              {groups.filter((group) => group.results.length > (groupLimits[group.id] ?? PAGE_SIZE)).map((group) => (
                <button className="search-show-more" key={group.id} onClick={() => setGroupLimits((limits) => ({ ...limits, [group.id]: (limits[group.id] ?? PAGE_SIZE) + PAGE_SIZE }))}>显示「{group.name}」的更多结果（还有 {group.results.length - (groupLimits[group.id] ?? PAGE_SIZE)} 项）</button>
              ))}
            </div>
            {selected && <aside className="search-preview" aria-label="内容预览">
              <div className="search-preview-location"><SearchIcon type={selected.type} /><span>{SEARCH_TYPE_LABELS[selected.type]}</span><span className="search-preview-separator">/</span><span>{selected.canvasName}</span></div>
              <article className="search-preview-paper" key={selected.key}>
                <h2><Highlight text={selected.title} query={deferredQuery} /></h2>
                {selected.date && <div className="search-preview-date">{selected.date}</div>}
                {selected.content && selected.content !== selected.title && <div className="search-preview-text"><Highlight text={selected.content} query={deferredQuery} /></div>}
                {childCards && <div className="search-preview-children">
                  <span>{selected.type === 'board' ? '白板内容' : '分区内的卡片'} · {childCards.length} 张卡片</span>
                  {childCards.slice(0, 6).map((card) => <div className="search-preview-child" key={card.id}><SearchIcon type="card" /><Highlight text={card.title || '无标题卡片'} query={deferredQuery} /></div>)}
                  {childCards.length > 6 && <small>打开后查看全部 {childCards.length} 张卡片</small>}
                </div>}
                {!selected.content && !childCards?.length && <p className="search-preview-placeholder">{selected.type === 'journal' ? '打开以查看这篇每日记。' : `打开以在白板中查看此${SEARCH_TYPE_LABELS[selected.type]}。`}</p>}
              </article>
            </aside>}
          </div>
        )}

        <footer className="search-footer">
          <span className="search-count" role="status" aria-live="polite">{expanded ? `${results.length} 个结果${groups.length ? ` · ${groups.length} 个${groups.some((group) => group.id === 'journal') ? '分组' : '白板'}` : ''}` : 'Quick find'}</span>
          <div className="search-footer-actions"><span className="search-key-hint"><kbd>↑</kbd><kbd>↓</kbd> 预览</span><button className="search-open" disabled={!selected || pending} onClick={() => selected && openResult(selected)}>打开 <span>↵</span></button></div>
        </footer>
      </div>
    </div>
  )
}
