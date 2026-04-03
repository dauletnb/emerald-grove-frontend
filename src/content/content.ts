import './styles.css'
import type { Article } from '../shared/types'
import { MessageType, type ExtensionMessage } from '../shared/types'

function extractArticleFromDocument(doc: Document): Pick<Article, 'title' | 'description'> {
  const title =
    doc.querySelector('title')?.textContent ||
    doc.querySelector('h1')?.textContent ||
    'No Title'

    // Сначала пробуем мета-тег — он чище
  const metaDescription =
    doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
    doc.querySelector('meta[property="og:description"]')?.getAttribute('content')

  if (metaDescription) {
    return { title, description: metaDescription }
  }

  const contentSelectors = [
    'article',
    '[role="article"]',
    '.article-content',
    '.post-content',
    '.entry-content',
    '.content',
    'main',
  ]

  let contentElement: Element | null = null

  for (const selector of contentSelectors) {
    const element = doc.querySelector(selector)
    if (element) {
      contentElement = element
      break
    }
  }

  if (!contentElement) {
    contentElement = doc.body
  }

  const textContent = contentElement?.textContent || ''
  const description = textContent.slice(0, 500).trim()

  return {
    title,
    description,
  }
}

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
        title: document.title || 'No Title',
        url: window.location.href,
        description: document.body?.innerText?.slice(0, 500) ?? '',
      })
    }
  }
})
