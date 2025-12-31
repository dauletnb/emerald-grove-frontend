import React from 'react'
import ReactDOM from 'react-dom/client'
import { PopupApp } from './PopupApp' // Исправленный путь и имя
import '../index.css' // Путь к глобальным стилям Tailwind

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>,
)