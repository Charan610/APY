import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './glassTheme.css'
import './silverTheme.css'
import './tideTheme.css'
import './theme'
import TideAtmosphere from './components/TideAtmosphere.jsx'
import App from './App.jsx'

// Restore appearance before the first React render.

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <TideAtmosphere />
    <App />
  </StrictMode>,
)
