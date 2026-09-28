import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { MapProvider } from '@vis.gl/react-maplibre'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MapProvider>
      <App />
    </MapProvider>
  </StrictMode>,
)
