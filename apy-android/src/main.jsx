import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './glassTheme.css'
import App from './App.jsx'

document.documentElement.dataset.theme = 'sky'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
