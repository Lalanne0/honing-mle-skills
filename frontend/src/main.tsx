import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DesignPage } from './design/DesignPage.tsx'
import { pageFor } from './routes.ts'

const page = pageFor(window.location.pathname) === 'design' ? <DesignPage /> : <App />

createRoot(document.getElementById('root')!).render(<StrictMode>{page}</StrictMode>)
