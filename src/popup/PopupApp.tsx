import { useEffect, useState } from 'react'
import { loginUser, logoutUser, registerUser, ApiAuthError } from '../shared/api/auth'
import { getAuthSession } from '../shared/auth/authSession'
import { MessageType, SaveStatus } from '../shared/types'
import type { Article, SaveArticleResponse } from '../shared/types'
import type { AuthUser } from '../shared/auth/authSession'

const STATUS_MESSAGES: Record<SaveStatus, string> = {
  [SaveStatus.SUCCESS]: 'Статья успешно сохранена',
  [SaveStatus.UPDATED]: 'Статья уже существует и была обновлена',
  [SaveStatus.OFFLINE_SAVED]: 'Сервер недоступен, статья сохранена локально',
  [SaveStatus.SERVER_ERROR]: 'Сервер вернул ошибку при сохранении',
  [SaveStatus.FAILED]: 'Не удалось сохранить статью',
}

type AuthMode = 'login' | 'register'

export function PopupApp() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(true)

  useEffect(() => {
    void (async () => {
      const session = await getAuthSession()
      setUser(session?.user ?? null)
      setCheckingAuth(false)
    })()
  }, [])

  async function handleLoginSuccess(loggedInUser: AuthUser) {
    setUser(loggedInUser)
  }

  async function handleLogout() {
    await logoutUser()
    setUser(null)
  }

  if (checkingAuth) {
    return (
      <div className="w-80 bg-white p-4 text-sm font-sans">
        <p className="text-gray-400">Загрузка...</p>
      </div>
    )
  }

  return (
    <div className="w-80 border border-gray-100 bg-white p-4 text-sm font-sans shadow-lg">
      <h1 className="mb-4 text-xl font-bold text-green-800">Emerald Groove</h1>

      {user ? (
        <AuthenticatedView user={user} onLogout={handleLogout} />
      ) : (
        <AuthFormView onLoginSuccess={handleLoginSuccess} />
      )}
    </div>
  )
}

// --- Auth form (login / register toggle) ---

function AuthFormView({ onLoginSuccess }: { onLoginSuccess: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit() {
    setLoading(true)
    setErrorMsg('')

    try {
      const session =
        mode === 'login'
          ? await loginUser(email, password)
          : await registerUser(email, password, displayName || undefined)

      onLoginSuccess(session.user)
    } catch (err) {
      setErrorMsg(err instanceof ApiAuthError ? err.message : 'Произошла ошибка. Попробуйте снова.')
    } finally {
      setLoading(false)
    }
  }

  function toggleMode() {
    setMode((m) => (m === 'login' ? 'register' : 'login'))
    setErrorMsg('')
  }

  return (
    <div className="space-y-3">
      <p className="text-gray-600 text-xs">
        {mode === 'login' ? 'Войдите в аккаунт, чтобы сохранять статьи.' : 'Создайте аккаунт для синхронизации статей.'}
      </p>

      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-green-500"
      />

      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Пароль (мин. 8 символов)"
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-green-500"
        onKeyDown={(e) => { if (e.key === 'Enter') void handleSubmit() }}
      />

      {mode === 'register' && (
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Имя (необязательно)"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-green-500"
        />
      )}

      <button
        disabled={loading}
        onClick={() => void handleSubmit()}
        className="w-full rounded bg-green-600 px-4 py-2 text-white transition-all hover:bg-green-700 active:scale-95 disabled:bg-gray-400"
      >
        {loading ? 'Загрузка...' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
      </button>

      {errorMsg && <p className="text-xs text-red-500">{errorMsg}</p>}

      <button
        onClick={toggleMode}
        className="w-full text-xs text-gray-400 hover:text-green-600 transition-colors"
      >
        {mode === 'login' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
      </button>
    </div>
  )
}

// --- Authenticated view ---

function AuthenticatedView({ user, onLogout }: { user: AuthUser; onLogout: () => Promise<void> }) {
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')

  const openLibrary = async () => {
    const url = chrome.runtime.getURL('src/library/index.html')
    await chrome.tabs.create({ url })
  }

  const getActiveTab = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    if (!tab?.id) throw new Error('Не удалось найти активную вкладку')
    if (!tab.url || !/^https?:\/\//.test(tab.url)) {
      throw new Error('Сохранение доступно только на обычных страницах сайтов')
    }

    return tab
  }

  const saveArticle = async () => {
    setLoading(true)
    setStatusMsg('Собираю данные со страницы...')

    try {
      const tab = await getActiveTab()

      if (tab.id === undefined) throw new Error('Не удалось найти идентификатор вкладки')

      const pageData = (await chrome.tabs.sendMessage(tab.id, {
        type: MessageType.GET_PAGE_DATA,
      })) as Article | undefined

      if (!pageData) throw new Error('Не удалось получить данные статьи')

      setStatusMsg('Сохраняю статью...')

      const response = (await chrome.runtime.sendMessage({
        type: MessageType.SAVE_ARTICLE,
        payload: pageData,
      })) as SaveArticleResponse | undefined

      setStatusMsg(response?.message ?? STATUS_MESSAGES[response?.status ?? SaveStatus.FAILED])
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Неизвестная ошибка')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-center text-xs text-emerald-700 font-medium">
        {user.displayName || user.email}
      </p>

      <button
        disabled={loading}
        onClick={() => void saveArticle()}
        className={`w-full flex items-center justify-center gap-2 rounded py-2 font-medium text-white shadow-sm transition-colors ${
          loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
        }`}
      >
        {loading ? 'Сохранение...' : 'Сохранить текущую статью'}
      </button>

      {statusMsg && <p className="text-center text-xs text-blue-600">{statusMsg}</p>}

      <button
        onClick={() => void openLibrary()}
        className="w-full rounded border border-gray-300 py-2 text-gray-700 transition-colors hover:bg-gray-50"
      >
        Открыть библиотеку
      </button>

      <button
        onClick={() => void onLogout()}
        className="w-full text-xs uppercase tracking-wider text-gray-400 transition-colors hover:text-red-400"
      >
        Выйти
      </button>
    </div>
  )
}
