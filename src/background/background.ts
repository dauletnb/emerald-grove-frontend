import { syncArticleToServer } from '../shared/api/articles'
import { saveArticleOffline } from '../shared/repository/db'
import { MessageType, type ExtensionMessage } from '../shared/types'

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _, sendResponse) => {
  if (message.type === MessageType.SAVE_ARTICLE) {
    const article = message.payload

    ;(async () => {
      const articleId = article.id ?? crypto.randomUUID()

      try {
        const result = await syncArticleToServer({
          ...article,
          id: articleId,
          notes: article.notes ?? [],
        })

        await saveArticleOffline(result.article)
        sendResponse({ status: result.status })
      } catch (error) {
        console.warn('Server unavailable, saving article locally', error)

        await saveArticleOffline({
          id: articleId,
          title: article.title,
          url: article.url,
          description: article.description ?? '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          syncStatus: 'PENDING_SYNC',
          notes: article.notes ?? [],
        })

        sendResponse({ status: 'offline_saved' })
      }
    })()

    return true
  }
})
