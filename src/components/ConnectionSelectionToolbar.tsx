import type { MouseEvent } from 'react'
import type { Connection, ConnectionAppearancePatch } from '../types'
import { getConnectionAppearance } from '../connectionStyle'
import './ConnectionSelectionToolbar.css'

interface Props {
  connections: Connection[]
  onChange: (patch: ConnectionAppearancePatch) => void
  onDelete: () => void
  onClear: () => void
}

function sharedValue<T>(values: T[]): T | undefined {
  return values.length > 0 && values.every((value) => value === values[0]) ? values[0] : undefined
}

function stopCanvasEvent(event: MouseEvent) {
  event.stopPropagation()
}

export default function ConnectionSelectionToolbar({ connections, onChange, onDelete, onClear }: Props) {
  const appearances = connections.map(getConnectionAppearance)
  const lineStyle = sharedValue(appearances.map((appearance) => appearance.lineStyle))
  const arrow = sharedValue(appearances.map((appearance) => appearance.arrow))
  const strokeWidth = sharedValue(appearances.map((appearance) => appearance.strokeWidth))
  if (connections.length === 0) return null

  return (
    <div
      className="connection-selection-toolbar"
      role="toolbar"
      aria-label="连线操作"
      onMouseDown={stopCanvasEvent}
      onClick={stopCanvasEvent}
      onDoubleClick={stopCanvasEvent}
      onContextMenu={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onKeyDown={(event) => {
        event.stopPropagation()
        if ((event.key === 'Delete' || event.key === 'Backspace') && !event.nativeEvent.isComposing &&
            !(event.target as HTMLElement).closest('input, select, textarea, [contenteditable]')) {
          event.preventDefault()
          onDelete()
          return
        }
        if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
          event.preventDefault()
          onClear()
        }
      }}
    >
      <div className="connection-toolbar-main">
        <span className="connection-toolbar-count" aria-live="polite">已选 <strong>{connections.length}</strong> 条</span>
        <div className="connection-toolbar-controls">
          <label className="connection-toolbar-field">
            <span>线型</span>
            <select aria-label="连线线型" value={lineStyle ?? ''} onChange={(event) => onChange({ lineStyle: event.target.value as 'solid' | 'dashed' })}>
              {lineStyle === undefined && <option value="" disabled>混合</option>}
              <option value="solid">实线</option>
              <option value="dashed">虚线</option>
            </select>
          </label>
          <label className="connection-toolbar-field">
            <span>箭头</span>
            <select aria-label="连线箭头" value={arrow ?? ''} onChange={(event) => onChange({ arrow: event.target.value as 'none' | 'end' | 'start' | 'both' })}>
              {arrow === undefined && <option value="" disabled>混合</option>}
              <option value="none">无箭头</option>
              <option value="end">正向</option>
              <option value="start">反向</option>
              <option value="both">双向</option>
            </select>
          </label>
          <label className="connection-toolbar-field">
            <span>粗细</span>
            <select aria-label="连线粗细" value={strokeWidth ?? ''} onChange={(event) => onChange({ strokeWidth: Number(event.target.value) })}>
              {strokeWidth === undefined && <option value="" disabled>混合</option>}
              {strokeWidth !== undefined && !Number.isInteger(strokeWidth) && <option value={strokeWidth}>{strokeWidth} px</option>}
              {[1, 2, 3, 4, 5, 6].map((width) => <option key={width} value={width}>{width} px</option>)}
            </select>
          </label>
        </div>
        <div className="connection-toolbar-actions">
          <button type="button" className="connection-toolbar-button is-danger" aria-label="删除选中连线" title="删除选中的连线" onClick={onDelete}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" />
            </svg>
            <span>删除</span>
          </button>
          <button type="button" className="connection-toolbar-button" aria-label="取消连线选择" title="取消选择（Esc）" onClick={onClear}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            <span>取消选择</span>
          </button>
        </div>
      </div>
    </div>
  )
}
