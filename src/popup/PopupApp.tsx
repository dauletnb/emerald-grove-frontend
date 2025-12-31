import { useEffect, useState } from 'react'

export function PopupApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    // Проверяем наличие токена при запуске
    chrome.storage.local.get(['token'], (result) => {
      setIsAuthenticated(Boolean(result.token))
    })
  }, [])

  return (
    <div className="w-80 p-4 text-sm font-sans bg-white border border-gray-100 shadow-lg">
      <h1 className="text-xl font-bold mb-4 text-green-800 flex items-center gap-2">
        🌿 Digital Garden
      </h1>

      {isAuthenticated ? (
        <AuthenticatedView />
      ) : (
        <AuthView onLogin={() => setIsAuthenticated(true)} />
      )}
    </div>
  )
}

function AuthView({ onLogin }: { onLogin: () => void }) {
  const login = () => {
    chrome.storage.local.set({ token: 'mock-jwt-token' }, onLogin)
  }

  return (
    <div className="text-center py-4">
      <p className="mb-4 text-gray-600">Войдите, чтобы сохранять заметки в свой сад</p>
      <button
        className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded transition-all active:scale-95"
        onClick={login}
      >
        Войти в аккаунт
      </button>
    </div>
  )
}

function AuthenticatedView() {
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')

  const saveArticle = async () => {
    setLoading(true)
    setStatusMsg('Сбор данных со страницы...')

    try {
      // 1. Получаем активную вкладку
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

      if (!tab?.id) {
        throw new Error('Не удалось найти активную вкладку')
      }

      // 2. Запрашиваем данные у контент-скрипта (content.ts)
      chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_DATA' }, (pageData) => {
        
        // ПРОВЕРКА: Если контент-скрипт не ответил или ответил undefined
        if (chrome.runtime.lastError || !pageData) {
          console.error("Ошибка получения данных:", chrome.runtime.lastError)
          alert("Ошибка: Обновите страницу сайта, которую хотите сохранить!")
          setLoading(false)
          return
        }

        console.log('Данные получены от контент-скрипта:', pageData)
        setStatusMsg('Отправка на бэкенд...')

        // 3. Отправляем эти данные в background.ts для fetch-запроса
        chrome.runtime.sendMessage({ 
          type: 'SAVE_ARTICLE', 
          payload: pageData 
        }, (response) => {
          setLoading(false)
          
          if (response?.status === 'success') {
            setStatusMsg('✅ Успешно сохранено!')
            setTimeout(() => setStatusMsg(''), 3000)
          } else {
            console.error('Ошибка бэкенда:', response?.message)
            alert(`Ошибка сервера: ${response?.message || 'Неизвестная ошибка'}`)
            setStatusMsg('❌ Ошибка сохранения')
          }
        })
      })
    } catch (err: any) {
      console.error(err)
      alert(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="p-3 bg-gray-50 rounded-md border border-gray-100">
        <p className="text-xs text-gray-500 mb-1">Действие</p>
        <button
          disabled={loading}
          className={`w-full flex items-center justify-center gap-2 ${
            loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
          } text-white py-2 rounded font-medium transition-colors shadow-sm`}
          onClick={saveArticle}
        >
          {loading ? (
            <>
              <span className="animate-spin">🌀</span> Сохранение...
            </>
          ) : (
            'Сохранить текущую статью'
          )}
        </button>
        {statusMsg && (
          <p className="text-[10px] mt-2 text-center text-blue-600 font-medium animate-pulse">
            {statusMsg}
          </p>
        )}
      </div>

      <button className="w-full border border-gray-300 hover:bg-gray-50 py-2 rounded text-gray-700 transition-colors">
        Открыть библиотеку
      </button>
      
      <button 
        onClick={() => {
          chrome.storage.local.remove('token', () => window.location.reload())
        }}
        className="w-full text-[10px] text-gray-400 hover:text-red-400 transition-colors uppercase tracking-wider"
      >
        Выйти из системы
      </button>
    </div>
  )
}