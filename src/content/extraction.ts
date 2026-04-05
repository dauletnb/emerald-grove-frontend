import type { Article } from '../shared/types'

const DESCRIPTION_MAX_LENGTH = 500
const NOISY_CONTENT_SELECTORS = [
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'canvas',
  'iframe',
  'header',
  'footer',
  'nav',
  'aside',
  '[aria-hidden="true"]',
]

export function normalizeText(value: string): string {
  return value.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim()
}

function decodeHtmlEntities(value: string, doc?: Document): string {
  if (!value) {
    return ''
  }

  if (!doc) {
    return value
  }

  const textarea = doc.createElement('textarea')
  textarea.innerHTML = value
  return textarea.value
}

export function extractCleanText(element: Element | null): string {
  if (!element) {
    return ''
  }

  const clone = element.cloneNode(true) as HTMLElement

  for (const selector of NOISY_CONTENT_SELECTORS) {
    clone.querySelectorAll(selector).forEach((node) => node.remove())
  }

  const text = typeof clone.innerText === 'string' ? clone.innerText : clone.textContent ?? ''
  return normalizeText(text).slice(0, DESCRIPTION_MAX_LENGTH)
}

export function extractArticleFromDocument(doc: Document): Pick<Article, 'title' | 'description'> {
  const title = normalizeText(doc.querySelector('title')?.textContent || doc.querySelector('h1')?.textContent || 'No Title')

  const rawMetaDescription =
    doc.querySelector('meta[name="description"]')?.getAttribute('content') ||
    doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
    ''

  const metaDescription = normalizeText(decodeHtmlEntities(rawMetaDescription, doc))

  if (metaDescription) {
    return { title, description: metaDescription.slice(0, DESCRIPTION_MAX_LENGTH) }
  }

  const contentSelectors = ['article', '[role="article"]', '.article-content', '.post-content', '.entry-content', '.content', 'main']

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

  return {
    title,
    description: extractCleanText(contentElement),
  }
}
