import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import InstantModeWindow from './components/InstantModeWindow'
import './index.css'
import PreviewShell from './preview/PreviewShell'
import { installPreviewBridge } from './preview/bridge'

const browserPreview = import.meta.env.VITE_BROWSER_PREVIEW === 'true'
const previewShell = browserPreview && window === window.parent
if (browserPreview && !previewShell) installPreviewBridge()

const isInstantMode = new URLSearchParams(window.location.search).get('mode') === 'instant'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {previewShell ? <PreviewShell /> : isInstantMode ? <InstantModeWindow /> : <App />}
  </React.StrictMode>,
)
