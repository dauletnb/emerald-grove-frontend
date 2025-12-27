import { useEffect, useState } from 'react'

export function PopupApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    chrome.storage.local.get(['token'], (result) => {
      setIsAuthenticated(Boolean(result.token))
    })
  }, [])

  return (
    <div className="w-72 p-4 text-sm font-sans">
      <h1 className="text-lg font-semibold mb-4">Digital Garden</h1>

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
    // mock login
    chrome.storage.local.set({ token: 'mock-jwt-token' }, onLogin)
  }

  return (
    <button
      className="w-full bg-green-600 text-white py-2 rounded"
      onClick={login}
    >
      Войти
    </button>
  )
}

function AuthenticatedView() {
  const saveArticle = () => {
    chrome.runtime.sendMessage({ type: 'SAVE_ARTICLE' })
  }

  return (
    <div className="space-y-2">
      <button
  className="w-full bg-blue-600 text-white py-2 rounded"
  onClick={saveArticle}
>
  Сохранить статью
</button>


      <button className="w-full border py-2 rounded">
        Открыть библиотеку
      </button>
    </div>
  )
}
