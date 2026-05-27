import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { I18nProvider } from './i18n'
import './styles.css'

const routerBasename = (import.meta.env.VITE_BASE_PATH || '/').replace(/\/$/, '') || undefined

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <BrowserRouter basename={routerBasename}>
        <App />
      </BrowserRouter>
    </I18nProvider>
  </React.StrictMode>
)
