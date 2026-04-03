import { API_BASE_URL } from '@/config'
import type { Article, ArticleNote, SaveStatus } from '../types'
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
  article: RemoteArticle
}

function buildHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: 'Bearer mock-jwt-token',
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

export async function syncArticleToServer(article: Article): Promise<{
  status: SaveStatus
  article: OfflineArticle
}> {
  const externalId = article.id ?? crypto.randomUUID()

  const response = await fetch(`${API_BASE_URL}/api/articles/sync`, {
    method: 'POST',
    headers: buildHeaders(),
    body: JSON.stringify({
      externalId,
      url: article.url,
      title: article.title,
      description: article.description,
      notes: (article.notes ?? []).map((note) => ({
        id: note.id,
        type: note.type,
        content: note.content,
        createdAt: note.createdAt,
      })),
    }),
  })

  if (!response.ok) {
    throw new Error(`Sync failed with status ${response.status}`)
  }

  const data = (await response.json()) as SyncArticleApiResponse

  return {
    status: data.status === 'CREATED' ? 'success' : 'updated',
    article: toOfflineArticle(data.article),
  }
}

export async function fetchArticlesFromServer(): Promise<OfflineArticle[]> {
  const response = await fetch(`${API_BASE_URL}/api/articles`, {
    method: 'GET',
    headers: buildHeaders(),
  })

  if (!response.ok) {
    throw new Error(`Fetch failed with status ${response.status}`)
  }

  const data = (await response.json()) as RemoteArticle[]
  return data.map(toOfflineArticle)
}
