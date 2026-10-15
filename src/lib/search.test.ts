import { describe, expect, it } from 'vitest'
import type { Canvas, JournalData } from '../types'
import { buildSearchIndex, searchableText, searchIndex, SEARCH_TYPE_OPTIONS } from './search'

const board = (changes: Partial<Canvas> = {}): Canvas => ({
  id: 'trading', name: '交易系统',
  cards: [{ id: 'card', title: '首次回调', content: '市场出现**回调**，观察趋势。', x: 0, y: 0, width: 300 }],
  labels: [{ id: 'label', text: '回调研究', level: 1, x: 0, y: 0, width: 300 }],
  texts: [{ id: 'text', text: '两段式回调\n原文 <保留> **文字**', x: 0, y: 0, width: 300 }],
  sections: [{ id: 'section', name: '回调资料', x: 0, y: 0, width: 500, height: 500, color: '#fff' }],
  ...changes,
})

describe('全局搜索索引', () => {
  it('覆盖所有白板实体与每日记，并保留正确的导航上下文', () => {
    const journal: JournalData = { entriesByDate: { '2026-10-15': {
      date: '2026-10-15', customTitle: '今日回调', content: '**学习记录**', createdAt: 1, updatedAt: 2,
    } } }
    const index = buildSearchIndex([board()], journal)
    const allTypes = SEARCH_TYPE_OPTIONS.flatMap(({ value }) => searchIndex(index, '', value))
    expect(allTypes.map((result) => result.type)).toEqual(['board', 'card', 'label', 'text', 'section', 'journal'])
    expect(searchIndex(index, '首次回调')[0]).toMatchObject({ id: 'card', canvasId: 'trading', canvasName: '交易系统', type: 'card' })
    expect(searchIndex(index, '今日回调')[0]).toMatchObject({ id: '2026-10-15', date: '2026-10-15', canvasId: '', canvasName: '每日记', content: '学习记录' })
    expect(searchIndex(index, '2026-10-15', 'journal')).toHaveLength(1)
  })

  it('空查询默认不展示所有内容，类型筛选可独立浏览且不丢失匹配项', () => {
    const index = buildSearchIndex([board(), board({ id: 'other', name: '另一体系' })])
    expect(searchIndex(index, ' \n\t ')).toEqual([])
    expect(searchIndex(index, '', 'board')).toHaveLength(2)
    expect(searchIndex(index, '回调', 'card')).toHaveLength(2)
    expect(searchIndex(index, '回调')).toHaveLength(8)
    expect(searchIndex(index, '不存在', 'section')).toEqual([])
  })

  it('标题和正文共同匹配多词，忽略大小写/空白并支持中文', () => {
    const index = buildSearchIndex([board({ cards: [
      { id: 'case', title: 'Search Architecture', content: '同步预览 FAST query', x: 0, y: 0, width: 300 },
    ] })])
    expect(searchIndex(index, ' SEARCH \n fast 同步 ', 'card').map((result) => result.id)).toEqual(['case'])
    expect(searchIndex(index, 'fast missing', 'card')).toEqual([])
    expect(searchIndex(index, 'ｓｅａｒｃｈ', 'card')).toHaveLength(1)
    expect(searchIndex(index, '同步', 'card')).toHaveLength(1)
  })

  it('只为 Markdown/HTML 可见文字建索引，忽略链接目标、图片和样式属性', () => {
    const content = [
      '# 可见标题',
      '[说明文字](https://example.com/hidden-target "hidden-title")',
      '[引用文本][ref]',
      '[ref]: https://example.com/reference-target',
      '![图像](data:image/png;base64,SecretBase64Payload)',
      '<span style="color: purple">彩色文字</span>',
      '<mark data-color="HiddenColor">高亮文字</mark>',
      '<script>HiddenScript</script>',
      '<!-- HiddenComment -->',
      '`Array<T>`',
      '```ts\nconst 可见代码 = true\n```',
      'Tom &amp; Jerry &#x4e2d;&#25991; &lt;转义&gt;',
    ].join('\n\n')
    const index = buildSearchIndex([board({ cards: [{ id: 'markdown', title: '测试', content, x: 0, y: 0, width: 300 }] })])
    for (const query of ['可见标题', '说明文字', '引用文本', '彩色文字', '高亮文字', 'Array<T>', '可见代码', 'Tom & Jerry', '中文', '<转义>']) {
      expect(searchIndex(index, query, 'card'), query).toHaveLength(1)
    }
    for (const query of ['hidden-target', 'hidden-title', 'reference-target', 'SecretBase64Payload', 'purple', 'HiddenColor', 'HiddenScript', 'HiddenComment']) {
      expect(searchIndex(index, query, 'card'), query).toEqual([])
    }
    expect(searchIndex(index, '可见', 'card')[0].content).not.toContain('**')
    expect(searchableText('[a **nested** label](https://example.com/path_(x))')).toBe('a nested label')
  })

  it('普通文本和标题保留字面字符，不把用户输入当 Markdown 解析', () => {
    const index = buildSearchIndex([board({ name: '<白板>', cards: [
      { id: 'literal', title: '**原样标题**', content: '', x: 0, y: 0, width: 300 },
    ] })])
    expect(searchIndex(index, '<保留>', 'text')[0].content).toContain('<保留> **文字**')
    expect(searchIndex(index, '**原样标题**', 'card')[0].title).toBe('**原样标题**')
    expect(searchIndex(index, '<白板>', 'board')).toHaveLength(1)
  })

  it('正文命中可跳出长文开头，完整预览仍保留全部文字', () => {
    const content = `${'开头内容。'.repeat(100)}命中短语${'后文内容。'.repeat(100)}`
    const index = buildSearchIndex([board({ cards: [{ id: 'long', title: '长篇笔记', content, x: 0, y: 0, width: 300 }] })])
    const result = searchIndex(index, '命中短语')[0]
    expect(result.excerpt).toContain('命中短语')
    expect(result.excerpt.startsWith('…')).toBe(true)
    expect(result.excerpt.length).toBeLessThanOrEqual(182)
    expect(result.content).toBe(content)
    // Querying does not replace the prebuilt index's preview or full body.
    expect(searchIndex(index, '', 'card')[0].excerpt).not.toContain('命中短语')
  })

  it('标题命中优先，同分稳定排序，跨白板重复 ID 保持独立且不会截断结果', () => {
    const cards = Array.from({ length: 240 }, (_, i) => ({
      id: `item-${i}`, title: '普通卡片', content: '回调', x: 0, y: 0, width: 300,
    }))
    const index = buildSearchIndex([
      board({ cards }),
      board({ id: 'second', cards: [{ ...cards[0], title: '回调' }] }),
    ])
    const results = searchIndex(index, '回调', 'card')
    expect(results).toHaveLength(241)
    expect(results[0]).toMatchObject({ canvasId: 'second', id: 'item-0' })
    expect(results.slice(1).map((result) => result.id)).toEqual(cards.map((card) => card.id))
    expect(new Set(results.map((result) => result.key)).size).toBe(241)
    expect(searchIndex(index, '回调', 'card')).toEqual(results)
  })

  it('支持旧数据缺省字段，忽略空日记并按日期稳定展示', () => {
    const entriesByDate: JournalData['entriesByDate'] = {}
    for (const date of ['2026-10-13', '2026-10-15', '2026-10-14']) {
      entriesByDate[date] = { date, content: '记录', createdAt: 1, updatedAt: 1 }
    }
    entriesByDate['2026-10-16'] = { date: '2026-10-16', content: '\n<br>\n', createdAt: 1, updatedAt: 1 }
    const index = buildSearchIndex([{ id: 'legacy', name: '', cards: [] }], { entriesByDate })
    expect(searchIndex(index, '', 'board')[0].title).toBe('未命名白板')
    expect(searchIndex(index, '', 'journal').map((result) => result.id)).toEqual(['2026-10-15', '2026-10-14', '2026-10-13'])
  })
})
