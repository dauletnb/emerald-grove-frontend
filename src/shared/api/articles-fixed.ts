import { API_BASE_URL } from '@/config'
import { SaveStatus } from '../types'
import type { Article, ArticleNote } from '../types'
import type { OfflineArticle } from '../repository/db'

type RemoteArticle = {
  articleId: number
  externalId: string | null
  url: string
  title: string
  description: string
  isRead: boolean
  createdAt: number | null
  updatedAt: number | null
  notes: Array<{
    id: string
    type: ArticleNote['type']
    content: string
    createdAt: number | null
  }>
}

type SyncArticleApiResponse = {
  status: 'CREATED' | 'UPDATED'
  article?: RemoteArticle
  articleId?: number
}

function buildHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: 'Bearer configured-extension-token',
  }
}

export function toOfflineArticle(remoteArticle: RemoteArticle): OfflineArticle {
  const id = remoteArticle.externalId ?? `server-${remoteArticle.articleId}`

  return {
    id,
    title: remoteArticle.title,
    url: remoteArticle.url,
    description: remoteArticle.description ?? '',
    createdAt: remoteArticle.createdAt ?? Date.now(),
    updatedAt: remoteArticle.updatedAt ?? remoteArticle.createdAt ?? Date.now(),
    syncStatus: 'SYNCED',
    notes: (remoteArticle.notes ?? []).map((note) => ({
      id: note.id,
      type: note.type,
      content: note.content,
      createdAt: note.createdAt ?? Date.now(),
    })),
  }
}

/**
 * Валидация и санитизация контента перед отправкой на бэкенд
 */
function sanitizeContent(content: string): string {
  if (!content || typeof content !== 'string') {
    return ''
  }
  
  // Базовая санитизация - удаляем потенциально опасные конструкции
  return content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim()
}

/**
 * Проверка валидности типа заметки
 */
function isValidNoteType(type: string): type is 'IDEA' | 'TASK' | 'QUESTION' {
  return ['IDEA', 'TASK', 'QUESTION'].includes(type)
}

export async function syncArticleToServer(article: Article): Promise<{
  status: SaveStatus
  article: OfflineArticle
}> {
  const externalId = article.id ?? crypto.randomUUID()

  // Валидация и санитизация данных перед отправкой
  const sanitizedNotes = (article.notes ?? [])
    .filter(note => isValidNoteType(note.type))
    .map(note => ({
      id: note.id,
      type: note.type,
      content: sanitizeContent(note.content),
      createdAt: note.createdAt,
    }))

  const payload = {
    externalId,
    url: article.url,
    title: article.title,
    description: sanitizeContent(article.description),
    notes: sanitizedNotes,
  }

  console.log('Отправляемые данные на бэкенд:', JSON.stringify(payload, null, 2))

  const response = await fetch(`${API_BASE_URL}/api/articles/sync`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`Sync failed with status ${response.status}:`, errorText)
    throw new Error(`Sync failed with status ${response.status}: ${errorText}`)
  }

  const data = (await response.json()) as SyncArticleApiResponse
  const offlineArticle =
    data.article != null
      ? toOfflineArticle(data.article)
      : {
          id: externalId,
          title: article.title,
          url: article.url,
          description: article.description ?? '',
          createdAt: article.createdAt ?? Date.now(),
          updatedAt: Date.now(),
          syncStatus: 'SYNCED' as const,
          notes: article.notes ?? [],
        }

  return {
    status: data.status === 'CREATED' ? SaveStatus.SUCCESS : SaveStatus.UPDATED,
    article: offlineArticle,
  }
}

export async function fetchArticlesFromServer(): Promise<OfflineArticle[]> {
  const response = await fetch(`${API_BASE_URL}/api/articles`, {
    method: 'GET',
    headers: buildHeaders(),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`Fetch failed with status ${response.status}:`, errorText)
    throw new Error(`Fetch failed with status ${response.status}: ${errorText}`)
  }

  const data = (await response.json()) as RemoteArticle[]
  return data.map(toOfflineArticle)
}
