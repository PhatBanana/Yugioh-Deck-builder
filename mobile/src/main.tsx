import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { CardDetailProvider } from './components/CardDetailModal'
import AppErrorBoundary from './components/ErrorBoundary'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <CardDetailProvider>
        <App />
      </CardDetailProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
