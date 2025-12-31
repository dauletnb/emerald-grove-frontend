import { useEffect, useState } from 'react'

export function PopupApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    chrome.storage.local.get(['token'], (result) => {
      setIsAuthenticated(Boolean(result.token))
    })
  }, [])

  return (
    <div className="w-80 p-4 text-sm font-sans bg-white">
      <h1 className="text-xl font-bold mb-4 text-green-800">Digital Garden</h1>

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
    <div className="text-center">
      <p className="mb-4 text-gray-600">Войдите, чтобы сохранять заметки</p>
      <button
        className="w-full bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded transition-colors"
        onClick={login}
      >
        Войти в аккаунт
      </button>
    </div>
  )
}

function AuthenticatedView() {
  const [loading, setLoading] = useState(false)

  const saveArticle = async () => {
    setLoading(true)

    // 1. Получаем активную вкладку
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    if (tab.id) {
      // 2. Запрашиваем данные у контент-скрипта этой вкладки
      chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_DATA' }, (pageData) => {
        
        // 3. Отправляем эти данные в background для сохранения
        chrome.runtime.sendMessage({ 
          type: 'SAVE_ARTICLE', 
          payload: pageData 
        }, (response) => {
          setLoading(false)
          if (response?.status === 'success') {
            alert(`Сохранено: ${pageData.title}`)
          }
        })
      })
    }
  }

  return (
    <div className="space-y-3">
      <button
        disabled={loading}
        className={`w-full ${loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'} text-white py-2 rounded font-medium transition-colors`}
        onClick={saveArticle}
      >
        {loading ? 'Сохранение...' : 'Сохранить статью'}
      </button>

      <button className="w-full border border-gray-300 hover:bg-gray-50 py-2 rounded text-gray-700 transition-colors">
        Открыть библиотеку
      </button>
    </div>
  )
}