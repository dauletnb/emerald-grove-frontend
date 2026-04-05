import { useEffect, useState } from 'react'
import { verifyServerToken } from '../shared/api/auth'
import { clearExtensionToken, getExtensionToken, setExtensionToken } from '../shared/auth/extensionToken'
import { MessageType, SaveStatus } from '../shared/types'
import type { Article, SaveArticleResponse } from '../shared/types'

const STATUS_MESSAGES: Record<SaveStatus, string> = {
  [SaveStatus.SUCCESS]: 'Статья успешно сохранена',
  [SaveStatus.UPDATED]: 'Статья и заметки синхронизированы',
  [SaveStatus.OFFLINE_SAVED]: 'Сервер недоступен, статья сохранена локально',
  [SaveStatus.SERVER_ERROR]: 'Сервер вернул ошибку при сохранении',
  [SaveStatus.FAILED]: 'Не удалось сохранить статью',
}

export function PopupApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [tokenInput, setTokenInput] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [checkingAuth, setCheckingAuth] = useState(false)

  useEffect(() => {
    void initializeAuthState()
  }, [])

  async function initializeAuthState() {
    const token = await getExtensionToken()

    if (!token) {
      setIsAuthenticated(false)
      setTokenInput('')
      return
    }

    setTokenInput(token)
    setCheckingAuth(true)

    try {
      await verifyServerToken(token)
      setIsAuthenticated(true)
      setAuthMessage('Расширение подключено к серверу.')
    } catch (error) {
      setIsAuthenticated(false)
      setAuthMessage(error instanceof Error ? error.message : 'Не удалось проверить токен.')
    } finally {
      setCheckingAuth(false)
    }
  }

  async function handleConnect() {
    setCheckingAuth(true)
    setAuthMessage('')

    try {
      await verifyServerToken(tokenInput)
      await setExtensionToken(tokenInput)
      setIsAuthenticated(true)
      setAuthMessage('Токен сохранен. Расширение подключено к серверу.')
    } catch (error) {
      setIsAuthenticated(false)
      setAuthMessage(error instanceof Error ? error.message : 'Не удалось подключить расширение.')
    } finally {
      setCheckingAuth(false)
    }
  }

  async function handleDisconnect() {
    await clearExtensionToken()
    setIsAuthenticated(false)
    setTokenInput('')
    setAuthMessage('Подключение к серверу сброшено.')
  }

  return (
    <div className="w-80 border border-gray-100 bg-white p-4 text-sm font-sans shadow-lg">
      <h1 className="mb-4 flex items-center gap-2 text-xl font-bold text-green-800">Emerald Groove</h1>

      {isAuthenticated ? (
        <AuthenticatedView authMessage={authMessage} onDisconnect={handleDisconnect} />
      ) : (
        <AuthView
          authMessage={authMessage}
          checkingAuth={checkingAuth}
          tokenInput={tokenInput}
          onTokenInputChange={setTokenInput}
          onConnect={handleConnect}
        />
      )}
    </div>
  )
}

function AuthView({
  authMessage,
  checkingAuth,
  tokenInput,
  onTokenInputChange,
  onConnect,
}: {
  authMessage: string
  checkingAuth: boolean
  tokenInput: string
  onTokenInputChange: (value: string) => void
  onConnect: () => Promise<void>
}) {
  return (
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <p className="text-gray-700">Подключите расширение к backend через bearer token.</p>
        <input
          type="password"
          value={tokenInput}
          onChange={(event) => onTokenInputChange(event.target.value)}
          placeholder="Введите token из backend-конфига"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none transition focus:border-green-500"
        />
      </div>

      <button
        className="w-full rounded bg-green-600 px-4 py-2 text-white transition-all active:scale-95 hover:bg-green-700 disabled:bg-gray-400"
        disabled={checkingAuth}
        onClick={() => void onConnect()}
      >
        {checkingAuth ? 'Проверяю токен...' : 'Подключить расширение'}
      </button>

      <p className={`min-h-10 text-xs leading-5 ${authMessage ? 'text-gray-700' : 'text-transparent'}`}>{authMessage || '.'}</p>
    </div>
  )
}

function AuthenticatedView({
  authMessage,
  onDisconnect,
}: {
  authMessage: string
  onDisconnect: () => Promise<void>
}) {
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

      const response = (await chrome.runtime.sendMessage({
        type: MessageType.SAVE_ARTICLE,
        payload: pageData,
      })) as SaveArticleResponse | undefined

      setStatusMsg(response?.message ?? STATUS_MESSAGES[response?.status ?? SaveStatus.FAILED])
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
      {authMessage ? <p className="text-center text-[10px] font-medium text-emerald-700">{authMessage}</p> : null}

      <button
        disabled={loading}
        className={`w-full flex items-center justify-center gap-2 rounded py-2 font-medium text-white shadow-sm transition-colors ${
          loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
        }`}
        onClick={saveArticle}
      >
        {loading ? 'Сохранение...' : 'Сохранить текущую статью'}
      </button>

      {statusMsg && <p className="text-center text-[10px] font-medium text-blue-600">{statusMsg}</p>}

      <button
        onClick={openLibrary}
        className="w-full rounded border border-gray-300 py-2 text-gray-700 transition-colors hover:bg-gray-50"
      >
        Открыть библиотеку
      </button>

      <button
        onClick={() => void onDisconnect()}
        className="w-full text-[10px] uppercase tracking-wider text-gray-400 transition-colors hover:text-red-400"
      >
        Отключить токен
      </button>
    </div>
  )
}
