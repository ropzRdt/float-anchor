import { marked } from 'marked'
import type { Canvas, JournalData } from '../types'

export type SearchType = 'board' | 'card' | 'label' | 'text' | 'section' | 'journal'

export const SEARCH_TYPE_LABELS: Record<SearchType, string> = {
  board: '白板',
  card: '卡片',
  label: '标题',
  text: '文本',
  section: '分区',
  journal: '每日记',
}

export const SEARCH_TYPE_OPTIONS: { value: SearchType; label: string }[] = (
  Object.keys(SEARCH_TYPE_LABELS) as SearchType[]
).map((value) => ({ value, label: SEARCH_TYPE_LABELS[value] }))

export interface SearchResult {
  /** Includes the board and type because imported objects may share an id. */
  key: string
  id: string
  type: SearchType
  canvasId: string
  canvasName: string
  title: string
  /** Full visible text for the preview, without Markdown/HTML or link targets. */
  content: string
  excerpt: string
  date?: string
}

interface IndexedSearchResult {
  result: SearchResult
  titleSearch: string
  contentSearch: string
  combinedSearch: string
  excerptContent: string
  order: number
}

/** Build this when data changes, rather than parsing Markdown on every keystroke. */
export type SearchIndex = readonly IndexedSearchResult[]

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ensp: ' ', emsp: ' ', thinsp: ' ', hellip: '…', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', middot: '·',
  copy: '©', reg: '®', trade: '™', laquo: '«', raquo: '»',
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z\d]+);/gi, (entity, name: string) => {
    if (name[0] !== '#') return ENTITIES[name] ?? entity
    const hexadecimal = name[1].toLowerCase() === 'x'
    const codePoint = Number.parseInt(name.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10)
    return codePoint > 0 && codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff)
      ? String.fromCodePoint(codePoint)
      : '�'
  })
}

/** Read the same Markdown + inline HTML that cards and the journal render. */
export function searchableText(markdown: string): string {
  if (!markdown.trim()) return ''
  // Let the existing Markdown parser handle nested links, reference links, code,
  // and image data URLs. Only visible text from its output enters the index.
  const html = marked.parse(markdown, { async: false, gfm: true }) as string
  const text = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, (tag) => (
      /^<\/?(?:address|article|aside|blockquote|br|dd|div|dl|dt|figcaption|figure|footer|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|tbody|td|th|thead|tr|ul)\b/i.test(tag)
        ? '\n'
        : ''
    ))
  // Decode after stripping tags so escaped code like `Array<T>` is preserved.
  return decodeEntities(text)
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()
}

function textTitle(text: string, fallback: string): string {
  return text.trim().split('\n')[0]?.trim() || fallback
}

function makeExcerpt(compact: string, normalized: string, terms: readonly string[]): string {
  if (compact.length <= 180) return compact
  const positions = terms.map((term) => normalized.indexOf(term)).filter((position) => position >= 0)
  const firstMatch = positions.length ? Math.min(...positions) : 0
  // NFKC can expand a character (for example ﬃ), so map the match back only
  // when that uncommon transformation actually changes the string length.
  let originalMatch = firstMatch
  if (normalized.length !== compact.length) {
    let normalizedOffset = 0
    originalMatch = 0
    for (const character of compact) {
      if (normalizedOffset >= firstMatch) break
      normalizedOffset += character.normalize('NFKC').toLowerCase().length
      originalMatch += character.length
    }
  }
  const start = Math.max(0, originalMatch - 48)
  const end = Math.min(compact.length, start + 180)
  return `${start ? '…' : ''}${compact.slice(start, end)}${end < compact.length ? '…' : ''}`
}

export function buildSearchIndex(canvases: readonly Canvas[], journal?: JournalData): SearchIndex {
  const index: IndexedSearchResult[] = []
  const add = (result: Omit<SearchResult, 'key' | 'excerpt'>) => {
    const titleSearch = normalize(result.title)
    const contentSearch = normalize(result.content)
    const excerptContent = result.content.replace(/\s+/g, ' ').trim()
    const searchableDate = result.date ? ` ${result.date}` : ''
    index.push({
      result: {
        ...result,
        key: JSON.stringify([result.canvasId, result.type, result.id]),
        excerpt: makeExcerpt(excerptContent, contentSearch, []),
      },
      titleSearch,
      contentSearch,
      combinedSearch: `${titleSearch} ${contentSearch}${searchableDate}`,
      excerptContent,
      order: index.length,
    })
  }

  for (const canvas of canvases) {
    const canvasName = canvas.name.trim() || '未命名白板'
    const context = { canvasId: canvas.id, canvasName }
    add({ ...context, id: canvas.id, type: 'board', title: canvasName, content: '' })
    for (const card of canvas.cards) {
      add({ ...context, id: card.id, type: 'card', title: card.title.trim() || '无标题卡片', content: searchableText(card.content) })
    }
    for (const label of canvas.labels ?? []) {
      add({ ...context, id: label.id, type: 'label', title: textTitle(label.text, '无标题'), content: label.text.trim() })
    }
    for (const text of canvas.texts ?? []) {
      add({ ...context, id: text.id, type: 'text', title: textTitle(text.text, '空白文本'), content: text.text.trim() })
    }
    for (const section of canvas.sections ?? []) {
      add({ ...context, id: section.id, type: 'section', title: section.name.trim() || '未命名分区', content: '' })
    }
  }

  // Match the journal's newest-first review list, independent of object order.
  const entries = Object.values(journal?.entriesByDate ?? {}).sort((a, b) => b.date.localeCompare(a.date))
  for (const entry of entries) {
    const content = searchableText(entry.content)
    const hasImage = /!\[[^\]]*\]\(|<img\b/i.test(entry.content)
    if (!entry.customTitle?.trim() && !content && !hasImage) continue
    add({
      id: entry.date,
      date: entry.date,
      type: 'journal',
      canvasId: '',
      canvasName: '每日记',
      title: entry.customTitle?.trim() || entry.date,
      content,
    })
  }
  return index
}

/** All query terms must match. No result cap: the UI owns rendering/grouping. */
export function searchIndex(index: SearchIndex, query: string, type: SearchType | null = null): SearchResult[] {
  const normalizedQuery = normalize(query)
  if (!normalizedQuery && !type) return []
  const terms = [...new Set(normalizedQuery.split(' ').filter(Boolean))]
  const matches: { entry: IndexedSearchResult; score: number }[] = []

  for (const entry of index) {
    if (type && entry.result.type !== type) continue
    if (!terms.every((term) => entry.combinedSearch.includes(term))) continue
    const score = normalizedQuery ? (
      (entry.titleSearch === normalizedQuery ? 100 : 0)
      + (entry.titleSearch.includes(normalizedQuery) ? 30 : 0)
      + terms.filter((term) => entry.titleSearch.includes(term)).length * 10
      + (entry.contentSearch.includes(normalizedQuery) ? 5 : 0)
    ) : 0
    matches.push({ entry, score })
  }

  matches.sort((a, b) => b.score - a.score || a.entry.order - b.entry.order)
  return matches.map(({ entry }) => ({
    ...entry.result,
    excerpt: terms.length ? makeExcerpt(entry.excerptContent, entry.contentSearch, terms) : entry.result.excerpt,
  }))
}
