import { API_BASE_URL } from '@/config'
import { getExtensionToken } from '../auth/extensionToken'
import { ApiAuthError } from './auth'
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

async function buildHeaders() {
  const token = await getExtensionToken()

  if (!token) {
    throw new ApiAuthError('Расширение не подключено к серверу. Сначала сохраните bearer token в popup.', 401)
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
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
    headers: await buildHeaders(),
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
    if (response.status === 401 || response.status === 403) {
      throw new ApiAuthError('Сервер отклонил запрос. Проверьте сохраненный токен расширения.', response.status)
    }

    throw new Error(`Sync failed with status ${response.status}`)
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

export async function deleteArticleFromServer(articleExternalId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/articles/${encodeURIComponent(articleExternalId)}`, {
    method: 'DELETE',
    headers: await buildHeaders(),
  })

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new ApiAuthError('Сервер отклонил запрос. Проверьте сохраненный токен расширения.', response.status)
    }

    throw new Error(`Delete article failed with status ${response.status}`)
  }
}

export async function deleteNoteFromServer(articleExternalId: string, noteExternalId: string): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/api/articles/${encodeURIComponent(articleExternalId)}/notes/${encodeURIComponent(noteExternalId)}`,
    {
      method: 'DELETE',
      headers: await buildHeaders(),
    },
  )

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new ApiAuthError('Сервер отклонил запрос. Проверьте сохраненный токен расширения.', response.status)
    }

    throw new Error(`Delete note failed with status ${response.status}`)
  }
}

export async function fetchArticlesFromServer(): Promise<OfflineArticle[]> {
  const response = await fetch(`${API_BASE_URL}/api/articles`, {
    method: 'GET',
    headers: await buildHeaders(),
  })

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new ApiAuthError('Сервер отклонил загрузку библиотеки. Проверьте токен расширения.', response.status)
    }

    throw new Error(`Fetch failed with status ${response.status}`)
  }

  const data = (await response.json()) as RemoteArticle[]
  return data.map(toOfflineArticle)
}
