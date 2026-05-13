import './styles.css'
import type { Article } from '../shared/types'
import { MessageType, type ExtensionMessage } from '../shared/types'
import { extractWithReadability } from './extraction'

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === MessageType.GET_PAGE_DATA) {
    try {
      const extracted = extractWithReadability(document)
      const data: Article = {
        title: extracted.title,
        description: extracted.excerpt,
        content: extracted.content || undefined,
        url: window.location.href,
        notes: [],
        isFavorite: false,
        isReadLater: false,
      }

      sendResponse(data)
    } catch (error) {
      console.warn('Readability extraction failed, using fallback', error)

      sendResponse({
        title: document.title || 'No Title',
        url: window.location.href,
        description: (document.body?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 500),
        notes: [],
        isFavorite: false,
        isReadLater: false,
      })
    }
  }
})
