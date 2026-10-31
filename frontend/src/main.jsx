import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './glassTheme.css'
import App from './App.jsx'

document.documentElement.dataset.theme = 'sky'

// Visual experiments stay on localhost until the design is approved.
const ThemePreview = import.meta.env.DEV
  ? (await import('./components/ThemePreview.jsx')).default
  : () => null

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemePreview />
    <App />
  </StrictMode>,
)
