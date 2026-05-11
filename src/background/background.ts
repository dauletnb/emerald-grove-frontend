import { syncArticleToServer } from '../shared/api/articles'
import { ApiAuthError } from '../shared/api/auth'
import { saveArticleOffline } from '../shared/repository/db'
import { MessageType, type Article, type ExtensionMessage, type SaveArticleResponse } from '../shared/types'

const activeOperations = new Map<string, boolean>()

class ServiceWorkerKeepAlive {
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null
  private readonly KEEP_ALIVE_INTERVAL = 25_000

  start(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer)
    }

    this.keepAliveTimer = setInterval(() => {
      chrome.storage.local.get(['keep_alive'], () => {})
    }, this.KEEP_ALIVE_INTERVAL)

    console.log('Service Worker keep-alive mechanism started')
  }

  stop(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer)
      this.keepAliveTimer = null
      console.log('Service Worker keep-alive mechanism stopped')
    }
  }

  extend(): void {
    this.stop()
    this.start()
  }
}

const keepAlive = new ServiceWorkerKeepAlive()

function isSaveArticleMessage(message: ExtensionMessage): message is Extract<ExtensionMessage, { type: MessageType.SAVE_ARTICLE }> {
  return message.type === MessageType.SAVE_ARTICLE
}

async function handleSaveArticle(
  message: Extract<ExtensionMessage, { type: MessageType.SAVE_ARTICLE }>,
  sendResponse: (response: SaveArticleResponse | { status: string; message?: string; error?: string }) => void,
): Promise<void> {
  const article: Article = message.payload
  const articleId = article.id ?? crypto.randomUUID()

  try {
    keepAlive.extend()

    console.log(`Starting article sync: ${articleId}`)

    const result = await syncArticleToServer({
      ...article,
      id: articleId,
      notes: article.notes ?? [],
    })

    await saveArticleOffline(result.article)

    console.log(`Article synced successfully: ${articleId}`)
    sendResponse({ status: result.status })
  } catch (error) {
    if (error instanceof ApiAuthError && (error.status === 401 || error.status === 403)) {
      console.warn('Article sync rejected by authentication:', error)
      sendResponse({ status: 'server_error', message: error.message })
      return
    }

    console.warn('Server unavailable, saving article locally:', error)

    await saveArticleOffline({
      id: articleId,
      title: article.title,
      url: article.url,
      description: article.description ?? '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      syncStatus: 'PENDING_SYNC',
      serverPersisted: false,
      notes: article.notes ?? [],
      isFavorite: article.isFavorite,
      isReadLater: article.isReadLater,
    })

    sendResponse({ status: 'offline_saved' })
  }
}

async function handleGetPageData(
  message: ExtensionMessage,
  sendResponse: (response: unknown) => void,
  sender: chrome.runtime.MessageSender,
): Promise<void> {
  try {
    if (sender.tab?.id == null) {
      sendResponse({
        status: 'error',
        message: 'Нет доступной вкладки-источника',
      })
      return
    }

    const response = await chrome.tabs.sendMessage(sender.tab.id, message)
    sendResponse(response)
  } catch (error) {
    console.error('Failed to get page data:', error)
    sendResponse({
      status: 'error',
      message: 'Не удалось извлечь данные страницы',
    })
  }
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (isSaveArticleMessage(message)) {
    const articleId = message.payload.id ?? 'unknown'
    const operationKey = `save-${articleId}`

    if (activeOperations.has(operationKey)) {
      sendResponse({ status: 'duplicate_operation', message: 'Операция уже выполняется' })
      return false
    }

    activeOperations.set(operationKey, true)
  }

  ;(async () => {
    try {
      if (isSaveArticleMessage(message)) {
        await handleSaveArticle(message, sendResponse)
      } else if (message.type === MessageType.GET_PAGE_DATA) {
        await handleGetPageData(message, sendResponse, sender)
      }
    } catch (error) {
      console.error('Background handler failed:', error)
      sendResponse({
        status: 'error',
        message: 'Внутренняя ошибка расширения',
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      })
    } finally {
      if (isSaveArticleMessage(message)) {
        const articleId = message.payload.id ?? 'unknown'
        activeOperations.delete(`save-${articleId}`)
      }
    }
  })()

  return true
})

chrome.runtime.onStartup.addListener(() => {
  console.log('Service Worker started')
  keepAlive.start()
})

chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed')
  keepAlive.start()
})

chrome.runtime.onSuspend.addListener(() => {
  console.log('Service Worker suspending')
  keepAlive.stop()
})
