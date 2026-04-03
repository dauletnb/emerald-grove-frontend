import { useEffect, useState } from 'react'
import { MessageType } from '../shared/types'
import type { Article } from '../shared/types'

export function PopupApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    chrome.storage.local.get(['token'], (result) => {
      setIsAuthenticated(Boolean(result.token))
    })
  }, [])

  return (
    <div className="w-80 p-4 text-sm font-sans bg-white border border-gray-100 shadow-lg">
      <h1 className="text-xl font-bold mb-4 text-green-800 flex items-center gap-2">
        Emerald Groove
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
      <p className="mb-4 text-gray-600">Войдите, чтобы сохранять статьи в библиотеку</p>
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

  const openLibrary = async () => {
    const url = chrome.runtime.getURL('src/library/index.html')
    await chrome.tabs.create({ url })
  }

  const getActiveTab = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    if (!tab?.id) {
      throw new Error('Не удалось найти активную вкладку')
    }

    if (!tab.url || !/^https?:\/\//.test(tab.url)) {
      throw new Error('Сохранение доступно только на обычных страницах сайтов')
    }

    return tab
  }

  const extractArticleFromPage = async (tabId: number): Promise<Article> => {
    const result = await chrome.tabs.sendMessage(tabId, {
      type: MessageType.GET_PAGE_DATA,
    })

    if (!result) {
      throw new Error('Не удалось получить данные статьи')
    }

    return result as Article
  }

  const saveArticle = async () => {
    setLoading(true)
    setStatusMsg('Собираю данные со страницы...')

    try {
      const tab = await getActiveTab()
      const tabId = tab.id

      if (tabId === undefined) {
        throw new Error('Не удалось найти идентификатор активной вкладки')
      }

      const pageData = await extractArticleFromPage(tabId)

      setStatusMsg('Сохраняю статью...')

      const response = await chrome.runtime.sendMessage({
        type: MessageType.SAVE_ARTICLE,
        payload: pageData,
      })

      if (response?.status === 'success') {
        setStatusMsg('Статья успешно сохранена')
      } else if (response?.status === 'updated') {
        setStatusMsg('Статья и заметки синхронизированы')
      } else if (response?.status === 'offline_saved') {
        setStatusMsg('Сервер недоступен, статья сохранена локально')
      } else if (response?.status === 'server_error') {
        setStatusMsg('Сервер вернул ошибку при сохранении')
      } else {
        setStatusMsg('Не удалось сохранить статью')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка'
      console.error(err)
      setStatusMsg(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <button
        disabled={loading}
        className={`w-full flex items-center justify-center gap-2 ${
          loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
        } text-white py-2 rounded font-medium transition-colors shadow-sm`}
        onClick={saveArticle}
      >
        {loading ? 'Сохранение...' : 'Сохранить текущую статью'}
      </button>

      {statusMsg && (
        <p className="text-[10px] text-center text-blue-600 font-medium">
          {statusMsg}
        </p>
      )}

      <button
        onClick={openLibrary}
        className="w-full border border-gray-300 hover:bg-gray-50 py-2 rounded text-gray-700 transition-colors"
      >
        Открыть библиотеку
      </button>

      <button
        onClick={() => {
          chrome.storage.local.remove('token', () => window.location.reload())
        }}
        className="w-full text-[10px] text-gray-400 hover:text-red-400 transition-colors uppercase tracking-wider"
      >
        Выйти
      </button>
    </div>
  )
}
