import { useEffect, useState, useRef } from 'react'
import { createPreviewHost, resetPreview } from './bridge'
import './preview.css'

export default function PreviewShell() {
  const [visible, setVisible] = useState(false)
  const [created, setCreated] = useState(false)
  const [ready, setReady] = useState(false)
  const hostRef = useRef<ReturnType<typeof createPreviewHost>>()
  useEffect(() => {
    const host = createPreviewHost((show) => { if (show) setCreated(true); setVisible(show) })
    hostRef.current = host
    host.listeners.set('closed', new Set([() => setCreated(false)]))
    setReady(true)
  }, [])
  return <div className="preview-shell">
    <header className="preview-banner"><strong>FloatAnchor · 即刻续写</strong><span>独立示例数据，可直接编辑测试</span><div className="preview-controls"><label><input type="checkbox" onChange={(event) => { if (hostRef.current) hostRef.current.failSaves = event.target.checked }} />模拟保存失败</label><button onClick={resetPreview}>重置示例</button>{created && !visible && <button onClick={() => setVisible(true)}>显示即刻窗口</button>}</div></header>
    {ready && <iframe className="preview-board" title="FloatAnchor 白板" src="/?surface=board" />}
    {created && <div className="preview-floating" hidden={!visible}><iframe title="FloatAnchor 即刻模式" src="/?surface=instant&mode=instant" /></div>}
  </div>
}
