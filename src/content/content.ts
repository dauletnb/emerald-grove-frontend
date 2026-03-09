import './styles.css'
import type { Article } from '../types'
import { MessageType, ExtensionMessage } from '../types'

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === MessageType.GET_PAGE_DATA) {
    const data: Article = {
      title: document.title || 'No Title',
      url: window.location.href,
      description: document.body.innerText.slice(0, 500),
    }
    sendResponse(data)
  }
})