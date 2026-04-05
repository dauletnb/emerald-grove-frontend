import './styles.css'
import type { Article } from '../shared/types'
import { MessageType, type ExtensionMessage } from '../shared/types'
import { extractArticleFromDocument, extractCleanText, normalizeText } from './extraction'

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === MessageType.GET_PAGE_DATA) {
    try {
      const data: Article = {
        ...extractArticleFromDocument(document),
        url: window.location.href,
      }

      sendResponse(data)
    } catch (error) {
      console.warn('Article extraction failed, using fallback', error)

      sendResponse({
        title: normalizeText(document.title || 'No Title'),
        url: window.location.href,
        description: extractCleanText(document.body),
      })
    }
  }
})
