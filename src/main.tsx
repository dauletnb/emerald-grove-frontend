import React from 'react'
import ReactDOM from 'react-dom/client'
import { PopupApp } from './App' // Здесь должно быть имя функции из твоего App.tsx
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>,
)