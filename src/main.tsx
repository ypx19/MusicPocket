import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void import('virtual:pwa-register')
      .then(({ registerSW }) => {
        registerSW({ immediate: true })
      })
      .catch(() => {
        // PWA plugin unavailable in some environments
      })
  })
}
