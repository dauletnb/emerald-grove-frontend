import { Readability } from '@mozilla/readability'

export function normalizeText(value: string): string {
  return value.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim()
}

export function extractWithReadability(doc: Document): { title: string; content: string; excerpt: string } {
  const docClone = doc.cloneNode(true) as Document
  const reader = new Readability(docClone)
  const result = reader.parse()
  return {
    title: normalizeText(result?.title || doc.querySelector('title')?.textContent || 'No Title'),
    content: result?.content || '',
    excerpt: normalizeText(result?.excerpt || ''),
  }
}
