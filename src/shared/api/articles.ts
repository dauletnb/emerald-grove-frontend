import { API_BASE_URL } from '@/config'
import { getAuthSession, clearAuthSession } from '../auth/authSession'
import { tryRefreshSession, ApiAuthError } from './auth'
import { SaveStatus } from '../types'
import type { AIResult, AIStatus, Article, ArticleNote } from '../types'
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

async function getValidAccessToken(): Promise<string> {
  const session = await getAuthSession()

  if (!session) {
    throw new ApiAuthError('Активная сессия не найдена. Войдите через всплывающее окно расширения.', 401)
  }

  return session.accessToken
}

async function buildHeaders(): Promise<HeadersInit> {
  const token = await getValidAccessToken()
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }
}

async function authFetch(url: string, options: RequestInit): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    headers: await buildHeaders(),
  })

  if (response.status === 401) {
    const newSession = await tryRefreshSession()

    if (!newSession) {
      await clearAuthSession()
      throw new ApiAuthError('Сессия истекла. Войдите снова.', 401)
    }

    return fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${newSession.accessToken}`,
      },
    })
  }

  return response
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
    isFavorite: false,
    isReadLater: false,
  }
}

export async function syncArticleToServer(article: Article): Promise<{
  status: SaveStatus
  article: OfflineArticle
}> {
  const externalId = article.id ?? crypto.randomUUID()

  const response = await authFetch(`${API_BASE_URL}/api/articles/sync`, {
    method: 'POST',
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
      throw new ApiAuthError('Сервер отклонил запрос. Войдите снова.', response.status)
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
          isFavorite: article.isFavorite ?? false,
          isReadLater: article.isReadLater ?? false,
        }

  return {
    status: data.status === 'CREATED' ? SaveStatus.SUCCESS : SaveStatus.UPDATED,
    article: offlineArticle,
  }
}

export async function deleteArticleFromServer(articleExternalId: string): Promise<void> {
  const response = await authFetch(
    `${API_BASE_URL}/api/articles/${encodeURIComponent(articleExternalId)}`,
    { method: 'DELETE' },
  )

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new ApiAuthError('Сервер отклонил запрос. Войдите снова.', response.status)
    }
    throw new Error(`Delete article failed with status ${response.status}`)
  }
}

export async function deleteNoteFromServer(articleExternalId: string, noteExternalId: string): Promise<void> {
  const response = await authFetch(
    `${API_BASE_URL}/api/articles/${encodeURIComponent(articleExternalId)}/notes/${encodeURIComponent(noteExternalId)}`,
    { method: 'DELETE' },
  )

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new ApiAuthError('Сервер отклонил запрос. Войдите снова.', response.status)
    }
    throw new Error(`Delete note failed with status ${response.status}`)
  }
}

export async function fetchArticleAI(articleId: string): Promise<{ status: AIStatus; result?: AIResult }> {
  const response = await authFetch(
    `${API_BASE_URL}/api/articles/${encodeURIComponent(articleId)}/ai`,
    { method: 'GET' },
  )

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new ApiAuthError('Сервер отклонил запрос. Войдите снова.', response.status)
    }
    throw new Error(`Fetch AI failed with status ${response.status}`)
  }

  const data = (await response.json()) as { aiStatus: AIStatus; aiResult?: AIResult }
  return { status: data.aiStatus, result: data.aiResult }
}

export async function fetchArticlesFromServer(): Promise<OfflineArticle[]> {
  const response = await authFetch(`${API_BASE_URL}/api/articles`, { method: 'GET' })

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new ApiAuthError('Сервер отклонил запрос к библиотеке. Войдите снова.', response.status)
    }
    throw new Error(`Fetch failed with status ${response.status}`)
  }

  const data = (await response.json()) as RemoteArticle[]
  return data.map(toOfflineArticle)
}
